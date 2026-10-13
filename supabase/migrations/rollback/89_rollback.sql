-- =====================================================================
-- Rücknahme Migration 89 – Finance F3 (Rechnungen buchen, Zahlungen) wieder entfernen.
--
-- Die Rechnungen in FSM bleiben unberührt. Die Buchungen, die aus Rechnungen und Zahlungen entstanden
-- sind, bleiben im Journal stehen (es wird nie gelöscht); nur der Finance-Stand je Rechnung und die
-- Automatik fallen weg. `fin_stornieren()` wird wieder die Fassung aus Migration 88. Zweiter Lauf folgenlos.
-- =====================================================================

drop trigger if exists trg_zz_fin_rechnung on public.rechnungen;
drop function if exists public.fin_rechnung_nach_insert();
drop function if exists public.fin_rechnungen_stand(integer);
drop function if exists public.fin_zahlung_zuruecknehmen(uuid, text);
drop function if exists public.fin_rechnung_bezahlt(uuid, text, date);
drop function if exists public.fin_rechnung_nachbuchen(uuid);
drop function if exists public.fin_rechnung_storno_erfassen(uuid);
drop function if exists public.fin_rechnung_erfassen(uuid);
drop function if exists public.fin_rechnung_buchen_kern(uuid);
drop table if exists public.fin_rechnungen;

-- fin_stornieren wie in Migration 88 (ohne Bezug auf Rechnungen).
create or replace function public.fin_stornieren(p_id uuid, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.buchen', 'schreiben') then
    raise exception 'Stornieren ist für deine Rolle nicht freigeschaltet (Recht „Finance › Buchungen“ schreiben).';
  end if;
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;
revoke all on function public.fin_stornieren(uuid, text) from public, anon;
grant execute on function public.fin_stornieren(uuid, text) to authenticated;
-- fin_gegenbuchung, fin_offenes_datum, fin_rechnung_konto bleiben: fin_stornieren braucht die erste,
-- die anderen sind harmlos. Die Quelle „zahlung“ bleibt erlaubt, weil Zahlungsbuchungen im Journal stehen.

select 'Rücknahme 89' as pruefung,
       (to_regclass('public.fin_rechnungen') is null and to_regprocedure('public.fin_rechnungen_stand(integer)') is null
        and not exists (select 1 from pg_trigger where tgname = 'trg_zz_fin_rechnung'))::text as ergebnis;
