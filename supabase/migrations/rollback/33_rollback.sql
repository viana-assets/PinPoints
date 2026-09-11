-- Rücknahme von 33_eingelagerte_raeder.sql.
--
-- ZUERST den Anwendungscode zurückdrehen.
--
-- ACHTUNG: Die einzeln gemessenen Profiltiefen gehen verloren – das ist echte Messarbeit.
-- Wer sie retten will, schreibt vorher wenigstens das Minimum je Satz in den Sammelwert:
--
--   update public.tire_storage ts
--      set profiltiefe_mm = (select min(r.profiltiefe_mm) from public.eingelagerte_raeder r
--                             where r.tire_storage_id = ts.id)
--    where ts.erfassungsart = 'einzeln';
--   update public.tire_storage set erfassungsart = 'sammel' where erfassungsart = 'einzeln';
--
-- (Der Umstellungs-Trigger verhindert das, solange Radzeilen existieren – deshalb erst nach
--  dem Entfernen der Trigger unten ausführen.)

drop trigger if exists trg_satz_erfassungsart_wechsel on public.tire_storage;
drop function if exists public.satz_erfassungsart_wechsel();
drop trigger if exists trg_rad_passt_zum_satz on public.eingelagerte_raeder;
drop function if exists public.rad_passt_zum_satz();

drop table if exists public.eingelagerte_raeder;

alter table public.tire_storage drop constraint if exists tire_storage_kein_doppelter_profilwert;
alter table public.tire_storage drop constraint if exists tire_storage_anzahl_raeder_gueltig;
alter table public.tire_storage drop constraint if exists tire_storage_erfassungsart_gueltig;
alter table public.tire_storage drop column if exists anzahl_raeder;
alter table public.tire_storage drop column if exists erfassungsart;
