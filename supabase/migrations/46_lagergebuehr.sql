-- Migration 46: Die Einlagerungsgebühr wird beim AUSLAGERN fällig
--
-- ============================================================================
-- DER FEHLER, DEN DIESE MIGRATION BEHEBT
-- ============================================================================
-- `articles.braucht_lagerplatz` aus Migration 22 trägt ZWEI Aussagen in einem Haken:
--
--   1. Vorgang: An diesem Auftrag wurden Reifen angenommen, also muss ein Platz belegt sein.
--   2. Geld:    Diese Leistung wird berechnet.
--
-- Beim EINLAGERN stimmt nur (1). Wie viele Monate der Satz liegen wird, weiß niemand – eine
-- Gebühr lässt sich nicht beziffern. Beim AUSLAGERN stimmt nur (2): Jetzt steht die Dauer
-- fest, aber es wird kein Platz belegt, sondern einer frei. Trägt man den Artikel dort ein,
-- verlangt der Trigger aus Migration 22 einen Lagerplatz für einen Vorgang, der das Gegenteil
-- tut – der Auftrag ließe sich nicht abschließen.
--
-- Das ist mein Fehler aus Migration 22: eine Abrechnungsangabe an einen Vorgangs-Zwang
-- gebunden. Konzept der Auflösung: `claude/lagergebuehr.md`.
--
-- ============================================================================
-- WAS AN DIE STELLE TRITT
-- ============================================================================
--   * `articles.abrechnungsart`: 'normal' oder 'lagergebuehr'. Ein Lagergebühr-Artikel wird
--     beim Einlagern NIE verlangt und beim Auslagern vorgeschlagen, Menge = Monate.
--   * `tire_storage.entnahme_order_id`: In welchem Auftrag wurde der Satz herausgegeben?
--     Damit steht fest, wo die Gebühr berechnet wurde – und ob überhaupt.
--   * Der Abschluss-Zwang aus Migration 22 entfällt. An seine Stelle tritt eine FRAGE in der
--     Oberfläche („Reifenwechsel, aber nichts eingelagert – nimmt der Kunde die alten mit?").
--     Ein Zwang wäre hier falsch: Genug Kunden nehmen ihre Reifen mit.
--
-- `braucht_lagerplatz` bleibt als Spalte stehen und wird nicht mehr gelesen; sie fällt in
-- einer späteren Migration. Dieselbe Reihenfolge wie bei `discount_percent` (38 → 39).
--
-- ============================================================================
-- NACH DEM LAUF BITTE DEN ARTIKELSTAMM PRÜFEN
-- ============================================================================
-- Die Übernahme macht aus JEDEM Artikel mit `braucht_lagerplatz` einen Lagergebühr-Artikel.
-- Migration 22 hatte den Haken seinerzeit automatisch gesetzt, bei allem, was „einlager" im
-- Namen trug. Was damals geraten wurde, wird hier übernommen – und kann falsch sein. Die
-- Migration meldet am Ende, welche Artikel sie umgestellt hat; zwei Klicks im Artikelstamm
-- setzen es zurück.

begin;

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Die Abrechnungsart am Artikel
--
-- Ein Textfeld mit Prüfregel statt eines zweiten Hakens: Es kommen absehbar weitere Arten
-- dazu (Pauschale je Saison, Einmalgebühr), und drei Haken, von denen immer nur einer gesetzt
-- sein darf, sind ein Auswahlfeld mit zusätzlichen Fehlermöglichkeiten.
-- ---------------------------------------------------------------------
alter table public.articles
  add column if not exists abrechnungsart text not null default 'normal';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.articles'::regclass and conname = 'articles_abrechnungsart_bekannt'
  ) then
    alter table public.articles
      add constraint articles_abrechnungsart_bekannt
      check (abrechnungsart in ('normal', 'lagergebuehr'));
  end if;
end $$;

comment on column public.articles.abrechnungsart is
  'normal = wird eingetragen, wenn die Leistung erbracht ist. lagergebuehr = wird beim Auslagern fällig, Menge = Monate.';

-- ---------------------------------------------------------------------
-- 2. Übernahme – und eine Meldung darüber, was übernommen wurde
-- ---------------------------------------------------------------------
do $$
declare
  namen text;
  anzahl int;
begin
  select count(*), string_agg(short_name, ', ' order by short_name)
    into anzahl, namen
    from public.articles
   where braucht_lagerplatz and abrechnungsart = 'normal';

  update public.articles
     set abrechnungsart = 'lagergebuehr'
   where braucht_lagerplatz and abrechnungsart = 'normal';

  if anzahl > 0 then
    raise notice 'Als Lagergebühr eingestuft (bitte im Artikelstamm prüfen): %', namen;
  else
    raise notice 'Kein Artikel mit „braucht Lagerplatz" gefunden – nichts umgestellt.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Woher der Satz wieder herauskam
