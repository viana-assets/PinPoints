-- Migration 40: „Rechnung erstellt" am Auftrag
--
-- Seit Migration 38 gibt es den Schalter „Rechnung benötigt". Er sagt, DASS eine Rechnung
-- fällig ist – aber nicht, ob sie schon geschrieben wurde. Damit ist er eine Kennzeichnung
-- und keine Arbeitsliste: Man sieht die Aufgabe, aber man kann sie nicht abhaken, und beim
-- zweiten Durchgang sieht sie genauso aus wie beim ersten.
--
-- Diese Migration ergänzt die andere Hälfte:
--
--   rechnung_erstellt_am   – null heißt „noch offen". Gesetzt heißt „im ERP geschrieben".
--   rechnung_erstellt_von  – wer sie geschrieben hat.
--   rechnung_nummer        – die Rechnungsnummer AUS DEM ERP. Freiwillig, aber die einzige
--                            Brücke zurück: ohne sie sind der Auftrag hier und die Rechnung
--                            dort zwei Dinge ohne Verbindung.
--
-- ZWEI ZEITSTEMPEL SETZT DIE DATENBANK SELBST, nicht der Aufrufer – dieselbe Entscheidung wie
-- bei `completed_at` in Migration 20. Ein „erstellt am", das sich jeder Aufrufer aussuchen
-- kann, ist keine Angabe, sondern eine Behauptung.
--
-- TECHNIKER SIND AUTOMATISCH AUSGESCHLOSSEN. `restrict_techniker_order_update()` (Migration
-- 15/20) arbeitet mit einer Positivliste änderbarer Spalten; was nicht darin steht, lehnt der
-- Trigger ab. Diese drei stehen nicht darin und werden bewusst auch nicht aufgenommen:
-- Abrechnung ist keine Auskunft für unterwegs. Es ist kein Zufall, dass das hier nichts
-- kostet – genau dafür wurde die Liste in Phase 6 von einer Negativ- auf eine Positivliste
-- umgestellt.
--
-- WAS BEIM WIEDERERÖFFNEN PASSIERT: nichts. Wird ein erledigter Auftrag wieder geöffnet,
-- bleiben die drei Felder stehen. Die Rechnung im ERP existiert weiter – sie verschwindet
-- nicht dadurch, dass hier jemand einen Auftrag anfasst. Wer sie storniert, nimmt die
-- Markierung von Hand zurück; das steht dann im Protokoll.
--
-- Fügt nur hinzu, löscht nichts. Zweimaliges Ausführen ist unschädlich.
-- Rücknahme: rollback/40_rollback.sql.

begin;

-- ---------------------------------------------------------------------
-- PROJEKTWACHE. Zuerst, vor allem anderen.
--
-- In derselben Supabase-Organisation liegen mehrere Projekte (PinPoints,
-- Gartenverein_Knauersberg …), und der SQL-Editor merkt sich, welches zuletzt offen war.
-- Dreimal ist eine Migration dadurch im falschen Projekt gelandet. Die Fehlermeldung war
-- jedes Mal `relation "public.orders" does not exist` – technisch richtig und als Hinweis
-- unbrauchbar, weil sie nach einem Fehler in der Migration aussieht statt nach der
-- falschen Datenbank.
--
-- Diese Prüfung sagt es im Klartext. Sie kostet nichts und läuft vor jeder Änderung.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

alter table public.orders
  add column if not exists rechnung_erstellt_am  timestamptz,
  add column if not exists rechnung_erstellt_von uuid,
  add column if not exists rechnung_nummer       text;

-- Eine Rechnungsnummer ohne Rechnungsdatum ist keine Aussage, sondern ein Tippfehler.
-- Umgekehrt geht sehr wohl: abgehakt, Nummer nachgetragen später oder nie.
--
-- Prüfregel UND Trigger, und das ist kein Doppel: Die Prüfregel fängt das INSERT, der Trigger
-- das UPDATE. Beim ersten Entwurf hat der Trigger die Nummer in diesem Fall stillschweigend
-- auf null gesetzt – dadurch konnte die Prüfregel gar nicht mehr greifen, und eine eingetippte
-- Nummer verschwand kommentarlos. Der Trigger meldet das jetzt.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.orders'::regclass
       and conname = 'orders_rechnung_nummer_braucht_datum'
  ) then
    alter table public.orders
      add constraint orders_rechnung_nummer_braucht_datum
      check (rechnung_nummer is null or rechnung_erstellt_am is not null);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Der Stempel. Der Aufrufer sagt nur „jetzt abgehakt" bzw. „doch nicht"; WANN und DURCH WEN
-- bestimmt die Datenbank.
--
-- Beim Zurücknehmen fällt die Rechnungsnummer mit weg. Eine Nummer ohne Rechnung wäre sonst
-- genau die Falschaussage, die der Check oben verhindert – und der alte Wert steht im
-- Protokoll, falls er doch gebraucht wird.
-- ---------------------------------------------------------------------
create or replace function public.stempel_rechnung()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rechnung_erstellt_am is null then
    if old.rechnung_erstellt_am is not null then
      -- Zurückgenommen: die Nummer fällt mit weg.
      new.rechnung_erstellt_von := null;
      new.rechnung_nummer := null;
    elsif new.rechnung_nummer is not null then
      -- Eine Nummer ohne Haken einfach stillschweigend wegzuwerfen wäre schlimmer als ein
      -- Fehler: Der Nutzer hat sie eingetippt, sieht sie verschwinden und weiß nicht, warum.
      raise exception 'Eine Rechnungsnummer ohne „Rechnung erstellt" ist keine Angabe – erst abhaken, dann die Nummer eintragen.';
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

drop trigger if exists trg_stempel_rechnung on public.orders;
create trigger trg_stempel_rechnung
  before update on public.orders
  for each row execute procedure public.stempel_rechnung();

-- Genau die Arbeitsliste als Teilindex: erledigt, Rechnung nötig, noch nicht geschrieben.
-- Ein Index über die ganze Tabelle wäre hier Verschwendung – gesucht wird immer diese eine
-- kleine Teilmenge.
create index if not exists orders_rechnung_offen_idx
  on public.orders (order_date desc)
  where rechnung_noetig
    and rechnung_erstellt_am is null
    and status = 'erledigt'
    and deleted_at is null;

commit;

-- Kontrolle nach dem Lauf:
--
-- select count(*) filter (where rechnung_noetig and rechnung_erstellt_am is null
--                           and status = 'erledigt' and deleted_at is null) as offen,
--        count(*) filter (where rechnung_erstellt_am is not null)            as erledigt
--   from public.orders;
