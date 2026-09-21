-- Migration 48: PinPoints schreibt Rechnungen
--
-- ============================================================================
-- WAS SICH HIER ÄNDERT – UND WARUM DAS SCHWERER WIEGT ALS DIE ÜBRIGEN MIGRATIONEN
-- ============================================================================
-- Am 16.09.2026 war entschieden: Rechnungen entstehen im ERP, PinPoints hält nur die von dort
-- vergebene Nummer fest (Migration 40). Am 18.09.2026 wurde das umgedreht: PinPoints wird das
-- rechnungsführende System.
--
-- Damit gilt hier nicht mehr „ein Fehler wird beim nächsten Speichern korrigiert". Eine
-- Rechnung ist ein Beleg:
--
--   * Ihre Nummer ist einmalig und fortlaufend, OHNE LÜCKEN.
--   * Ihr Inhalt steht fest. Ändert sich später der Kunde, ein Preis oder eine Leistung, darf
--     sich die Rechnung NICHT mitändern.
--   * Sie wird nicht gelöscht, sondern storniert.
--
-- Alle drei Punkte sind hier in der Datenbank verankert und nicht im Programm. Eine Regel, die
-- nur die Oberfläche kennt, ist bei einem Beleg keine Regel, sondern eine Bitte.
--
-- ============================================================================
-- DER SNAPSHOT – DER WICHTIGSTE ENTWURFSENTSCHEID
-- ============================================================================
-- Die Rechnung speichert Empfänger, Absender und Positionen als eigene Kopie (jsonb), nicht
-- als Verweis. Das sieht nach Doppelung aus und ist genau das Gegenteil:
--
-- Zieht der Kunde um, gehört auf die Rechnung von letztem Jahr die ALTE Anschrift – sie wurde
-- dorthin geschickt. Wird ein Artikel umbenannt oder ein Preis geändert, steht auf der alten
-- Rechnung weiter, was berechnet wurde. Ein Dokument, das sich rückwirkend mitverändert, ist
-- kein Beleg.
--
-- `order_id` und `customer_id` bleiben trotzdem daneben stehen – aber als Verweis für die
-- Navigation („zeig mir den Auftrag dazu"), nicht als Quelle des Inhalts.
--
-- ============================================================================
-- NACH DEM LAUF: DREI EINSTELLUNGEN PRÜFEN
-- ============================================================================
--   1. `betrieb.rechnung_naechste_nummer` – bei welcher Nummer soll PinPoints anfangen?
--      Voreinstellung 1. Läuft anderswo schon ein Kreis (zuletzt gesehen: RE1781), muss hier
--      die nächste freie Nummer stehen, BEVOR die erste Rechnung entsteht.
--   2. `betrieb.rechnung_praefix` – Voreinstellung 'RE'.
--   3. Die Betriebsdaten (Anschrift, USt-IdNr., Steuernummer, Bankverbindung, Logo). Ohne sie
--      druckt die Anwendung einen Briefkopf ohne Absender.

begin;

do $$
begin
  if to_regclass('public.betrieb') is null or to_regclass('public.orders') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.betrieb / public.orders. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Der Briefkopf: Betriebsdaten
--
-- Als EINSTELLUNG und nicht im Code: Eine Steuernummer oder eine IBAN ändert sich, ohne dass
-- jemand programmieren können muss. Und ein Logo im Quelltext wäre beim nächsten Rebranding
-- eine Auslieferung statt eines Uploads.
-- ---------------------------------------------------------------------
alter table public.betrieb
  add column if not exists firma            text not null default '',
  add column if not exists inhaber          text not null default '',
  add column if not exists strasse          text not null default '',
  add column if not exists plz              text not null default '',
  add column if not exists ort              text not null default '',
  add column if not exists telefon          text not null default '',
  add column if not exists email            text not null default '',
  add column if not exists webseite         text not null default '',
  add column if not exists ust_id           text not null default '',
  add column if not exists steuernummer     text not null default '',
  add column if not exists kontoinhaber     text not null default '',
  add column if not exists bank             text not null default '',
  add column if not exists iban             text not null default '',
  add column if not exists bic              text not null default '',
  -- Das Logo als data:-URI. Kein Datei-Speicher, kein zweiter Dienst, keine Adresse, die
  -- irgendwann ins Leere zeigt: Das Bild gehört zum Briefkopf und reist mit ihm.
  add column if not exists logo             text not null default '',
  -- Der Text zwischen Anschrift und Positionstabelle („vielen Dank für Ihren Auftrag …").
  -- Steht hier und nicht im Code: Er gehört dem Betrieb, nicht der Anwendung.
  add column if not exists anschreiben      text not null default '',
  add column if not exists fuss_zahlung     text not null default 'Zahlbar nach Erhalt der Rechnung',
  add column if not exists fuss_hinweis     text not null default '',
  add column if not exists fuss_dank        text not null default '',
  add column if not exists rechnung_praefix text not null default 'RE',
  -- Die nächste zu vergebende Nummer. Bewusst KEINE Sequenz: Eine Sequenz vergibt bei einem
  -- Abbruch weiter und reißt damit Lücken in den Kreis. Hier sperrt der Trigger unten die
  -- Zeile innerhalb derselben Transaktion, in der die Rechnung entsteht – bricht sie ab, ist
  -- die Nummer wieder frei.
  add column if not exists rechnung_naechste_nummer integer not null default 1,
  add column if not exists kunde_naechste_nummer    integer not null default 10000;

-- ---------------------------------------------------------------------
-- 2. Die Kundennummer
--
-- Sie steht auf der Rechnung und ist für den Kunden die Kennung, unter der er anruft. Eine
-- UUID ist für diesen Zweck unbrauchbar.
-- ---------------------------------------------------------------------
alter table public.customers add column if not exists kundennummer integer;

create unique index if not exists customers_kundennummer_einmalig
  on public.customers (kundennummer) where kundennummer is not null;

create or replace function public.vergib_kundennummer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  naechste integer;
begin
  if new.kundennummer is not null then
    return new;
  end if;
  -- `for update` sperrt die eine Betriebszeile bis zum Ende der Transaktion. Zwei gleichzeitig
  -- angelegte Kunden bekommen dadurch zwei verschiedene Nummern statt zweimal derselben.
  select b.kunde_naechste_nummer into naechste from public.betrieb b where b.id for update;
  if naechste is null then
    naechste := 10000;
  end if;
  new.kundennummer := naechste;
  update public.betrieb set kunde_naechste_nummer = naechste + 1 where id;
  return new;
end;
$$;

drop trigger if exists trg_vergib_kundennummer on public.customers;
create trigger trg_vergib_kundennummer
  before insert on public.customers
  for each row execute procedure public.vergib_kundennummer();

-- Bestandskunden: Nummern in der Reihenfolge, in der sie angelegt wurden.
--
-- Wer die Nummern aus dem Altsystem übernehmen will, überschreibt sie danach von Hand – sie
-- stehen zu diesem Zeitpunkt auf noch keinem Dokument, das Umbenennen kostet also nichts.
-- Danach `betrieb.kunde_naechste_nummer` auf einen Wert über der höchsten vergebenen setzen.
do $$
declare
  start integer;
  vergeben integer := 0;
  k record;
begin
  select kunde_naechste_nummer into start from public.betrieb where id;
  if start is null then start := 10000; end if;

  for k in select id from public.customers where kundennummer is null order by created_at, id loop
    update public.customers set kundennummer = start + vergeben where id = k.id;
    vergeben := vergeben + 1;
  end loop;

  if vergeben > 0 then
    update public.betrieb set kunde_naechste_nummer = start + vergeben where id;
    raise notice 'Kundennummern vergeben: % Kunden, % bis %', vergeben, start, start + vergeben - 1;
  else
    raise notice 'Keine Kundennummern zu vergeben.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Die Einheit am Artikel
--
-- „1 Stück" und „1 Fahrt" stehen beide auf der Musterrechnung. Die Einheit gehört an den
-- Artikel und nicht an die Position: Sie ändert sich nicht von Auftrag zu Auftrag.
-- ---------------------------------------------------------------------
alter table public.articles add column if not exists einheit text not null default 'Stück';

-- ---------------------------------------------------------------------
-- 4. Die Rechnung
-- ---------------------------------------------------------------------
create table if not exists public.rechnungen (
  id uuid primary key default gen_random_uuid(),
  -- Die laufende Zahl und ihre Schreibweise. Beide einmalig: Die Zahl trägt die Reihenfolge,
  -- der Text steht auf dem Papier.
  nummer       integer not null,
  nummer_text  text    not null,
  art          text    not null default 'rechnung',
  -- Auf der ORIGINALRECHNUNG: durch welche Stornorechnung sie aufgehoben wurde.
  storniert_durch uuid references public.rechnungen(id),
  storniert_am    timestamptz,
  -- Auf der STORNORECHNUNG: welche Rechnung sie aufhebt.
  hebt_auf     uuid references public.rechnungen(id),
  -- Verweise für die Navigation, NICHT für den Inhalt – der steht im Snapshot darunter.
  order_id     uuid references public.orders(id) on delete set null,
  customer_id  uuid references public.customers(id) on delete set null,
  kundennummer integer,
  datum        date not null default current_date,
  lieferdatum  date,
  -- Der Snapshot. Siehe Kopf dieser Datei.
  empfaenger   jsonb not null,
  absender     jsonb not null,
  positionen   jsonb not null,
  texte        jsonb not null default '{}'::jsonb,
  netto        numeric(12,2) not null,
  steuer       numeric(12,2) not null,
  brutto       numeric(12,2) not null,
  created_at   timestamptz not null default now(),
  created_by   uuid
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rechnungen_art_bekannt') then
    alter table public.rechnungen add constraint rechnungen_art_bekannt
      check (art in ('rechnung', 'storno'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rechnungen_storno_hat_bezug') then
    alter table public.rechnungen add constraint rechnungen_storno_hat_bezug
      check (art <> 'storno' or hebt_auf is not null);
  end if;
end $$;

create unique index if not exists rechnungen_nummer_einmalig      on public.rechnungen (nummer);
create unique index if not exists rechnungen_nummer_text_einmalig on public.rechnungen (nummer_text);
create index if not exists rechnungen_auftrag_idx  on public.rechnungen (order_id);
create index if not exists rechnungen_kunde_idx    on public.rechnungen (customer_id);

-- ---------------------------------------------------------------------
-- 5. Die Nummernvergabe
--
-- Im Trigger und nicht im Programm: Zwischen „Nummer holen" und „Rechnung schreiben" darf
-- nichts passieren können. Hier ist beides EINE Transaktion – bricht sie ab, bleibt die
-- Nummer frei, und es entsteht keine Lücke.
-- ---------------------------------------------------------------------
create or replace function public.vergib_rechnungsnummer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  naechste integer;
  praefix  text;
begin
  if new.nummer is not null and new.nummer > 0 then
    return new;
  end if;
  select b.rechnung_naechste_nummer, b.rechnung_praefix
    into naechste, praefix
    from public.betrieb b where b.id for update;
  if naechste is null then naechste := 1; end if;
  if praefix  is null then praefix  := 'RE'; end if;

  new.nummer := naechste;
  new.nummer_text := praefix || naechste::text;
  update public.betrieb set rechnung_naechste_nummer = naechste + 1 where id;
  return new;
end;
$$;

drop trigger if exists trg_vergib_rechnungsnummer on public.rechnungen;
create trigger trg_vergib_rechnungsnummer
  before insert on public.rechnungen
  for each row execute procedure public.vergib_rechnungsnummer();

-- ---------------------------------------------------------------------
-- 6. Unveränderbar
--
-- Eine ausgestellte Rechnung wird nicht bearbeitet. Erlaubt ist ausschließlich, sie als
-- storniert zu kennzeichnen – alles andere lehnt die Datenbank ab, mit Begründung.
--
-- Gelöscht wird gar nicht: Eine fehlende Nummer ist eine Lücke im Kreis, und die erklärt man
-- bei der nächsten Prüfung.
-- ---------------------------------------------------------------------
create or replace function public.rechnung_unveraenderlich()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Eine Rechnung wird nicht gelöscht, sondern storniert (Rechnung %).', old.nummer_text;
  end if;

  if new.nummer is distinct from old.nummer
     or new.nummer_text is distinct from old.nummer_text
     or new.art         is distinct from old.art
     or new.datum       is distinct from old.datum
     or new.lieferdatum is distinct from old.lieferdatum
     or new.empfaenger  is distinct from old.empfaenger
     or new.absender    is distinct from old.absender
     or new.positionen  is distinct from old.positionen
     or new.texte       is distinct from old.texte
     or new.netto       is distinct from old.netto
     or new.steuer      is distinct from old.steuer
     or new.brutto      is distinct from old.brutto
     or new.kundennummer is distinct from old.kundennummer
     or new.hebt_auf    is distinct from old.hebt_auf
     or new.created_at  is distinct from old.created_at
     or new.created_by  is distinct from old.created_by then
    raise exception 'Rechnung % ist ausgestellt und kann nicht mehr geändert werden. Eine Korrektur läuft über eine Stornorechnung.', old.nummer_text;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rechnung_unveraenderlich on public.rechnungen;
create trigger trg_rechnung_unveraenderlich
  before update or delete on public.rechnungen
  for each row execute procedure public.rechnung_unveraenderlich();

-- ---------------------------------------------------------------------
-- 7. Wer darf was
-- ---------------------------------------------------------------------
alter table public.rechnungen enable row level security;

do $$
begin
  if to_regprocedure('public.darf(text,text)') is null then
    raise notice 'public.darf() fehlt (Migration 42) - Richtlinien für rechnungen werden übersprungen.';
    return;
  end if;

  execute 'drop policy if exists "Bereich rechnungen lesen" on public.rechnungen';
  execute 'create policy "Bereich rechnungen lesen" on public.rechnungen for select using (public.darf(''rechnungen'', ''lesen''))';

  execute 'drop policy if exists "Bereich rechnungen schreiben" on public.rechnungen';
  execute 'create policy "Bereich rechnungen schreiben" on public.rechnungen for insert with check (public.darf(''rechnungen'', ''schreiben''))';

  -- Ändern heißt hier ausschließlich: stornieren. Der Trigger oben lässt nichts anderes durch.
  execute 'drop policy if exists "Bereich rechnungen stornieren" on public.rechnungen';
  execute 'create policy "Bereich rechnungen stornieren" on public.rechnungen for update using (public.darf(''rechnungen'', ''schreiben'')) with check (public.darf(''rechnungen'', ''schreiben''))';

  -- Bewusst KEINE Löschrichtlinie: Was nicht erlaubt ist, braucht keine Regel.
end $$;

do $$
begin
  if to_regclass('public.module_permissions') is null then
    return;
  end if;
  insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
  values ('rechnungen', array['admin']::text[], array['admin']::text[], array[]::text[])
  on conflict (module_key) do nothing;
end $$;

commit;

-- Kontrolle nach dem Lauf:
--
-- select firma, rechnung_praefix, rechnung_naechste_nummer, kunde_naechste_nummer from public.betrieb;
-- select count(*) as kunden, count(kundennummer) as davon_mit_nummer from public.customers;
-- select short_name, einheit from public.articles order by short_name;
