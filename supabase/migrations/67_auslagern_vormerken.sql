-- =====================================================================
-- Migration 67 – Auslagern erst beim Abschließen (05.10.2026, v111).
--
-- Bisher galt ein Reifensatz in dem Moment als ausgelagert, in dem man im Auftrag „Auslagern"
-- tippte. Der Auftrag liegt aber oft Tage vor dem Termin – und so lange war das Regal falsch: Der
-- Platz stand als frei da, der Satz war aus dem Auftrag, aus dem Kundenfenster und aus der Suche
-- im Lager verschwunden, obwohl die Reifen noch im Fach lagen. Wer zum Termin ins Lager ging, fand
-- am Auftrag keinen Platz mehr.
--
-- Jetzt wird im Auftrag nur VORGEMERKT. Ein Satz ist
--
--   im Regal      removed_at null,     entnahme_order_id null
--   vorgemerkt    removed_at null,     entnahme_order_id = der Auftrag, mit dem er rausgeht
--   ausgelagert   removed_at gesetzt   (entnahme_order_id = der Auftrag, oder null ohne Auftrag)
--
-- Vorgemerkt belegt der Satz seinen Platz weiter. Den Rest erledigt die Datenbank am Auftrag
-- (`auftrag_lager_entnahme()`, AFTER UPDATE auf `orders`):
--   - Abschließen (→ erledigt): alle vorgemerkten Sätze werden ausgelagert.
--   - Wiedereröffnen (erledigt → offen/in Arbeit): seine Sätze kommen als vorgemerkt zurück auf
--     ihren alten Platz – sofern dort inzwischen nichts anderes liegt und der Satz nicht in den
--     Verkauf gegangen ist (Migration 64). Sonst bleiben sie draußen.
--   - Stornieren oder Löschen: Die Vormerkung fällt weg, die Reifen bleiben im Regal.
--
-- Die Lagergebühr kommt weiter gleich beim Vormerken auf den Auftrag. Neu hält die Position fest,
-- zu welchem Satz sie gehört (`order_articles.lager_satz_id`) – damit nimmt „Zurücknehmen" die
-- Gebühr mit, statt dass jemand raten muss, welche der Positionen gemeint ist.
--
-- Vormerken geht nur für einen offenen oder laufenden Auftrag desselben Kunden und nicht für einen
-- Satz, der schon für einen anderen Auftrag vorgemerkt ist (`tire_storage_vormerkung_pruefen()`).
--
-- Bestand: Sätze, die für einen noch NICHT abgeschlossenen Auftrag schon ausgelagert wurden – genau
-- der Fall, um den es hier geht –, kommen als vorgemerkt zurück, wenn ihr Platz noch frei ist.
--
-- Reihenfolge: dieses Skript zuerst, dann die Dateien von v111. Ältere Fassungen der App lagern
-- weiter sofort aus; das bleibt zulässig.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Eine Entnahme-Zuordnung ohne Entnahme ist jetzt kein Widerspruch mehr, sondern eine
--    Vormerkung. Die Prüfung aus Migration 46 fällt.
-- ---------------------------------------------------------------------
alter table public.tire_storage drop constraint if exists tire_storage_entnahme_braucht_datum;

comment on column public.tire_storage.entnahme_order_id is
  'Mit welchem Auftrag geht dieser Satz heraus? Bei removed_at null: vorgemerkt, ausgelagert wird beim Abschließen (Migration 67). Bei gesetztem removed_at: der Auftrag, in dem er herausgegeben wurde – dort steht die Lagergebühr. Null: liegt ohne Vormerkung, oder wurde ohne Auftrag entnommen.';

-- ---------------------------------------------------------------------
-- 2. Welche Gebühr gehört zu welchem Satz
-- ---------------------------------------------------------------------
alter table public.order_articles
  add column if not exists lager_satz_id uuid references public.tire_storage(id) on delete set null;

comment on column public.order_articles.lager_satz_id is
  'Lagergebühr für diesen Reifensatz (Migration 67). Nimmt man die Vormerkung zurück, geht die Position mit.';

create index if not exists order_articles_lager_satz_idx on public.order_articles (lager_satz_id) where lager_satz_id is not null;

-- ---------------------------------------------------------------------
-- 3. Vormerken nur für einen offenen Auftrag desselben Kunden
-- ---------------------------------------------------------------------
create or replace function public.tire_storage_vormerkung_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auftrag record;
  bisher record;
