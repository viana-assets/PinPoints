-- =====================================================================
-- Migration 66 – Rechnung anderswo erstellt (04.10.2026, v109).
--
-- Nicht jede Rechnung entsteht im MR Assistent. Manche Aufträge rechnet der Betrieb in einem
-- zweiten System ab. Bisher blieben sie dann für immer unter „Rechnungen noch nicht ausgestellt"
-- stehen (Dashboard, Aufträge, Rechnungsbuch, Auswertung) – der einzige Weg hinaus war, hier eine
-- Rechnung auszustellen, die man gar nicht wollte.
--
-- Jetzt lässt sich ein erledigter Auftrag als „anderswo abgerechnet" vermerken, auf Wunsch mit der
-- Rechnungsnummer aus dem anderen System. Dafür gibt es die Felder seit Migration 40 schon
-- (`rechnung_erstellt_am`, `rechnung_nummer`); neu ist nur, dass man an ihnen erkennt, WOHER der
-- Haken kommt:
--
--   orders.rechnung_extern  true  = von Hand vermerkt, der Beleg liegt in einem anderen System
--                           false = keine Rechnung, oder eine Rechnung aus dem MR Assistent
--
-- Die Regeln (alle in `stempel_rechnung()`, BEFORE UPDATE auf `orders`):
--   1. Vermerken nur bei einem ERLEDIGTEN Auftrag mit „Rechnung nötig" – vorher steht nicht fest,
--      was abgerechnet wird.
--   2. Vermerken und Zurücknehmen nur, wer Rechnungen schreiben darf (Vorgabe: Admin). Bis hierher
--      durfte das jeder, der den Auftrag ändern darf (Migration 40) – auch ein Techniker.
--   3. Eine Rechnung aus dem MR Assistent setzt den Haken weiter selbst (Migration 49, Aufruf aus
--      einem Trigger: `pg_trigger_depth() > 1`) und ist nie „anderswo".
--   4. Solange der Vermerk steht, stellt der MR Assistent für diesen Auftrag keine Rechnung aus
--      (`pruefe_rechnung_nicht_anderswo()`) – sonst gäbe es zwei Rechnungen für dieselbe Leistung.
--   5. Ein anderswo abgerechneter Auftrag wird nicht gelöscht, auch ohne Nummer – wie ein hier
--      abgerechneter (Migration 62). Er ist der Nachweis, dass die Leistung abgerechnet ist.
--
-- Der Auftrag zählt danach im Umsatz der Auswertung mit seinem eigenen Betrag (lib/
-- auswertungAnsicht.ts). Im DATEV-Export erscheint er nicht – die Buchung kommt aus dem anderen
-- System.
--
-- Der SQL-Editor führt Anweisung für Anweisung aus (CLAUDE.md, Abschnitt 2): Jeder Abschnitt steht
-- für sich und ist wiederholbar. Reihenfolge: **SQL zuerst**, dann die Dateien von v109.
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.rechnungen') is null
     or to_regprocedure('public.darf(text,text)') is null
     or to_regprocedure('public.stempel_rechnung()') is null
     or to_regprocedure('public.pruefe_auftrag_loeschen()') is null then
    raise exception
      'FALSCHES PROJEKT oder Migration 62 fehlt: Hier gibt es kein public.orders / rechnungen / darf() / stempel_rechnung() / pruefe_auftrag_loeschen(). Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Die Spalte
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists rechnung_extern boolean not null default false;

comment on column public.orders.rechnung_extern is
  'true: Der Auftrag ist von Hand als „anderswo abgerechnet" vermerkt (Migration 66); der Beleg liegt in einem anderen System. Gesetzt nur von stempel_rechnung().';

