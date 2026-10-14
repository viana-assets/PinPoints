-- =====================================================================
-- Rücknahme Migration 95 – Finance F7 (Anlagen und Abschreibungen) wieder entfernen.
--
-- ACHTUNG: Löscht das Anlagenverzeichnis und die Liste der gebuchten Abschreibungen. Die Buchungen selbst bleiben
-- im Journal (es wird nie gelöscht). Die Einstellung „Sammelposten“ geht verloren. Die neuen Konten gehen nur, wenn
-- nichts darauf gebucht ist; die Quellen `afa`/`abgang` bleiben erlaubt, solange es solche Buchungen gibt.
-- `fin_stornieren()` wird die Fassung aus Migration 91. Vorher ggf. „Alle Daten sichern“. Zweiter Lauf folgenlos.
-- =====================================================================

drop trigger if exists fin_einstellungen_sammelposten_sperre on public.fin_einstellungen;
drop function if exists public.fin_einstellungen_sammelposten_sperre();
drop function if exists public.fin_afa_gebucht(integer);
drop function if exists public.fin_anlage_abgang_zuruecknehmen(uuid, text);
drop function if exists public.fin_anlage_abgang(uuid, date, text);
drop function if exists public.fin_afa_buchen(integer, integer);
drop function if exists public.fin_afa_buchen_kern(integer, integer, uuid);
drop function if exists public.fin_anlage_loeschen(uuid);
drop function if exists public.fin_anlage_speichern(uuid, jsonb);
drop function if exists public.fin_anlage_afa_bis(uuid, integer);
drop function if exists public.fin_afa_bis(text, numeric, integer, numeric, date, date, integer);
drop table if exists public.fin_afa_posten;
drop table if exists public.fin_anlagen;
alter table public.fin_einstellungen drop column if exists sammelposten;

-- wie Migration 91
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
  if q = 'bank' then
    raise exception 'Diese Buchung kommt aus dem Bankabgleich – unter Finance › Bank & Kasse die Zuordnung aufheben.';
  end if;
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;

delete from public.fin_konten k where (k.kontenrahmen, k.nummer) in (('skr03', 4862), ('skr04', 6264), ('skr03', 2310), ('skr04', 6895))
   and not exists (select 1 from public.fin_buchungszeilen z where z.konto = k.nummer);

do $$
begin
  if not exists (select 1 from public.fin_buchungen where quelle in ('afa', 'abgang')) then
    alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
    alter table public.fin_buchungen add constraint fin_buchung_quelle check (quelle in ('manuell', 'rechnung', 'zahlung', 'beleg', 'bank', 'kasse'));
  end if;
end $$;

select 'Rücknahme 95' as pruefung,
       case when to_regclass('public.fin_anlagen') is null and to_regprocedure('public.fin_afa_buchen(integer,integer)') is null
            then 'entfernt' else 'NICHT vollständig' end as ergebnis;
