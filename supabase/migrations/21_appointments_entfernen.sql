-- =====================================================================
-- Viana PinPoints – 21: tote Tabelle `appointments` entfernen
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 07 und 16.
--
-- Begründung: docs/termine-kontakt-auftrag-analyse.md, Abschnitt 2.7.
--
-- Seit Migration 07 gilt "ein Termin ist ein Auftrag" – die damals vorhandenen Termine wurden
-- nach `public.orders` übernommen, und seitdem schreibt und liest die Anwendung diese Tabelle
-- nicht mehr. Migration 16 hat ihr nur noch die Alles-erlaubt-Policy weggenommen; stehen blieb
-- sie aus Vorsicht.
--
-- Diese Vorsicht kostet inzwischen mehr, als sie einbringt: wer ins Schema schaut, findet zwei
-- Tabellen, die beide nach Terminen aussehen, und muss erst herausfinden, welche gilt. Genau
-- diese Doppeldeutigkeit steckt hinter der Frage "warum wird aus meinem Termin kein Auftrag".
-- Ein Schema soll die Wahrheit sagen.
--
-- Datenverlust: keiner, der nicht schon eingetreten wäre. Die Zeilen von damals stehen seit
-- Migration 07 in `orders`. Was seither in `appointments` liegen geblieben ist, ist eine Kopie
-- von vor der Zusammenlegung.
--
-- Rücknahme im Notfall: supabase/migrations/rollback/21_rollback.sql
-- =====================================================================

-- Sicherheitsnetz, bewusst als Bedingung und nicht als Kommentar: sollte in dieser Instanz
-- wider Erwarten nach der Zusammenlegung noch etwas in die Tabelle geschrieben worden sein,
-- bricht die Migration ab, statt es stillschweigend zu entsorgen. Dann zuerst klären, woher
-- die Zeilen kommen.
do $$
declare
  anzahl bigint;
  juengste date;
begin
  if to_regclass('public.appointments') is null then
    raise notice 'Tabelle public.appointments existiert nicht (mehr) – nichts zu tun.';
    return;
  end if;

  select count(*), max(date) into anzahl, juengste from public.appointments;

  -- Alles, was vor der Zusammenlegung angelegt wurde, ist erwartbar und wurde nach `orders`
  -- übernommen. Zeilen, zu denen es KEINEN passenden Auftrag gibt, wären dagegen echter,
  -- unbemerkt verlorener Bestand.
  if exists (
    select 1
    from public.appointments a
    where not exists (
      select 1 from public.orders o
      where o.customer_id = a.customer_id and o.order_date = a.date
    )
  ) then
    raise exception
      'Abbruch: in public.appointments stehen % Zeilen (jüngste %), zu denen es keinen passenden Auftrag gibt. Erst klären, dann löschen.',
      anzahl, juengste;
  end if;

  raise notice 'public.appointments: % Zeilen, alle in orders vorhanden – wird entfernt.', anzahl;
end $$;

drop table if exists public.appointments;
