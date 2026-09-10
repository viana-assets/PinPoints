-- =====================================================================
-- Viana PinPoints – 23: Kontaktergebnis und Wiedervorlage am Kunden
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 01.
--
-- Konzept und Begründung: docs/kunden-und-karte.md, Abschnitt „Was aus einem Kontakt wird".
--
-- Bisher kannte ein Kunde genau zwei Zustände: „offen" und „kontaktiert". Damit ließ sich
-- festhalten, DASS telefoniert wurde, aber nicht, WAS dabei herauskam. Ein Kunde, der einen
-- Auftrag erteilt hat, ein Kunde, der im Frühjahr noch einmal angerufen werden will, und ein
-- Kunde, der abgesagt hat, sahen auf der Karte gleich aus – alle drei grün.
--
-- Zwei Spalten schließen die Lücke:
--   `kontakt_ergebnis`  – was beim letzten Kontakt herauskam
--   `wiedervorlage_am`  – wann wieder angerufen werden soll
--
-- BEWUSST NICHT hier geregelt: „kein Interesse" setzt den Kunden NICHT automatisch auf
-- inaktiv. Das sind zwei verschiedene Aussagen. Inaktiv heißt „taucht in keiner Arbeitsliste
-- mehr auf" (weggezogen, Betrieb geschlossen); kein Interesse heißt „hat DIESES MAL nein
-- gesagt". Bei Reifen ist das meist ein saisonales Nein – automatisch zu deaktivieren würde
-- genau die Kunden aus dem Blick nehmen, die man in der nächsten Saison anrufen will.
-- Deaktivieren bleibt ein eigener, bewusster Klick.
--
-- Rücknahme im Notfall: supabase/migrations/rollback/23_rollback.sql
-- =====================================================================

alter table public.customers
  add column if not exists kontakt_ergebnis text,
  add column if not exists wiedervorlage_am date;

-- Die erlaubten Werte stehen als Prüfbedingung in der Datenbank und nicht nur als TypeScript-
-- Typ im Browser: ein Tippfehler in einem späteren Skript oder ein direkter API-Aufruf soll
-- keinen Zustand erzeugen können, den die Oberfläche nicht kennt. `null` bleibt erlaubt und
-- heißt „noch kein Kontakt festgehalten" – so, wie es bei allen Altdatensätzen ist.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_kontakt_ergebnis_check'
  ) then
    alter table public.customers
      add constraint customers_kontakt_ergebnis_check
      check (kontakt_ergebnis is null or kontakt_ergebnis in ('auftrag', 'wiedervorlage', 'kein_interesse'));
  end if;
end $$;

comment on column public.customers.kontakt_ergebnis is
  'Ergebnis des letzten Kontakts: auftrag | wiedervorlage | kein_interesse. Null = noch nichts festgehalten.';
comment on column public.customers.wiedervorlage_am is
  'Ab wann der Kunde wieder auf der Anrufliste stehen soll. Bis dahin erscheint er orange, danach wieder fällig.';

-- Ein Index lohnt hier nicht: die Kundentabelle ist mit rund 4500 Zeilen klein genug, dass sie
-- ohnehin vollständig geladen und im Browser gefiltert wird (siehe docs/kunden-und-karte.md).
-- Ein Index, den niemand benutzt, kostet nur Schreibzeit.