-- Bestand – VOR dem Ersetzen von `stempel_rechnung()` (Abschnitt 2), denn die neue Fassung
-- lässt die Herkunft eines bestehenden Hakens nicht mehr ändern. Ein zweiter Lauf findet hier
-- nichts mehr. Ein Haken ohne gültige Rechnung aus dem MR Assistent stammt aus der Zeit von
-- Migration 40 („im ERP erstellt") – das ist genau „anderswo abgerechnet". Ohne diese Zeile
-- stünde dort „Rechnung RE…" mit einem Knopf, der eine Rechnung sucht, die es hier nicht gibt.
update public.orders o
   set rechnung_extern = true
 where o.rechnung_erstellt_am is not null
   and not o.rechnung_extern
   and not exists (
     select 1 from public.rechnungen r
      where r.order_id = o.id and r.art = 'rechnung' and r.storniert_durch is null
   );

-- ---------------------------------------------------------------------
-- 2. Der Haken: wer, wann, woher
--
-- Ersetzt die Fassung aus Migration 49. Neu sind die Rechteprüfung, die Bedingung „erledigt",
-- und dass `rechnung_extern` immer HIER bestimmt wird, nie vom Aufrufer: Was der schickt,
-- wird überschrieben.
-- ---------------------------------------------------------------------
create or replace function public.stempel_rechnung()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  beleg text;
  -- Aufruf aus `rechnung_am_auftrag()` (Migration 49): Eine Rechnung aus dem MR Assistent setzt
  -- oder ein Storno nimmt den Haken. Das ist keine Handlung des Nutzers am Auftrag.
  von_rechnung constant boolean := pg_trigger_depth() > 1;
begin
  if new.rechnung_erstellt_am is null then
    if old.rechnung_erstellt_am is not null then
      select r.nummer_text into beleg
        from public.rechnungen r
       where r.order_id = old.id
         and r.art = 'rechnung'
         and r.storniert_durch is null
       limit 1;
      if beleg is not null then
        raise exception 'Zu diesem Auftrag gibt es die Rechnung %. Der Haken lässt sich nicht zurücknehmen - eine Rechnung wird storniert, nicht abgehakt.', beleg;
      end if;
      if not von_rechnung and not public.darf('rechnungen', 'schreiben') then
        raise exception 'Den Vermerk „anderswo abgerechnet" nimmt nur zurück, wer Rechnungen schreiben darf.';
      end if;
      -- Zurückgenommen: die Nummer fällt mit weg.
      new.rechnung_erstellt_von := null;
      new.rechnung_nummer := null;
      new.rechnung_extern := false;
    elsif new.rechnung_nummer is not null then
      -- Eine Nummer ohne Haken einfach stillschweigend wegzuwerfen wäre schlimmer als ein
      -- Fehler: Der Nutzer hat sie eingetippt, sieht sie verschwinden und weiß nicht, warum.
      raise exception 'Eine Rechnungsnummer ohne Rechnung erstellt ist keine Angabe - erst abhaken, dann die Nummer eintragen.';
    else
      new.rechnung_erstellt_von := null;
      new.rechnung_extern := false;
    end if;
  elsif old.rechnung_erstellt_am is null then
    if von_rechnung then
      new.rechnung_extern := false;
    else
      -- Von Hand: „anderswo abgerechnet".
      if not public.darf('rechnungen', 'schreiben') then
        raise exception 'Als anderswo abgerechnet vermerken darf nur, wer Rechnungen schreiben darf.';
      end if;
      if new.status <> 'erledigt' or not new.rechnung_noetig then
        raise exception 'Als anderswo abgerechnet vermerken lässt sich nur ein erledigter Auftrag mit „Rechnung nötig".';
      end if;
      new.rechnung_nummer := nullif(btrim(coalesce(new.rechnung_nummer, '')), '');
      new.rechnung_extern := true;
    end if;
    new.rechnung_erstellt_am  := now();
    new.rechnung_erstellt_von := (select auth.uid());
  else
    -- Schon abgehakt und bleibt es: Datum, Person und Herkunft sind unantastbar. Die Nummer darf
    -- bei einem anderswo abgerechneten Auftrag noch nachgetragen oder berichtigt werden; die
    -- Nummer einer Rechnung aus dem MR Assistent setzt nur die Rechnung selbst.
    -- Auch bei Weitergaben aus anderen Triggern (Kunde in den Papierkorb und zurück) bleibt die
    -- Herkunft, wie sie war.
    new.rechnung_erstellt_am  := old.rechnung_erstellt_am;
    new.rechnung_erstellt_von := old.rechnung_erstellt_von;
    new.rechnung_extern := old.rechnung_extern;
    if not von_rechnung then
      if new.rechnung_nummer is distinct from old.rechnung_nummer then
        if not old.rechnung_extern then
          new.rechnung_nummer := old.rechnung_nummer;
        elsif not public.darf('rechnungen', 'schreiben') then
          raise exception 'Die Rechnungsnummer eines anderswo abgerechneten Auftrags ändert nur, wer Rechnungen schreiben darf.';
        else
          new.rechnung_nummer := nullif(btrim(coalesce(new.rechnung_nummer, '')), '');
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Der Trigger selbst bleibt der aus Migration 40 (`trg_stempel_rechnung`, BEFORE UPDATE).

-- ---------------------------------------------------------------------
-- 3. Keine zweite Rechnung für einen anderswo abgerechneten Auftrag
-- ---------------------------------------------------------------------
create or replace function public.pruefe_rechnung_nicht_anderswo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.orders;
begin
  if new.art <> 'rechnung' or new.order_id is null then
    return new;
  end if;
  select * into a from public.orders o where o.id = new.order_id;
  if a.rechnung_extern then
    raise exception 'Auftrag % ist als anderswo abgerechnet vermerkt%. Erst den Vermerk am Auftrag zurücknehmen, dann hier eine Rechnung ausstellen.',
      a.order_number, coalesce(' (Rechnung ' || a.rechnung_nummer || ')', '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pruefe_rechnung_nicht_anderswo on public.rechnungen;
create trigger trg_pruefe_rechnung_nicht_anderswo
  before insert on public.rechnungen
  for each row execute function public.pruefe_rechnung_nicht_anderswo();

-- ---------------------------------------------------------------------
-- 4. Löschsperre auch für anderswo abgerechnete Aufträge
--
-- Ersetzt die Fassung aus Migration 62 um den letzten Absatz.
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
  -- endgültigen Löschen): nicht hier entscheiden, siehe Migration 62.
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
  -- Beim Soft-Delete zählt auch eine Rechnungsnummer aus einem anderen System. Beim endgültigen
  -- Löschen nur echte Rechnungszeilen: Das Testkunden-Löschen (Migration 60) räumt seine
  -- Rechnungen vorher selbst ab, die Nummer am Auftrag bleibt dabei stehen.
  if nummer is null and tg_op = 'UPDATE' then
    nummer := auftrag.rechnung_nummer;
  end if;

  if nummer is not null then
    raise exception 'Dieser Auftrag ist abgerechnet (Rechnung %) und wird nicht gelöscht – über ihn findet man die Rechnung.', nummer;
  end if;

  -- Migration 66: anderswo abgerechnet, aber ohne Nummer.
  if tg_op = 'UPDATE' and auftrag.rechnung_extern then
    raise exception 'Dieser Auftrag ist als anderswo abgerechnet vermerkt und wird nicht gelöscht. Erst den Vermerk zurücknehmen.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

commit;

-- Kontrolle nach dem Lauf – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen:
select 'Spalte rechnung_extern' as pruefung,
       (exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'orders' and column_name = 'rechnung_extern'))::text as ergebnis
union all
select 'Sperre gegen zweite Rechnung',
       (exists (select 1 from pg_trigger where tgname = 'trg_pruefe_rechnung_nicht_anderswo'))::text
union all
select 'Bestand als anderswo abgerechnet',
       (select count(*)::text from public.orders where rechnung_extern);
