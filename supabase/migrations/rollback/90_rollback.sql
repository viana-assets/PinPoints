-- =====================================================================
-- Rücknahme Migration 90 – Finance F2 (Belege, Lieferanten) wieder entfernen.
--
-- ACHTUNG: Löscht die Belege und Lieferanten (die Buchungen dazu bleiben im Journal). Die Dateien im
-- Bucket `fin-belege` löscht SQL nicht – vorher in Supabase › Storage leeren, sonst bleibt der Bucket
-- stehen. Vorher ggf. „Alle Daten sichern“. Zweiter Lauf folgenlos.
-- =====================================================================

-- Zuerst die Speicher-Richtlinien: Sie hängen an fin_belege.
drop policy if exists "Finance-Belegdateien lesen" on storage.objects;
drop policy if exists "Finance-Belegdateien hochladen" on storage.objects;
drop policy if exists "Finance-Belegdateien löschen" on storage.objects;
drop function if exists public.fin_beleg_buchen(uuid, text, date);
drop function if exists public.fin_beleg_bezahlt(uuid, text, date);
drop function if exists public.fin_beleg_zahlung_zuruecknehmen(uuid, text);
drop function if exists public.fin_beleg_stornieren(uuid, text);
drop function if exists public.fin_beleg_zahlung_schreiben(uuid, text, date);
drop table if exists public.fin_belege;
drop function if exists public.fin_beleg_pruefen();
drop table if exists public.fin_lieferanten;
delete from storage.buckets b where b.id = 'fin-belege' and not exists (select 1 from storage.objects o where o.bucket_id = 'fin-belege');

-- fin_stornieren wie in Migration 89.
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
  if q = 'zahlung' then
    raise exception 'Diese Buchung ist eine Zahlung – zurücknehmen unter Finance › Rechnungen an der Rechnung.';
  end if;
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;
revoke all on function public.fin_stornieren(uuid, text) from public, anon;
grant execute on function public.fin_stornieren(uuid, text) to authenticated;
-- Quelle „beleg“ und das Konto „verbindlichkeit“ in fin_rechnung_konto bleiben: Belegbuchungen stehen im Journal.

select 'Rücknahme 90' as pruefung,
       (to_regclass('public.fin_belege') is null and to_regclass('public.fin_lieferanten') is null
        and to_regprocedure('public.fin_beleg_buchen(uuid,text,date)') is null)::text as ergebnis;