--
-- `order_id` sagt seit Migration 22, in welchem Auftrag eingelagert wurde. Für die Abrechnung
-- fehlt das Gegenstück: in welchem Auftrag wurde herausgegeben. Ohne das lässt sich nicht
-- sagen, ob die Gebühr je berechnet wurde – und beim zweiten Blick auf denselben Satz wüsste
-- niemand, ob er schon abgerechnet ist.
-- ---------------------------------------------------------------------
alter table public.tire_storage
  add column if not exists entnahme_order_id uuid references public.orders(id) on delete set null;

comment on column public.tire_storage.entnahme_order_id is
  'In welchem Auftrag wurde dieser Satz herausgegeben? Dort steht die Lagergebühr. Null bei Sätzen, die noch liegen oder die ohne Auftrag entnommen wurden.';

create index if not exists tire_storage_entnahme_idx on public.tire_storage (entnahme_order_id);

-- Eine Entnahme-Zuordnung ohne Entnahme ist ein Widerspruch.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.tire_storage'::regclass and conname = 'tire_storage_entnahme_braucht_datum'
  ) then
    alter table public.tire_storage
      add constraint tire_storage_entnahme_braucht_datum
      check (entnahme_order_id is null or removed_at is not null);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Die sinnvolle Hälfte des alten Hakens: die Frage
--
-- `braucht_lagerplatz` hieß auch „bei dieser Leistung fallen Altreifen an". Diese Hälfte
-- bleibt nützlich – nur als Frage, nicht als Zwang. Sie hängt an einem ANDEREN Artikel als
-- die Gebühr: Die Gebühr steht auf „Reifeneinlagerung pro Monat", die Frage gehört an
-- „Reifenwechsel" / „Räder montieren".
--
-- Deshalb wird hier bewusst NICHTS übernommen. Der alte Haken saß auf dem Gebührenartikel;
-- ihn auf die neue Spalte zu kopieren hieße, die Frage genau dort zu stellen, wo sie sinnlos
-- ist. Der Haken wird im Artikelstamm von Hand gesetzt – einmal, an den Wechsel-Leistungen.
-- Bis dahin fragt die Anwendung nicht; sie rät lieber nicht, als falsch zu raten.
-- ---------------------------------------------------------------------
alter table public.articles
  add column if not exists fragt_einlagerung boolean not null default false;

comment on column public.articles.fragt_einlagerung is
  'Bei dieser Leistung fallen Altreifen an. Beim Abschließen fragt die Oberflaeche nach, wenn nichts eingelagert wurde. Kein Zwang - genug Kunden nehmen ihre Reifen mit.';

-- ---------------------------------------------------------------------
-- 5. Der Abschluss-Zwang entfällt
--
-- Die Funktion wird vollständig neu geschrieben – wie schon in Migration 22 –, damit die ganze
-- Regel an EINER Stelle lesbar bleibt statt über drei Dateien verteilt. Gegenüber 22 fehlt
-- genau der Einlagerungs-Block; alles andere ist unverändert.
--
-- WARUM ERSATZLOS: Der Zwang sollte verhindern, dass jemand Reifen mitnimmt und nie erfasst.
-- Ab jetzt steht der Gebührenartikel aber gar nicht mehr auf dem Einlagerungs-Auftrag – der
-- Zwang könnte also gar nicht mehr greifen, wo er gemeint war, und würde nur noch dort
-- auslösen, wo er falsch ist. Die Erinnerung übernimmt die Oberfläche, als Frage.
-- ---------------------------------------------------------------------
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  wer uuid := (select auth.uid());
  rolle text := coalesce(public.current_user_role(), '');
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if (old.status, new.status) in (
       ('offen', 'in_arbeit'), ('offen', 'erledigt'), ('offen', 'storniert'),
       ('in_arbeit', 'offen'), ('in_arbeit', 'erledigt'), ('in_arbeit', 'storniert')
     ) then
    null;
  elsif old.status in ('erledigt', 'storniert') and new.status in ('offen', 'in_arbeit') then
    if rolle not in ('admin', 'superadmin') then
      raise exception 'Nur Admin oder Superadmin dürfen einen abgeschlossenen oder stornierten Auftrag wiedereröffnen.';
    end if;
    if coalesce(btrim(new.reopen_reason), '') = '' then
      raise exception 'Zum Wiedereröffnen wird eine Begründung benötigt.';
    end if;
  else
    raise exception 'Dieser Statuswechsel ist nicht vorgesehen (% → %).', old.status, new.status;
  end if;

  if new.status = 'erledigt' then
    new.completed_at := now();
    new.completed_by := wer;
  elsif old.status = 'erledigt' then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  if new.status = 'storniert' then
    if coalesce(btrim(new.cancel_reason), '') = '' then
      raise exception 'Für eine Stornierung wird ein Grund benötigt.';
    end if;
    new.cancelled_at := now();
    new.cancelled_by := wer;
  elsif old.status = 'storniert' then
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.cancel_reason := null;
  end if;

  return new;
end;
$$;

commit;

-- Kontrolle nach dem Lauf:
--
-- select short_name, abrechnungsart, braucht_lagerplatz from public.articles order by abrechnungsart desc, short_name;
