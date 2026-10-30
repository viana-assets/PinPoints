-- =====================================================================
-- Rücknahme von Migration 114 (Finance: Belegbild an jeder Buchung, v186).
--
-- Weigert sich, solange Dateien an Buchungen hängen: Die Dateien selbst löscht kein SQL (Migration 65) und blieben
-- ohne Verweis im Bucket liegen. Stellt die Löschregel aus Migration 90 wieder her.
-- Alles steht in EINEM Block: Bricht die Prüfung ab, läuft auch kein Löschen weiter (der SQL-Editor führt die Anweisungen
-- einer Datei einzeln aus). Vorher die App auf v185 zurücksetzen. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  -- Getrennt prüfen: eine Abfrage auf eine fehlende Tabelle scheitert schon beim Planen (zweiter Lauf).
  if to_regclass('public.fin_buchung_dateien') is not null then
    if exists (select 1 from public.fin_buchung_dateien) then
      raise exception 'An Buchungen hängen Belegbilder – die Rücknahme würde ihre Verweise löschen. Es wurde nichts geändert.';
    end if;
  end if;

  drop policy if exists "Finance-Buchungsdateien lesen" on storage.objects;
  drop policy if exists "Finance-Buchungsdateien hochladen" on storage.objects;
  drop policy if exists "Finance-Belegdateien löschen" on storage.objects;
  create policy "Finance-Belegdateien löschen" on storage.objects for delete to authenticated
    using (bucket_id = 'fin-belege' and public.darf('finance.belege', 'schreiben')
           and not exists (select 1 from public.fin_belege b where b.id::text = (storage.foldername(name))[1] and b.status <> 'entwurf'));

  drop function if exists public.fin_buchung_datei_merken(uuid, text, text, text);
  drop table if exists public.fin_buchung_dateien;
end $$;

select 'Migration 114 zurückgenommen' as pruefung,
       case when to_regclass('public.fin_buchung_dateien') is null
             and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'Finance-Buchungsdateien%')
            then 'ja' else 'NEIN' end as ergebnis;
