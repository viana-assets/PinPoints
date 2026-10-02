-- =====================================================================
-- Migration 62 – Abgerechnete Aufträge nicht löschen (D2) und eine Bremse für die
-- Adressdienste, die über alle Server-Instanzen wirkt (B3). 02.10.2026.
--
-- 1. LÖSCHSPERRE (D2)
--    Bis hierher ließ sich ein Auftrag mit Rechnung ohne Warnung löschen (Soft-Delete,
--    `deleted_at`). Die Rechnung blieb als Beleg bestehen, war aber über den Auftrag nicht mehr
--    auffindbar. Jetzt lehnt die Datenbank das ab, sobald eine Rechnung auf den Auftrag verweist
--    oder er eine Rechnungsnummer trägt – mit einem Satz, der sagt warum.
--    AUSNAHMEN, bewusst: Löscht der Papierkorb einen ganzen KUNDEN, nimmt der seine Aufträge mit
--    (Migration 19, Weitergabe per Trigger) – das ist ein anderer Vorgang mit eigenen Regeln
--    (Migration 56). Erkennungsmerkmal: `pg_trigger_depth() > 1`, der Aufruf kommt aus einem
--    anderen Trigger. Dasselbe beim endgültigen Löschen über Fremdschlüssel.
--    Gegenstück in der Oberfläche: lib/auftragLoeschen.ts – wer eine Stelle ändert, ändert beide.
--
-- 2. ABFRAGEBREMSE (B3)
--    Die Routen /api/geocode (Nominatim) und /api/adresse-suchen (Photon) bremsten nur über eine
--    Variable im Speicher der jeweiligen Server-Instanz. Laufen auf Vercel mehrere Instanzen,
--    greift das nicht, und ein angemeldeter Nutzer könnte die Route in einer Schleife aufrufen –
--    im Ernstfall sperrt der kostenlose Dienst die Firma aus. Jetzt zählt eine Tabelle je Dienst,
--    Nutzer und Minute; `fremdabfrage_erlaubt()` sagt vor jedem Aufruf nach draußen ja oder nein.
--    Nur der Aufruf nach DRAUSSEN zählt – ein Treffer im Zwischenspeicher kostet nichts.
--    Grenzen je Minute: Nominatim 50 je Nutzer / 55 gesamt (der Dienst verlangt höchstens eine
--    Anfrage pro Sekunde), Photon 60 je Nutzer / 300 gesamt.
--    Ältere Zählzeilen (älter als eine Stunde) räumt die Funktion selbst ab.
--
-- Der SQL-Editor führt Anweisung für Anweisung aus (CLAUDE.md, Abschnitt 2): Jeder Schritt
-- steht für sich und ist wiederholbar. Die Routen kommen auch ohne diese Migration aus (sie
-- fallen dann auf die alte Bremse zurück) – die Reihenfolge SQL/Dateien ist also frei.
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.rechnungen') is null then
    raise exception
      'FALSCHES PROJEKT oder Migration 48 fehlt: Hier gibt es kein public.orders / public.rechnungen. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Löschsperre für abgerechnete Aufträge
-- ---------------------------------------------------------------------
create or replace function public.pruefe_auftrag_loeschen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nummer text;
  auftrag public.orders;
begin
  -- Weitergabe aus einem anderen Trigger (Kunde in den Papierkorb, Fremdschlüssel beim
  -- endgültigen Löschen): nicht hier entscheiden, siehe Kopf.
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    -- Nur der Schritt „wird gelöscht" interessiert, nicht jede Änderung.
    if not (old.deleted_at is null and new.deleted_at is not null) then
      return new;
    end if;
    auftrag := new;
  else
    auftrag := old;
  end if;

  select r.nummer_text into nummer
    from public.rechnungen r
   where r.order_id = auftrag.id
   order by r.nummer desc
   limit 1;
  -- Beim Soft-Delete zählt auch eine Rechnungsnummer aus dem ERP (Migration 40). Beim
  -- endgültigen Löschen nur echte Rechnungszeilen: Das Testkunden-Löschen (Migration 60) räumt
  -- seine Rechnungen vorher selbst ab, die Nummer am Auftrag bleibt dabei stehen.
  if nummer is null and tg_op = 'UPDATE' then
    nummer := auftrag.rechnung_nummer;
  end if;

  if nummer is not null then
    raise exception 'Dieser Auftrag ist abgerechnet (Rechnung %) und wird nicht gelöscht – über ihn findet man die Rechnung.', nummer;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_pruefe_auftrag_loeschen on public.orders;
