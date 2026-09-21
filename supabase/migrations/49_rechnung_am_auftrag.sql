-- Migration 49 – Die Rechnung und der Auftrag
--
-- Braucht Migration 48 (Tabelle `rechnungen`) und Migration 40 (`orders.rechnung_erstellt_am`).
--
-- Migration 48 hat die Rechnung gebaut. Was fehlte, ist die Verbindung zum Auftrag: Die
-- Arbeitsliste „Rechnung benötigt" (Migration 40/44) lebt von `orders.rechnung_erstellt_am`,
-- und solange die niemand setzt, steht ein Auftrag mit ausgestellter Rechnung weiter als
-- offen in der Liste.
--
-- Das ließe sich im Programm erledigen – zwei Schreibvorgänge hintereinander. Genau daran
-- scheitert es beim ersten Verbindungsabbruch: Die Rechnung steht, der Auftrag weiß nichts
-- davon, und niemand sieht den Unterschied. Deshalb steht es hier: EIN Vorgang, eine
-- Transaktion.
--
-- Drei Regeln kommen dazu:
--
--   1. Keine Rechnung ohne Briefkopf. Wer die Betriebsdaten nicht gepflegt hat, bekommt eine
--      Rechnung ohne Absender – und die Nummer ist dann schon verbraucht.
--   2. Eine ausgestellte Rechnung hakt ihren Auftrag ab; eine Stornorechnung nimmt den Haken
--      zurück und kennzeichnet zugleich die aufgehobene Rechnung.
--   3. Solange eine gültige Rechnung am Auftrag hängt, lässt sich der Haken nicht von Hand
--      lösen. Vorher war er eine Notiz; jetzt ist er die Aussage „es gibt einen Beleg".

begin;

do $$
begin
  if to_regclass('public.rechnungen') is null then
    raise exception
      'FALSCHES PROJEKT oder Migration 48 fehlt: Hier gibt es kein public.rechnungen. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Keine Rechnung ohne Briefkopf
--
-- Ersetzt die Fassung aus Migration 48 um eine einzige Prüfung. Sie steht hier und nicht im
-- Programm, weil die Nummer hier vergeben wird: Wer erst die Nummer zieht und danach merkt,
-- dass der Absender fehlt, hat eine Lücke im Kreis.
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
  absender text;
begin
  select b.rechnung_naechste_nummer, b.rechnung_praefix, btrim(b.firma)
    into naechste, praefix, absender
    from public.betrieb b where b.id for update;

  if absender is null or absender = '' then
    raise exception 'Die Betriebsdaten sind noch nicht gepflegt. Ohne Firmenname gäbe es eine Rechnung ohne Absender - im Adminbereich unter Betrieb eintragen.';
  end if;

  if new.nummer is not null and new.nummer > 0 then
    return new;
  end if;

  if naechste is null then naechste := 1; end if;
  if praefix  is null then praefix  := 'RE'; end if;

  new.nummer := naechste;
  new.nummer_text := praefix || naechste::text;
  update public.betrieb set rechnung_naechste_nummer = naechste + 1 where id;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Die Rechnung hakt ihren Auftrag ab
