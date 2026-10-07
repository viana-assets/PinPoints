-- =====================================================================
-- Migration 73 – Der Techniker darf am Auftrag ein neues Kennzeichen anlegen (07.10.2026, v118).
--
-- Befund aus dem Test 07.10.2026: Der Techniker konnte im Auftrag kein neues Kennzeichen
-- eintragen – und ohne Fahrzeug am Auftrag gibt es auch kein Feld für den Kilometerstand.
-- Ursache: Ein Fahrzeug anlegen (`vehicles`, INSERT) verlangte bisher das Recht „Kunden
-- schreiben“ (Migration 16/45). Das hat der Techniker bewusst nicht – er pflegt keine
-- Kundenstammdaten. Das Fahrzeug am Auftrag gehört aber zu seiner Arbeit beim Kunden; die App
-- bietet ihm das Feld „Neues Kennzeichen“ an, auch ohne Netz (v113).
--
-- Neu: Eine zusätzliche INSERT-Richtlinie NUR für den Techniker – und nur für Kunden, auf deren
-- Aufträgen er eingeteilt ist (`ist_eigener_kunde()`, Migration 45), und nur, solange er Aufträge
-- schreiben darf. Mehrere Richtlinien für dieselbe Aktion werden ODER-verknüpft (CLAUDE.md,
-- Abschnitt 2): Für alle anderen Rollen ändert sich nichts. Ändern und Löschen von Fahrzeugen
-- bleiben beim Recht „Kunden schreiben“.
--
-- Dazu am Ende eine Prüftabelle ohne Namen: ob Techniker-Zugänge mit einem Mitarbeiter verknüpft
-- sind und ob Techniker Aufträge schreiben dürfen. Ohne beides scheitern beim Techniker auch
-- Fotos und Kilometerstand – die Datenbank sieht den Auftrag dann nicht als seinen an.
--
-- Reihenfolge: nach 72, SQL zuerst, dann die Dateien von v118.
-- =====================================================================
begin;

drop policy if exists "Techniker legt Fahrzeug eigener Kunden an" on public.vehicles;
create policy "Techniker legt Fahrzeug eigener Kunden an" on public.vehicles
  for insert to authenticated
  with check (
    coalesce(public.current_user_role(), '') = 'techniker'
    and public.darf('auftraege.auftrag', 'schreiben')
    and public.ist_eigener_kunde(customer_id)
  );

commit;

-- Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen. Nur Zahlen, keine Namen.
select 'Richtlinie für den Techniker angelegt' as pruefung,
       (exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehicles'
                 and policyname = 'Techniker legt Fahrzeug eigener Kunden an'))::text as ergebnis
union all
select 'Techniker-Zugänge insgesamt',
       (select count(*) from public.profiles where role = 'techniker')::text
union all
select 'davon OHNE verknüpften Mitarbeiter (sollte 0 sein)',
       (select count(*) from public.profiles p
         where p.role = 'techniker' and not exists (select 1 from public.employees e where e.profile_id = p.id))::text
union all
select 'Techniker darf Aufträge schreiben (sollte true sein)',
       (select coalesce('techniker' = any (edit_roles), false) from public.module_permissions where module_key = 'auftraege.auftrag')::text;
