-- Rücknahme von Migration 48.
--
-- ACHTUNG: Diese Rücknahme LÖSCHT ausgestellte Rechnungen. Wenn schon eine einzige geschrieben
-- wurde, ist das keine technische Rücknahme mehr, sondern die Vernichtung eines Belegs. Dann
-- gehört der Anwendungscode zurückgedreht und die Tabelle stehen gelassen.
--
-- Die Abfrage unten sagt, ob das der Fall ist. ERST ANSEHEN, DANN ENTSCHEIDEN:
--
--   select count(*) from public.rechnungen;
--
-- Steht dort etwas anderes als 0, diese Datei NICHT ausführen.

begin;

do $$
declare
  vorhanden integer;
begin
  select count(*) into vorhanden from public.rechnungen;
  if vorhanden > 0 then
    raise exception
      'Es gibt bereits % ausgestellte Rechnung(en). Die Rücknahme würde Belege löschen und wird deshalb abgelehnt. Anwendungscode zurückdrehen und die Tabelle stehen lassen.',
      vorhanden;
  end if;
end $$;

drop trigger if exists trg_rechnung_unveraenderlich on public.rechnungen;
drop trigger if exists trg_vergib_rechnungsnummer on public.rechnungen;
drop function if exists public.rechnung_unveraenderlich();
drop function if exists public.vergib_rechnungsnummer();
drop table if exists public.rechnungen;

drop trigger if exists trg_vergib_kundennummer on public.customers;
drop function if exists public.vergib_kundennummer();

-- Die Kundennummern bleiben stehen: Sie stören nicht, und wer die Migration später erneut
-- ausführt, findet dieselbe Zuordnung vor. Dasselbe gilt für die Betriebsdaten und die
-- Einheit am Artikel – alles nur nicht mehr gelesene Spalten.

delete from public.module_permissions where module_key = 'rechnungen';

commit;