create trigger trg_pruefe_auftrag_loeschen
  before update of deleted_at or delete on public.orders
  for each row execute function public.pruefe_auftrag_loeschen();

-- ---------------------------------------------------------------------
-- 2. Abfragebremse für die Adressdienste
-- ---------------------------------------------------------------------
create table if not exists public.fremdabfrage_zaehler (
  dienst  text        not null,
  nutzer  uuid        not null,
  minute  timestamptz not null,
  anzahl  integer     not null default 0,
  primary key (dienst, nutzer, minute)
);
create index if not exists idx_fremdabfrage_minute on public.fremdabfrage_zaehler (dienst, minute);

-- Keine Richtlinie: Niemand liest oder schreibt die Tabelle direkt, nur die Funktion unten
-- (security definer). RLS an, damit die Tabelle über die API nicht offen liegt.
alter table public.fremdabfrage_zaehler enable row level security;

comment on table public.fremdabfrage_zaehler is
  'Zählt Aufrufe der Adressdienste je Dienst, Nutzer und Minute (Migration 62, B3). Nur über fremdabfrage_erlaubt().';

create or replace function public.fremdabfrage_erlaubt(p_dienst text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  jetzt_minute timestamptz := date_trunc('minute', now());
  ich uuid := (select auth.uid());
  grenze_nutzer integer;
  grenze_gesamt integer;
  meine integer;
  alle integer;
begin
  if ich is null then
    return false;
  end if;
  if p_dienst = 'nominatim' then
    grenze_nutzer := 50; grenze_gesamt := 55;
  elsif p_dienst = 'photon' then
    grenze_nutzer := 60; grenze_gesamt := 300;
  else
    raise exception 'Unbekannter Dienst: %', p_dienst;
  end if;

  -- Gezählt wird VOR der Prüfung: auch ein abgewiesener Versuch zählt, sonst hilft
  -- Dauerfeuer gegen die Sperre.
  insert into public.fremdabfrage_zaehler as z (dienst, nutzer, minute, anzahl)
  values (p_dienst, ich, jetzt_minute, 1)
  on conflict (dienst, nutzer, minute) do update set anzahl = z.anzahl + 1
  returning z.anzahl into meine;

  select coalesce(sum(z.anzahl), 0) into alle
    from public.fremdabfrage_zaehler z
   where z.dienst = p_dienst and z.minute = jetzt_minute;

  -- Aufräumen, gelegentlich: etwa jeder zwanzigste Aufruf.
  if random() < 0.05 then
    delete from public.fremdabfrage_zaehler z where z.minute < now() - interval '1 hour';
  end if;

  return meine <= grenze_nutzer and alle <= grenze_gesamt;
end;
$$;

revoke all on function public.fremdabfrage_erlaubt(text) from public;
grant execute on function public.fremdabfrage_erlaubt(text) to authenticated;

comment on function public.fremdabfrage_erlaubt(text) is
  'Darf jetzt eine Anfrage an den Adressdienst (nominatim | photon) gehen? Zählt mit. Migration 62, B3.';

commit;

-- Zur Kontrolle (Ergebnistabelle – der SQL-Editor zeigt keine Meldungen):
select 'Löschsperre (Trigger an orders)' as pruefung,
  exists (select 1 from pg_trigger where tgname = 'trg_pruefe_auftrag_loeschen')::text as ergebnis
union all
select 'Abgerechnete Aufträge (wären jetzt gesperrt)',
  (select count(*)::text from public.orders o
    where o.deleted_at is null
      and (o.rechnung_nummer is not null or exists (select 1 from public.rechnungen r where r.order_id = o.id)))
union all
select 'Tabelle fremdabfrage_zaehler', (to_regclass('public.fremdabfrage_zaehler') is not null)::text
union all
select 'Funktion fremdabfrage_erlaubt', (to_regprocedure('public.fremdabfrage_erlaubt(text)') is not null)::text;