begin
  -- Nur eine Vormerkung, die gerade entsteht, wechselt oder zurückkommt, wird geprüft.
  if new.entnahme_order_id is null or new.removed_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.entnahme_order_id is not distinct from old.entnahme_order_id
     and old.removed_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.entnahme_order_id is not null and old.removed_at is null
     and old.entnahme_order_id is distinct from new.entnahme_order_id then
    select o.order_number into bisher from public.orders o where o.id = old.entnahme_order_id;
    raise exception 'Dieser Satz ist schon für Auftrag % vorgemerkt. Erst dort die Vormerkung zurücknehmen.', coalesce(bisher.order_number::text, '?');
  end if;

  select o.customer_id, o.status, o.deleted_at, o.order_number into auftrag
    from public.orders o where o.id = new.entnahme_order_id;
  if not found or auftrag.deleted_at is not null then
    raise exception 'Der Auftrag zum Vormerken gibt es nicht (mehr).';
  end if;
  if auftrag.customer_id is distinct from new.customer_id then
    raise exception 'Ein Satz lässt sich nur für einen Auftrag desselben Kunden vormerken.';
  end if;
  if auftrag.status not in ('offen', 'in_arbeit') then
    raise exception 'Auftrag % ist abgeschlossen oder storniert – dafür lässt sich nichts mehr vormerken.', auftrag.order_number;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tire_storage_vormerkung_pruefen on public.tire_storage;
create trigger trg_tire_storage_vormerkung_pruefen
  before insert or update of entnahme_order_id, removed_at on public.tire_storage
  for each row execute procedure public.tire_storage_vormerkung_pruefen();

-- ---------------------------------------------------------------------
-- 4. Zurück ins Regal, wenn der Platz noch frei ist
--
-- Für Wiedereröffnen und den Bestand. Einzeln und der Reihe nach, damit zwei Sätze, die auf
-- denselben Platz wollten, nicht am Unique-Index (Migration 15) scheitern: Der erste bekommt ihn,
-- der zweite bleibt draußen. Zuerst der zuletzt ausgelagerte.
-- ---------------------------------------------------------------------
create or replace function public.lager_vormerkung_zurueck(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  satz record;
  zahl integer := 0;
begin
  for satz in
    select ts.id, ts.storage_slot_id
      from public.tire_storage ts
     where ts.entnahme_order_id = p_order_id and ts.removed_at is not null
     order by ts.removed_at desc, ts.id
  loop
    continue when exists (select 1 from public.tire_storage a
                           where a.storage_slot_id = satz.storage_slot_id and a.removed_at is null);
    continue when exists (select 1 from public.verkaufsreifen v
                           where v.storage_slot_id = satz.storage_slot_id and v.bestand > 0);
    continue when exists (select 1 from public.verkaufsreifen v where v.herkunft_satz_id = satz.id);
    update public.tire_storage set removed_at = null where id = satz.id;
    zahl := zahl + 1;
  end loop;
  return zahl;
end;
$$;

revoke all on function public.lager_vormerkung_zurueck(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Der Auftrag entscheidet, wann ausgelagert wird
--
-- Ein eigener Trigger, wie `einlagerung_vollstaendig` (Migration 30) und
-- `auftrag_reifenverkauf_buchen` (Migration 61) – nicht noch eine Erweiterung von
-- `enforce_order_status_transition`. AFTER, damit nur ausgelagert wird, was tatsächlich
-- abgeschlossen ist: Scheitert der Abschluss an einer anderen Prüfung, bleibt alles im Regal.
-- `security definer`, weil auch abschließen darf, wer im Lager nichts schreiben darf.
-- ---------------------------------------------------------------------
create or replace function public.auftrag_lager_entnahme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'erledigt' and old.status is distinct from 'erledigt' then
    update public.tire_storage set removed_at = now()
     where entnahme_order_id = new.id and removed_at is null;
  elsif old.status = 'erledigt' and new.status in ('offen', 'in_arbeit') then
    perform public.lager_vormerkung_zurueck(new.id);
  end if;

  if (new.status = 'storniert' and old.status is distinct from 'storniert')
     or (new.deleted_at is not null and old.deleted_at is null) then
    update public.tire_storage set entnahme_order_id = null
     where entnahme_order_id = new.id and removed_at is null;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_auftrag_lager_entnahme on public.orders;
create trigger trg_auftrag_lager_entnahme
  after update of status, deleted_at on public.orders
  for each row execute procedure public.auftrag_lager_entnahme();

-- ---------------------------------------------------------------------
-- 6. Bestand: zu früh ausgelagert für einen noch offenen Auftrag → vorgemerkt
-- ---------------------------------------------------------------------
do $$
declare
  auftrag record;
  zahl integer := 0;
begin
  for auftrag in
    select distinct o.id
      from public.orders o
      join public.tire_storage ts on ts.entnahme_order_id = o.id and ts.removed_at is not null
     where o.status in ('offen', 'in_arbeit') and o.deleted_at is null
  loop
    zahl := zahl + public.lager_vormerkung_zurueck(auftrag.id);
  end loop;
  raise notice 'Migration 67: % Sätze zurück ins Regal (vorgemerkt).', zahl;
end $$;

commit;

-- Kontrolle nach dem Lauf – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen:
select 'Spalte order_articles.lager_satz_id' as pruefung,
       (exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'order_articles' and column_name = 'lager_satz_id'))::text as ergebnis
union all
select 'Trigger am Auftrag',
       (exists (select 1 from pg_trigger where tgname = 'trg_auftrag_lager_entnahme'))::text
union all
select 'Sätze vorgemerkt',
       (select count(*)::text from public.tire_storage where entnahme_order_id is not null and removed_at is null);
