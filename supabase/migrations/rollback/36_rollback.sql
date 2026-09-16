-- =====================================================================
-- Viana PinPoints – Rücknahme von 36
--
-- Nimmt NUR zurück, was 36 hinzugefügt hat. Das Protokoll selbst stammt aus Migration 18 und
-- bleibt unberührt – samt allem, was es bisher aufgezeichnet hat. Wer das Protokoll ganz
-- abschalten will, nimmt 18 zurück, nicht dies hier.
-- =====================================================================

-- Die drei nachgezogenen Tabellen schreiben nicht mehr mit.
do $$
declare
  t text;
begin
  foreach t in array array['order_employees', 'firmenfahrzeuge', 'eingelagerte_raeder'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists trg_audit_row on public.%I', t);
    execute format('drop trigger if exists trg_stamp_row on public.%I', t);
  end loop;
end $$;
-- Die Spalten created_by/updated_by/updated_at bleiben stehen: Sie stören nicht, und ihr
-- Entfernen würde Angaben vernichten, die bereits geschrieben wurden.

-- Leserecht wieder auf Superadmin einengen (Stand von Migration 18).
drop policy if exists "Admin liest das Protokoll" on public.audit_log;
create policy "Superadmin liest das Protokoll" on public.audit_log
  for select to authenticated
  using ((select coalesce(public.current_user_role(), '')) = 'superadmin');

drop index if exists public.audit_log_auftrag_idx;
drop index if exists public.audit_log_kunde_idx;
drop index if exists public.audit_log_wer_idx;
alter table public.audit_log drop column if exists auftrag_id;
alter table public.audit_log drop column if exists kunde_id;
drop function if exists public.als_uuid(text);

drop function if exists public.protokoll_personen();
