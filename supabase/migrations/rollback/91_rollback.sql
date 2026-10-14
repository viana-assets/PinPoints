-- =====================================================================
-- Rücknahme Migration 91 – Finance F4 (Bankkonten, Kontoauszüge, Abgleich) wieder entfernen.
--
-- ACHTUNG: Löscht Bankkonten, Importe und Umsätze. Die Buchungen aus dem Abgleich bleiben im Journal
-- (es wird nie gelöscht), Rechnungen und Belege bleiben „bezahlt“. Vorher ggf. „Alle Daten sichern“.
-- `fin_stornieren()` wird wieder die Fassung aus Migration 90. Zweiter Lauf folgenlos.
-- =====================================================================

drop trigger if exists fin_bank_nach_storno on public.fin_buchungen;
drop function if exists public.fin_bank_nach_storno();
drop function if exists public.fin_bank_aufheben(uuid, text);
drop function if exists public.fin_bank_ignorieren(uuid, text);
drop function if exists public.fin_bank_zu_konto(uuid, integer, text, text);
drop function if exists public.fin_bank_zu_beleg(uuid, uuid);
drop function if exists public.fin_bank_zu_rechnung(uuid, uuid);
drop function if exists public.fin_bank_umsatz_holen(uuid);
drop function if exists public.fin_bank_import_zuruecknehmen(uuid);
drop function if exists public.fin_bank_einlesen(uuid, text, text, jsonb, numeric, date);
drop table if exists public.fin_bankumsaetze;
drop table if exists public.fin_bankimporte;
drop table if exists public.fin_bankkonten;

create or replace function public.fin_stornieren(p_id uuid, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q text;
begin
  if not public.darf('finance.buchen', 'schreiben') then
    raise exception 'Stornieren ist für deine Rolle nicht freigeschaltet (Recht „Finance › Buchungen“ schreiben).';
  end if;
  select quelle into q from public.fin_buchungen where id = p_id;
  if q = 'rechnung' then
    raise exception 'Diese Buchung kommt aus einer Rechnung – storniert wird die Rechnung (in FSM), dann storniert Finance die Buchung mit.';
  end if;
  if q = 'beleg' then
    raise exception 'Diese Buchung kommt aus einem Beleg – stornieren unter Finance › Belege am Beleg.';
  end if;
  if q = 'zahlung' then
    raise exception 'Diese Buchung ist eine Zahlung – zurücknehmen an der Rechnung bzw. am Beleg.';
  end if;
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;
revoke all on function public.fin_stornieren(uuid, text) from public, anon;
grant execute on function public.fin_stornieren(uuid, text) to authenticated;
-- Die Quelle „bank“ bleibt erlaubt: Buchungen aus dem Abgleich stehen weiter im Journal.

select 'Rücknahme 91' as pruefung,
       (to_regclass('public.fin_bankumsaetze') is null and to_regclass('public.fin_bankkonten') is null
        and to_regprocedure('public.fin_bank_einlesen(uuid,text,text,jsonb,numeric,date)') is null)::text as ergebnis;
