-- Rollback zu Migration 71 (Notiz je Rad am Satz).
--
-- ACHTUNG: Die Notizen je Rad gehen dabei verloren, soweit es zu ihnen kein gemessenes Rad gibt.
-- Wo eines da ist (Satz „je Rad“) und dessen Bemerkung leer ist, wird die Notiz dorthin
-- zurückgeschrieben. Das Zurückschreiben und das Entfernen der Spalten stehen in EINER Anweisung –
-- scheitert das eine, unterbleibt auch das andere (der SQL-Editor schließt jede Anweisung für sich ab).
-- Die Auskunft nach DSGVO ist danach wieder die aus Migration 65.
-- Reihenfolge: zuerst die Dateien von v114 hochladen, dann dieses Skript.
begin;

create or replace function public.kunde_auskunft(p_kunde uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ergebnis jsonb;
begin
  ergebnis := public.kunde_auskunft_grund(p_kunde);
  return ergebnis || jsonb_build_object('belege', coalesce((
    select jsonb_agg(jsonb_build_object('auftrag', o.order_number, 'art', b.art, 'beschriftung', b.beschriftung,
                                        'aufgenommen', b.created_at) order by b.created_at, b.id)
      from public.auftrag_belege b join public.orders o on o.id = b.order_id
     where o.customer_id = p_kunde), '[]'::jsonb));
end;
$$;
comment on function public.kunde_auskunft(uuid) is
  'Fahrplan E10 (Migration 64), seit Migration 65 mit den Belegen (Fotos/Unterschrift). Nur Admin/Superadmin.';

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'notiz_vl') then
    update public.eingelagerte_raeder r set bemerkung = case r.position
        when 'VL' then t.notiz_vl when 'VR' then t.notiz_vr when 'HL' then t.notiz_hl when 'HR' then t.notiz_hr end
      from public.tire_storage t
     where t.id = r.tire_storage_id and coalesce(btrim(r.bemerkung), '') = ''
       and coalesce(btrim(case r.position
             when 'VL' then t.notiz_vl when 'VR' then t.notiz_vr when 'HL' then t.notiz_hl when 'HR' then t.notiz_hr end), '') <> '';
    alter table public.tire_storage drop constraint if exists tire_storage_notiz_je_rad_laenge;
    alter table public.tire_storage
      drop column if exists notiz_vl, drop column if exists notiz_vr,
      drop column if exists notiz_hl, drop column if exists notiz_hr;
  end if;
end $$;

commit;

select 'Spalten notiz_vl … entfernt' as pruefung,
       (not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'notiz_vl'))::text as ergebnis;
