-- =====================================================================
-- Migration 61: Reifenverkauf aus dem Lager (26.09.2026)
--
-- **SQL zuerst, dann die Dateien.** Die neue Oberfläche liest `verkaufsreifen` und
-- `order_articles.verkaufsreifen_id`; ohne beides schlägt das Laden fehl.
--
-- Wunsch vom 26.09.2026, Konzept in `docs/lager.md`, Abschnitt „Reifenverkauf": Neue und
-- gebrauchte Reifen liegen im Lager (oder im zweiten Lager „Zuhause"), werden im Auftrag nach
-- Größe gesucht, als Position eingetragen und sind danach nicht mehr im Bestand.
--
-- Entschieden am 26.09.2026 (alle vier Vorschläge angenommen):
--   1. Abgebucht wird beim ABSCHLIESSEN des Auftrags. Bis dahin ist der Reifen reserviert –
--      für jeden anderen Auftrag gesperrt, aber noch im Regal. Position entfernt oder Auftrag
--      storniert: Die Reservierung fällt weg. Auftrag wiedereröffnet: Der Reifen kommt zurück
--      in den Bestand und ist wieder reserviert.
--   2. Zwei Artikel: „Reifen neu" und „Reifen gebraucht" (Abrechnungsart `reifenverkauf_neu` /
--      `reifenverkauf_gebraucht`). Gebrauchte Reifen können steuerlich anders zu behandeln sein
--      (Differenzbesteuerung, mit dem Steuerberater zu klären) – mit zwei Artikeln lassen sie
--      sich später getrennt buchen, ohne alte Aufträge anzufassen.
--   3. Einkaufspreis wird erfasst (freiwillig), für die Marge.
--   4. Kompletträder gehen auch: Feld `felge` (leer = nur Reifen).
--
-- ============================================================================
-- DIE DREI ZAHLEN AM POSTEN
-- ============================================================================
--   bestand    Wie viele Stück liegen noch da (reservierte eingeschlossen). Von Hand
--              änderbar – „einer war doch kaputt". Sinkt beim Abschließen eines Auftrags.
--   reserviert Wie viele stehen auf offenen Aufträgen. Wird NUR von der Datenbank gezählt.
--   verkauft   Wie viele sind über abgeschlossene Aufträge hinausgegangen. Nur Auskunft,
--              ebenfalls nur von der Datenbank gezählt.
--   frei = bestand − reserviert. Das ist, was die Suche im Auftrag noch anbietet.
--
-- Warum `bestand` gespeichert und nicht aus den Aufträgen errechnet wird: Ein Kunde lässt sich
-- endgültig löschen (Migration 56), und mit ihm gehen seine Aufträge samt Positionen. Ein
-- errechneter Bestand bekäme die verkauften Reifen in diesem Moment zurück ins Regal. Was
-- verkauft ist, ist eine Tatsache und bleibt eine – nur ein Testkunde (Migration 60) gibt beim
-- restlosen Löschen zurück, was er „verkauft" hat.
--
-- Doppelverkauf: Zwei Geräte, die gleichzeitig denselben letzten Reifen eintragen, werden hier
-- nacheinander abgearbeitet (Zeilensperre auf dem Posten); das zweite bekommt eine Meldung.
-- Die Oberfläche bietet nur Freies an, aber sie entscheidet es nicht (CLAUDE.md, Abschnitt 4).
--
-- Ein Lagerplatz hält ENTWEDER einen Kundensatz ODER Verkaufsreifen (mehrere Posten dürfen
-- sich einen Platz teilen – vier einzelne Gebrauchte auf einem Regalboden). Im Lager
-- „Zuhause" gibt es keine Plätze; dort genügt das Lager.
--
-- Rechte: neuer Bereich `lager.verkauf` (lesen / schreiben / löschen). Wer im Auftrag einen
-- Reifen einträgt, schreibt eine Leistung (`auftraege.leistungen`), nicht den Bestand – die
-- Zählung läuft deshalb mit den Rechten der Datenbank (security definer).
--
-- Der SQL-Editor führt Anweisung für Anweisung aus (CLAUDE.md, Abschnitt 2): Jeder Schritt
-- steht für sich und ist wiederholbar. Bricht der Lauf in der Mitte ab, bleibt ein brauchbarer
-- Zustand – die Regeln greifen jeweils ab ihrem eigenen Trigger.
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null
     or to_regclass('public.order_articles') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage / public.order_articles. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.darf(text,text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = 'abrechnungsart') then
    raise exception 'Migration 42 oder 46 fehlt (Rechte / Abrechnungsart). Es wurde nichts geändert. (Datenbank: %)', current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Der Bestand
-- ---------------------------------------------------------------------
create table if not exists public.verkaufsreifen (
  id              uuid primary key default gen_random_uuid(),
  zustand         text not null,
  -- Größe 235/55 R17: Breite in mm, Querschnitt in %, Felgendurchmesser in Zoll. Der
  -- Querschnitt darf fehlen (ältere Transporterreifen wie „195 R14 C").
  breite          integer not null,
  querschnitt     integer,
  zoll            numeric(3,1) not null,
  -- Last- und Geschwindigkeitsindex, so wie er auf der Flanke steht: „103V", „109/107T".
  kennung         text,
  hersteller      text not null,
  modell          text,
  saison          text not null,
  dot             text,
  profiltiefe_mm  numeric(3,1),
  -- Leer = nur der Reifen. Sonst ein Komplettrad auf Stahl- oder Alufelge.
  felge           text,
  runflat         boolean not null default false,
  xl              boolean not null default false,
  -- EU-Reifenlabel: die Nummer in der EPREL-Datenbank. Beim Verkauf von Neureifen muss das
  -- Label gezeigt werden (VO (EU) 2020/740) – über diese Nummer ist es mit einem Tipp da.
  eprel           text,
  -- Verkaufspreis je Stück, netto – wie jeder Preis in PinPoints.
  preis_netto     numeric(10,2) not null,
  -- Einkaufspreis je Stück, netto. Freiwillig; ohne ihn keine Marge.
  ek_netto        numeric(10,2),
  bestand         integer not null default 0,
  reserviert      integer not null default 0,
  verkauft        integer not null default 0,
  -- Nullbar, weil ein ausverkaufter Posten ein gelöschtes Lager überleben muss: Er steht als
  -- Beleg auf Aufträgen. Solange etwas daliegt, verlangt der Trigger unten ein Lager.
  warehouse_id    uuid references public.warehouses(id) on delete set null,
  storage_slot_id uuid references public.storage_slots(id) on delete set null,
  notiz           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid
);

comment on table public.verkaufsreifen is
  'Migration 61: Reifen und Kompletträder, die der Betrieb verkauft. bestand = liegt noch da, reserviert = steht auf offenen Aufträgen (zählt die Datenbank), verkauft = über abgeschlossene Aufträge hinaus (zählt die Datenbank). frei = bestand - reserviert.';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.verkaufsreifen'::regclass and conname = 'verkaufsreifen_zustand_bekannt') then
    alter table public.verkaufsreifen add constraint verkaufsreifen_zustand_bekannt check (zustand in ('neu', 'gebraucht'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.verkaufsreifen'::regclass and conname = 'verkaufsreifen_saison_bekannt') then
    alter table public.verkaufsreifen add constraint verkaufsreifen_saison_bekannt check (saison in ('sommer', 'winter', 'ganzjahr'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.verkaufsreifen'::regclass and conname = 'verkaufsreifen_felge_bekannt') then
    alter table public.verkaufsreifen add constraint verkaufsreifen_felge_bekannt check (felge is null or felge in ('stahl', 'alu'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.verkaufsreifen'::regclass and conname = 'verkaufsreifen_groesse_moeglich') then
    alter table public.verkaufsreifen add constraint verkaufsreifen_groesse_moeglich
      check (breite between 100 and 400 and (querschnitt is null or querschnitt between 20 and 95) and zoll between 10 and 24);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.verkaufsreifen'::regclass and conname = 'verkaufsreifen_hersteller_da') then
    alter table public.verkaufsreifen add constraint verkaufsreifen_hersteller_da check (btrim(hersteller) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.verkaufsreifen'::regclass and conname = 'verkaufsreifen_werte_moeglich') then
    alter table public.verkaufsreifen add constraint verkaufsreifen_werte_moeglich
      check (preis_netto >= 0 and (ek_netto is null or ek_netto >= 0)
             and (profiltiefe_mm is null or profiltiefe_mm between 0 and 25));
  end if;
  -- Die Rückfallebene zur Meldung im Trigger unten: Kommt jemand an ihm vorbei, hält die
  -- Datenbank trotzdem, was sie verspricht.
  if not exists (select 1 from pg_constraint where conrelid = 'public.verkaufsreifen'::regclass and conname = 'verkaufsreifen_bestand_passt') then
    alter table public.verkaufsreifen add constraint verkaufsreifen_bestand_passt
      check (bestand between 0 and 999 and reserviert >= 0 and verkauft >= 0 and reserviert <= bestand);
  end if;
end $$;

create index if not exists verkaufsreifen_platz_idx on public.verkaufsreifen (storage_slot_id) where bestand > 0;
create index if not exists verkaufsreifen_lager_idx on public.verkaufsreifen (warehouse_id);

-- ---------------------------------------------------------------------
-- 2. Die Position im Auftrag kennt ihren Reifen
--
-- `on delete restrict`: Ein Posten, der auf einem Auftrag steht, ist ein Beleg und wird nicht
-- gelöscht. Der Trigger in Schritt 6 sagt das vorher im Klartext.
-- ---------------------------------------------------------------------
alter table public.order_articles
  add column if not exists verkaufsreifen_id uuid references public.verkaufsreifen(id) on delete restrict;

comment on column public.order_articles.verkaufsreifen_id is
  'Migration 61: Diese Position verkauft Reifen aus dem Lager. Die Menge ist reserviert, solange der Auftrag offen ist, und wird beim Abschließen abgebucht.';

create index if not exists order_articles_verkaufsreifen_idx
  on public.order_articles (verkaufsreifen_id) where verkaufsreifen_id is not null;

-- ---------------------------------------------------------------------
-- 3. Zwei neue Abrechnungsarten und die beiden Artikel
--
-- Die Prüfregel aus Migration 46 wird ersetzt (drop + add in EINER Anweisung, damit zwischen
-- beiden kein Moment ohne Regel liegt).
-- ---------------------------------------------------------------------
alter table public.articles
  drop constraint if exists articles_abrechnungsart_bekannt,
  add constraint articles_abrechnungsart_bekannt
    check (abrechnungsart in ('normal', 'lagergebuehr', 'reifenverkauf_neu', 'reifenverkauf_gebraucht'));

comment on column public.articles.abrechnungsart is
  'normal = wird eingetragen, wenn die Leistung erbracht ist. lagergebuehr = wird beim Auslagern fällig, Menge = Monate. reifenverkauf_neu / reifenverkauf_gebraucht = Verkauf aus dem Lager (Migration 61), Preis und Text kommen vom Reifen.';

-- Gibt es schon einen Artikel mit genau diesem Namen (selbst angelegt, oder aus einem Lauf vor
-- einem Rollback), wird er übernommen statt ein zweiter angelegt.
update public.articles a set abrechnungsart = 'reifenverkauf_neu'
 where a.id = (select x.id from public.articles x where lower(btrim(x.short_name)) = 'reifen neu' and x.abrechnungsart = 'normal' order by x.article_number limit 1)
   and not exists (select 1 from public.articles y where y.abrechnungsart = 'reifenverkauf_neu');

update public.articles a set abrechnungsart = 'reifenverkauf_gebraucht'
 where a.id = (select x.id from public.articles x where lower(btrim(x.short_name)) = 'reifen gebraucht' and x.abrechnungsart = 'normal' order by x.article_number limit 1)
   and not exists (select 1 from public.articles y where y.abrechnungsart = 'reifenverkauf_gebraucht');

-- Sonst anlegen, wenn es noch keinen Artikel dieser Art gibt – ein zweiter Lauf legt nichts an,
-- und wer schon einen eigenen angelegt und umgestellt hat, behält ihn.
insert into public.articles (short_name, long_name, abrechnungsart, einheit)
select 'Reifen neu', 'Neureifen', 'reifenverkauf_neu', 'Stück'
where not exists (select 1 from public.articles where abrechnungsart = 'reifenverkauf_neu');

insert into public.articles (short_name, long_name, abrechnungsart, einheit)
select 'Reifen gebraucht', 'Gebrauchtreifen', 'reifenverkauf_gebraucht', 'Stück'
where not exists (select 1 from public.articles where abrechnungsart = 'reifenverkauf_gebraucht');

-- ---------------------------------------------------------------------
-- 4. Der Rechte-Bereich
-- ---------------------------------------------------------------------
insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
values ('lager.verkauf', '{admin,techniker,user}', '{admin,user}', '{admin}')
on conflict (module_key) do nothing;

-- ---------------------------------------------------------------------
-- 5. Zählen – die eine Stelle, an der `reserviert` und `verkauft` entstehen
--
-- p_abgang: Stück, die gerade das Haus verlassen (Auftrag abgeschlossen: +, wiedereröffnet: −).
--           Sie gehen vom Bestand ab und zu „verkauft".
-- p_eigene: die Menge der Position, die den Aufruf ausgelöst hat – nur für die Meldung, damit
--           sie sagen kann, was ANDERE schon belegen.
-- p_kontext: steht vor der Meldung („Auftrag lässt sich nicht wiedereröffnen: …").
--
-- Die Zeilensperre (`for update`) reiht gleichzeitige Buchungen auf denselben Posten
-- hintereinander. Die Zählung danach ist eine neue Anweisung und sieht damit, was der andere
-- inzwischen festgeschrieben hat.
-- ---------------------------------------------------------------------
create or replace function public.verkaufsreifen_zaehlen(p_id uuid, p_abgang integer default 0, p_eigene integer default 0, p_kontext text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  res integer;
  neu_bestand integer;
  andere integer;
  frei_fuer_mich integer;
begin
  if p_id is null then
    return;
  end if;
  select v.id, v.bestand, v.verkauft, v.hersteller, v.modell, v.breite, v.querschnitt, v.zoll
    into p from public.verkaufsreifen v where v.id = p_id for update;
  if not found then
    return;
  end if;

  select coalesce(sum(oa.quantity), 0)::integer into res
    from public.order_articles oa
    join public.orders o on o.id = oa.order_id
   where oa.verkaufsreifen_id = p_id
     and oa.deleted_at is null
     and o.deleted_at is null
     and o.status in ('offen', 'in_arbeit');

  neu_bestand := p.bestand - p_abgang;

  if neu_bestand < 0 or res > neu_bestand then
    andere := greatest(res - p_eigene, 0);
    frei_fuer_mich := greatest(neu_bestand - andere, 0);
    raise exception '%Von „%" (%) %.',
      coalesce(p_kontext || ': ', ''),
      btrim(p.hersteller || ' ' || coalesce(p.modell, '')),
      p.breite || coalesce('/' || p.querschnitt, '') || ' R' || trim(trailing '.' from trim(trailing '0' from p.zoll::text)),
      case when frei_fuer_mich = 0 then 'ist keiner mehr frei'
           when frei_fuer_mich = 1 then 'ist nur noch 1 Stück frei'
           else 'sind nur noch ' || frei_fuer_mich || ' Stück frei' end
      || case when andere = 0 then ''
           when andere = 1 then ' – 1 Stück steht auf einem anderen Auftrag'
           else ' – ' || andere || ' Stück stehen auf anderen Aufträgen' end;
  end if;

  update public.verkaufsreifen v
     set bestand = neu_bestand,
         verkauft = v.verkauft + p_abgang,
         reserviert = res
   where v.id = p_id
     and (v.bestand, v.verkauft, v.reserviert) is distinct from (neu_bestand, v.verkauft + p_abgang, res);
end;
$$;

-- Nur für die Trigger dieser Migration. Supabase gibt neuen Funktionen im Schema public
-- sonst ein Ausführungsrecht für alle Rollen – dann ließe sich der Bestand über die API buchen.
revoke execute on function public.verkaufsreifen_zaehlen(uuid, integer, integer, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.verkaufsreifen_zaehlen(uuid, integer, integer, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.verkaufsreifen_zaehlen(uuid, integer, integer, text) from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Regeln am Posten selbst
-- ---------------------------------------------------------------------
create or replace function public.verkaufsreifen_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  platz record;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.order_articles oa where oa.verkaufsreifen_id = old.id) then
      raise exception 'Dieser Reifen steht auf einem Auftrag und bleibt deshalb als Beleg stehen. Ist er nicht mehr da, den Bestand auf 0 setzen.';
    end if;
    return old;
  end if;

  -- `reserviert` und `verkauft` zählt allein die Datenbank (verkaufsreifen_zaehlen). Kommt die
  -- Änderung direkt aus der Anwendung (Trigger-Tiefe 1), bleiben beide, wie sie sind – dasselbe
  -- Erkennungsmerkmal wie in Migration 55.
  if pg_trigger_depth() = 1 then
    if tg_op = 'INSERT' then
      new.reserviert := 0;
      new.verkauft := 0;
    else
      new.reserviert := old.reserviert;
      new.verkauft := old.verkauft;
    end if;
    if new.bestand < new.reserviert then
      raise exception 'Der Bestand kann nicht unter % sinken – so viele stehen auf offenen Aufträgen. Erst dort die Position entfernen.', new.reserviert;
    end if;
  end if;

  new.hersteller := btrim(new.hersteller);

  -- Der Platz bestimmt das Lager. Wer einen Platz wählt, muss das Lager nicht noch einmal nennen
  -- – und kann es nicht versehentlich falsch nennen.
  if new.storage_slot_id is not null then
    select s.id, s.code, s.warehouse_id into platz from public.storage_slots s where s.id = new.storage_slot_id;
    if found then
      new.warehouse_id := platz.warehouse_id;
    end if;
  end if;

  if new.bestand > 0 and new.warehouse_id is null then
    raise exception 'Bitte angeben, in welchem Lager die Reifen liegen.';
  end if;

  -- Ein Platz: entweder Kundensatz oder Verkaufsreifen. Geprüft, wenn der Posten auf einen Platz
  -- kommt oder wieder Bestand bekommt – nicht bei jedem Zählen.
  if new.storage_slot_id is not null and new.bestand > 0
     and (tg_op = 'INSERT' or new.storage_slot_id is distinct from old.storage_slot_id or old.bestand = 0) then
    -- Dieselbe Sperre wie beim Einlagern (Schritt 7): Wer zuerst kommt, belegt den Platz.
    perform 1 from public.storage_slots s where s.id = new.storage_slot_id for update;
    -- Ohne Kundennamen: Fehlermeldungen tragen keine Kundendaten (CLAUDE.md, Abschnitt 5).
    if exists (select 1 from public.tire_storage t
                where t.storage_slot_id = new.storage_slot_id and t.removed_at is null) then
      raise exception 'Auf Platz % liegt schon ein Kundensatz. Bitte einen freien Platz wählen.', platz.code;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_verkaufsreifen_pruefen on public.verkaufsreifen;
create trigger trg_verkaufsreifen_pruefen
  before insert or update or delete on public.verkaufsreifen
  for each row execute procedure public.verkaufsreifen_pruefen();

drop trigger if exists trg_loeschrecht on public.verkaufsreifen;
create trigger trg_loeschrecht
  before delete on public.verkaufsreifen
  for each row execute procedure public.pruefe_loeschrecht('lager.verkauf');

drop trigger if exists trg_stamp_row on public.verkaufsreifen;
create trigger trg_stamp_row
  before insert or update on public.verkaufsreifen
  for each row execute procedure public.stamp_row();

drop trigger if exists trg_audit_row on public.verkaufsreifen;
create trigger trg_audit_row
  after insert or update or delete on public.verkaufsreifen
  for each row execute procedure public.audit_row();

-- ---------------------------------------------------------------------
-- 7. Die Gegenrichtung: kein Kundensatz auf einen Platz mit Verkaufsreifen
-- ---------------------------------------------------------------------
create or replace function public.platz_ohne_verkaufsreifen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  platz_code text;
  was text;
begin
  if new.removed_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.storage_slot_id is not distinct from old.storage_slot_id and old.removed_at is null then
    return new;
  end if;
  select s.code into platz_code from public.storage_slots s where s.id = new.storage_slot_id for update;
  select string_agg(v.bestand || '× ' || btrim(v.hersteller || ' ' || coalesce(v.modell, '')), ', ') into was
    from public.verkaufsreifen v
   where v.storage_slot_id = new.storage_slot_id and v.bestand > 0;
  if was is not null then
    raise exception 'Auf Platz % liegen Verkaufsreifen (%). Bitte einen freien Platz wählen.', coalesce(platz_code, '?'), left(was, 120);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_platz_ohne_verkaufsreifen on public.tire_storage;
create trigger trg_platz_ohne_verkaufsreifen
  before insert or update of storage_slot_id, removed_at on public.tire_storage
  for each row execute procedure public.platz_ohne_verkaufsreifen();

-- ---------------------------------------------------------------------
-- 8. Lager und Plätze mit Verkaufsreifen lassen sich nicht löschen
--
-- Die Funktion aus Migration 55 wird vollständig neu geschrieben, damit die ganze Regel an
-- EINER Stelle steht. Gegenüber 55 kommen nur die Verkaufsreifen dazu.
-- ---------------------------------------------------------------------
create or replace function public.lager_belegt_nicht_loeschen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  anzahl integer;
  beispiele text;
  verkauf integer;
begin
  if tg_table_name = 'storage_slots' then
    select count(*) into anzahl
      from public.tire_storage t
     where t.storage_slot_id = old.id and t.removed_at is null;
    if anzahl > 0 then
      raise exception 'Lagerplatz % ist belegt. Erst den Satz auslagern oder umlagern, dann löschen.', old.code;
    end if;
    select count(*) into verkauf
      from public.verkaufsreifen v
     where v.storage_slot_id = old.id and v.bestand > 0;
    if verkauf > 0 then
      raise exception 'Auf Lagerplatz % liegen Verkaufsreifen. Erst umlagern oder den Bestand auf 0 setzen, dann löschen.', old.code;
    end if;
  elsif tg_table_name = 'warehouses' then
    select count(*), string_agg(s.code, ', ' order by s.code)
      into anzahl, beispiele
      from public.tire_storage t
      join public.storage_slots s on s.id = t.storage_slot_id
     where s.warehouse_id = old.id and t.removed_at is null;
    if anzahl > 0 then
      raise exception 'Lager "%" kann nicht gelöscht werden: % belegte(r) Platz/Plätze (%). Erst auslagern oder umlagern.',
        old.name, anzahl, left(beispiele, 200);
    end if;
    select count(*) into verkauf
      from public.verkaufsreifen v
     where v.warehouse_id = old.id and v.bestand > 0;
    if verkauf > 0 then
      raise exception 'Lager "%" kann nicht gelöscht werden: Dort liegen noch % Posten Verkaufsreifen. Erst umlagern oder den Bestand auf 0 setzen.',
        old.name, verkauf;
    end if;
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Die Position im Auftrag
-- ---------------------------------------------------------------------
create or replace function public.position_verkaufsreifen_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  art text;
  zustand text;
begin
  if new.verkaufsreifen_id is null then
    if tg_op = 'UPDATE' and old.verkaufsreifen_id is not null then
      raise exception 'Der Reifen einer Position lässt sich nicht lösen – die Position entfernen und neu eintragen.';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.verkaufsreifen_id is distinct from old.verkaufsreifen_id then
    raise exception 'Der Reifen einer Position lässt sich nicht tauschen – die Position entfernen und den anderen Reifen neu eintragen.';
  end if;
  if new.quantity < 1 or new.quantity <> trunc(new.quantity) then
    raise exception 'Reifen werden in ganzen Stück verkauft.';
  end if;

  select a.abrechnungsart into art from public.articles a where a.id = new.article_id;
  select v.zustand into zustand from public.verkaufsreifen v where v.id = new.verkaufsreifen_id;
  if art is distinct from 'reifenverkauf_' || zustand then
    raise exception 'Ein % Reifen gehört auf den Artikel „Reifen %" (Abrechnungsart Reifenverkauf %). Bitte im Artikelstamm prüfen.',
      case when zustand = 'neu' then 'neuer' else 'gebrauchter' end, zustand, zustand;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_position_verkaufsreifen_pruefen on public.order_articles;
create trigger trg_position_verkaufsreifen_pruefen
  before insert or update of verkaufsreifen_id, quantity, article_id on public.order_articles
  for each row execute procedure public.position_verkaufsreifen_pruefen();

-- Nach jeder Änderung einer Reifen-Position neu zählen. AFTER, damit die Zählung die Änderung
-- schon sieht.
create or replace function public.position_verkaufsreifen_zaehlen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.verkaufsreifen_id is not null
     and (tg_op = 'DELETE' or old.verkaufsreifen_id is distinct from new.verkaufsreifen_id) then
    perform public.verkaufsreifen_zaehlen(old.verkaufsreifen_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.verkaufsreifen_id is not null then
    perform public.verkaufsreifen_zaehlen(
      new.verkaufsreifen_id, 0,
      case when new.deleted_at is null then new.quantity::integer else 0 end,
      null);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_position_verkaufsreifen_zaehlen on public.order_articles;
create trigger trg_position_verkaufsreifen_zaehlen
  after insert or update of verkaufsreifen_id, quantity, deleted_at, order_id or delete on public.order_articles
  for each row execute procedure public.position_verkaufsreifen_zaehlen();

-- ---------------------------------------------------------------------
-- 10. Der Auftrag: Abschließen bucht ab, Wiedereröffnen bucht zurück, Stornieren und Löschen
--     geben die Reservierung frei
-- ---------------------------------------------------------------------
create or replace function public.auftrag_reifenverkauf_buchen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  z record;
  richtung integer := 0;
  kontext text := null;
begin
  if new.status = 'erledigt' and old.status is distinct from 'erledigt' then
    richtung := 1;
  elsif old.status = 'erledigt' and new.status is distinct from 'erledigt' then
    richtung := -1;
  end if;
  if old.status = 'storniert' and new.status in ('offen', 'in_arbeit') then
    kontext := 'Der Auftrag lässt sich nicht wiedereröffnen';
  elsif old.deleted_at is not null and new.deleted_at is null then
    kontext := 'Der Auftrag lässt sich nicht wiederherstellen';
  end if;

  for z in
    select oa.verkaufsreifen_id as posten, sum(oa.quantity)::integer as menge
      from public.order_articles oa
     where oa.order_id = new.id and oa.verkaufsreifen_id is not null and oa.deleted_at is null
     group by oa.verkaufsreifen_id
  loop
    perform public.verkaufsreifen_zaehlen(z.posten, richtung * z.menge, z.menge, kontext);
  end loop;

  -- Beim Löschen hängen die Positionen schon an der Löschmarke (Migration 19) – sie fallen oben
  -- heraus, werden aber noch gezählt, damit ihre Reservierung frei wird.
  if new.deleted_at is distinct from old.deleted_at then
    for z in
      select distinct oa.verkaufsreifen_id as posten
        from public.order_articles oa
       where oa.order_id = new.id and oa.verkaufsreifen_id is not null and oa.deleted_at is not null
    loop
      perform public.verkaufsreifen_zaehlen(z.posten);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_reifenverkauf_buchen on public.orders;
create trigger trg_reifenverkauf_buchen
  after update of status, deleted_at on public.orders
  for each row execute procedure public.auftrag_reifenverkauf_buchen();

-- Ein Testkunde (Migration 60) wird mitsamt seinen Aufträgen restlos gelöscht. Was er
-- „verkauft" hat, kommt dabei zurück ins Regal – er hat es nie wirklich bekommen. Für echte
-- Kunden gilt das NICHT: Verkauft bleibt verkauft, auch wenn der Kunde später aus dem
-- Papierkorb endgültig verschwindet.
create or replace function public.testauftrag_reifen_zurueck()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  z record;
begin
  if old.status = 'erledigt' and old.order_number < 0 then
    for z in
      select oa.verkaufsreifen_id as posten, sum(oa.quantity)::integer as menge
        from public.order_articles oa
       where oa.order_id = old.id and oa.verkaufsreifen_id is not null and oa.deleted_at is null
       group by oa.verkaufsreifen_id
    loop
      perform public.verkaufsreifen_zaehlen(z.posten, -z.menge, 0, null);
    end loop;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_testauftrag_reifen_zurueck on public.orders;
create trigger trg_testauftrag_reifen_zurueck
  before delete on public.orders
  for each row execute procedure public.testauftrag_reifen_zurueck();

-- ---------------------------------------------------------------------
-- 11. Zugriff
-- ---------------------------------------------------------------------
alter table public.verkaufsreifen enable row level security;

drop policy if exists "Bereich verkauf lesen" on public.verkaufsreifen;
create policy "Bereich verkauf lesen" on public.verkaufsreifen
  for select to authenticated using (public.darf('lager.verkauf', 'lesen'));

drop policy if exists "Bereich verkauf schreiben" on public.verkaufsreifen;
create policy "Bereich verkauf schreiben" on public.verkaufsreifen
  for insert to authenticated with check (public.darf('lager.verkauf', 'schreiben'));

drop policy if exists "Bereich verkauf aendern" on public.verkaufsreifen;
create policy "Bereich verkauf aendern" on public.verkaufsreifen
  for update to authenticated
  using (public.darf('lager.verkauf', 'schreiben'))
  with check (public.darf('lager.verkauf', 'schreiben'));

-- Wie überall seit Migration 42: Die Richtlinie fragt nur „lesen", entschieden und begründet
-- wird im Trigger `pruefe_loeschrecht('lager.verkauf')`. Absicht, keine Lücke.
drop policy if exists "Bereich verkauf loeschen" on public.verkaufsreifen;
create policy "Bereich verkauf loeschen" on public.verkaufsreifen
  for delete to authenticated using (public.darf('lager.verkauf', 'lesen'));

grant select, insert, update, delete on public.verkaufsreifen to authenticated;
grant all on public.verkaufsreifen to service_role;

commit;

-- Zur Kontrolle (Ergebnistabelle – der SQL-Editor zeigt keine Meldungen):
select 'Tabelle verkaufsreifen' as pruefung, (to_regclass('public.verkaufsreifen') is not null)::text as ergebnis
union all
select 'Spalte order_articles.verkaufsreifen_id',
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_articles' and column_name = 'verkaufsreifen_id')::text
union all
select 'Artikel Reifen neu / gebraucht',
  (select string_agg(article_number || ' ' || short_name, ', ' order by article_number) from public.articles where abrechnungsart like 'reifenverkauf%')
union all
select 'Rechte lager.verkauf', exists (select 1 from public.module_permissions where module_key = 'lager.verkauf')::text
union all
select 'Richtlinien', (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'verkaufsreifen');
