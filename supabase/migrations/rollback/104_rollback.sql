-- =====================================================================
-- Rücknahme von Migration 104 (Bestellliste). Zweimal lauffähig. Erst die Dateien von v172 wieder hochladen.
-- ACHTUNG: Alle Bestellwünsche und „+1“ sind danach weg. Vorher bei Bedarf in der App „Liste kopieren“.
-- Der Bucket `bestell-fotos` wird nur entfernt, wenn er leer ist – Dateien löscht SQL in Supabase nicht
-- (Migration 65). Liegen noch Fotos darin, zeigt die Ergebnistabelle die Zahl; dann im Supabase-Dashboard
-- unter Storage › bestell-fotos leeren und diese Rücknahme noch einmal laufen lassen.
-- =====================================================================

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.orders') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.profiles / public.orders. Diese Rücknahme gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

drop policy if exists "MR Bestellfotos lesen" on storage.objects;
drop policy if exists "MR Bestellfotos hochladen" on storage.objects;
drop policy if exists "MR Bestellfotos loeschen" on storage.objects;

drop table if exists public.bestellwunsch_plus;
drop table if exists public.bestellwuensche;
drop function if exists public.bestellwunsch_pruefen();
drop function if exists public.bestellwunsch_push_anstossen();

delete from public.module_permissions where module_key in ('bestellungen', 'bestellungen.verwalten');

delete from storage.buckets b
 where b.id = 'bestell-fotos'
   and not exists (select 1 from storage.objects o where o.bucket_id = 'bestell-fotos');

select 'Tabellen entfernt' as pruefung,
       case when to_regclass('public.bestellwuensche') is null and to_regclass('public.bestellwunsch_plus') is null then 'ja' else 'nein' end as ergebnis
union all
select 'Rechte entfernt', case when exists (select 1 from public.module_permissions where module_key like 'bestellungen%') then 'nein' else 'ja' end
union all
select 'Bucket bestell-fotos',
       case when not exists (select 1 from storage.buckets where id = 'bestell-fotos') then 'entfernt'
            else 'noch da – ' || (select count(*)::text from storage.objects where bucket_id = 'bestell-fotos') || ' Datei(en) erst im Dashboard löschen' end;
