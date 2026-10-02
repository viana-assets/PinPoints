-- Rollback zu Migration 65 (Foto und Unterschrift am Auftrag).
--
-- Erst den Code zurückdrehen, dann dieses Skript.
--
-- Der Speicherbereich `auftrag-belege` und die Dateien darin bleiben stehen: Supabase erlaubt das
-- Löschen von Dateien und Speicherbereichen nicht mehr per SQL. Wer sie loswerden will, leert und
-- löscht den Bucket im Supabase-Dashboard unter „Storage". Die Richtlinien auf storage.objects nimmt
-- dieses Skript zurück – danach kommt niemand mehr an die Dateien heran.
begin;

drop policy if exists "MR Belege lesen" on storage.objects;
drop policy if exists "MR Belege hochladen" on storage.objects;
drop policy if exists "MR Belege loeschen" on storage.objects;

drop table if exists public.auftrag_belege;

do $$
begin
  if to_regprocedure('public.kunde_auskunft_grund(uuid)') is not null then
    drop function if exists public.kunde_auskunft(uuid);
    alter function public.kunde_auskunft_grund(uuid) rename to kunde_auskunft;
    revoke all on function public.kunde_auskunft(uuid) from public, anon;
    grant execute on function public.kunde_auskunft(uuid) to authenticated;
  end if;
end $$;

commit;

select 'Tabelle auftrag_belege entfernt' as pruefung, (to_regclass('public.auftrag_belege') is null)::text as ergebnis
union all
select 'Auskunft wieder wie Migration 64', (to_regprocedure('public.kunde_auskunft_grund(uuid)') is null and to_regprocedure('public.kunde_auskunft(uuid)') is not null)::text
union all
select 'Speicher-Richtlinien entfernt', (not exists (select 1 from pg_policies where schemaname = 'storage' and policyname like 'MR Belege%'))::text;