--
-- `security definer`, weil die Rolle, die eine Rechnung schreiben darf, nicht zwingend
-- Schreibrecht auf dem Auftrag hat – und weil ein Techniker den Haken ohnehin nicht setzen
-- können soll, die Rechnung aber trotzdem korrekt vermerkt gehört.
--
-- AFTER INSERT und nicht BEFORE: Vorher steht die Nummer noch nicht fest.
-- ---------------------------------------------------------------------
create or replace function public.rechnung_am_auftrag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  betroffener uuid;
begin
  if new.art = 'storno' then
    -- Die aufgehobene Rechnung kennzeichnen. Der Unveränderbarkeits-Trigger lässt genau diese
    -- beiden Felder zu; alles andere an ihr bleibt, wie es gedruckt wurde.
    update public.rechnungen
       set storniert_durch = new.id,
           storniert_am    = now()
     where id = new.hebt_auf
       and storniert_durch is null;

    select r.order_id into betroffener from public.rechnungen r where r.id = new.hebt_auf;

    -- Den Haken nur zurücknehmen, wenn danach KEINE gültige Rechnung mehr am Auftrag hängt.
    -- Wer zwei Rechnungen für einen Auftrag geschrieben und eine storniert hat, hat immer
    -- noch einen Beleg.
    if betroffener is not null and not exists (
      select 1 from public.rechnungen r
       where r.order_id = betroffener
         and r.art = 'rechnung'
         and r.storniert_durch is null
         and r.id <> new.hebt_auf
    ) then
      update public.orders set rechnung_erstellt_am = null where id = betroffener;
    end if;

    return new;
  end if;

  if new.order_id is not null then
    update public.orders
       set rechnung_erstellt_am = now(),
           rechnung_nummer      = new.nummer_text
     where id = new.order_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rechnung_am_auftrag on public.rechnungen;
create trigger trg_rechnung_am_auftrag
  after insert on public.rechnungen
  for each row execute procedure public.rechnung_am_auftrag();

-- ---------------------------------------------------------------------
-- 3. Der Haken lässt sich nicht mehr von Hand lösen, solange ein Beleg da ist
--
-- Bis Migration 48 war „Rechnung erstellt" eine Notiz über etwas, das in einem anderen System
-- passiert ist – die durfte man zurücknehmen. Jetzt ist sie die Aussage „zu diesem Auftrag
-- existiert ein Beleg mit einer Nummer", und die nimmt man nicht per Haken zurück, sondern
-- per Stornorechnung.
--
-- Ergänzt die Fassung aus Migration 40 um genau diesen Fall; alles andere bleibt.
-- ---------------------------------------------------------------------
create or replace function public.stempel_rechnung()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  beleg text;
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
      -- Zurückgenommen: die Nummer fällt mit weg.
      new.rechnung_erstellt_von := null;
      new.rechnung_nummer := null;
    elsif new.rechnung_nummer is not null then
      -- Eine Nummer ohne Haken einfach stillschweigend wegzuwerfen wäre schlimmer als ein
      -- Fehler: Der Nutzer hat sie eingetippt, sieht sie verschwinden und weiß nicht, warum.
      raise exception 'Eine Rechnungsnummer ohne Rechnung erstellt ist keine Angabe - erst abhaken, dann die Nummer eintragen.';
    else
      new.rechnung_erstellt_von := null;
    end if;
  elsif old.rechnung_erstellt_am is null then
    new.rechnung_erstellt_am  := now();
    new.rechnung_erstellt_von := (select auth.uid());
  else
    -- Schon abgehakt und bleibt es: Datum und Person sind unantastbar, nur die Nummer darf
    -- noch nachgetragen oder berichtigt werden.
    new.rechnung_erstellt_am  := old.rechnung_erstellt_am;
    new.rechnung_erstellt_von := old.rechnung_erstellt_von;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Wer eine Rechnung schreibt, muss den Auftrag dazu lesen dürfen
--
-- Die Rechnungsliste zeigt Nummer, Kunde und Betrag aus dem Snapshot – dafür braucht sie
-- nichts weiter. Der Weg zurück zum Auftrag hängt an den Auftragsrichtlinien und bleibt
-- deshalb bewusst unangetastet: Ein Techniker, der einen fremden Auftrag nicht sehen darf,
-- soll ihn auch über eine Rechnung nicht sehen.
-- ---------------------------------------------------------------------

commit;

-- Kontrolle nach dem Lauf:
--
-- select tgname from pg_trigger where tgrelid = 'public.rechnungen'::regclass and not tgisinternal;
-- select o.order_number, o.rechnung_erstellt_am, o.rechnung_nummer
--   from public.orders o where o.rechnung_nummer is not null order by o.order_number;
