-- Rollback zu Migration 76 (Tausch fällt mit Storno/Löschen weg).
--
-- Stellt `auftrag_lager_entnahme()` wie in Migration 69 wieder her: Storno und Löschen heben dann
-- wieder nur die Vormerkung auf. Die verworfenen verwaisten Tausch-Sätze bleiben verworfen – sie
-- lagen nie im Regal; wer einen zurückbraucht, findet ihn im Protokoll. Zweimal lauffähig.
-- Reihenfolge: zuerst die Dateien von v121 hochladen, dann dieses Skript.
create or replace function public.auftrag_lager_entnahme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  satz record;
  belegt text;
begin
  if new.status = 'erledigt' and old.status is distinct from 'erledigt' then
    update public.tire_storage set removed_at = now()
     where entnahme_order_id = new.id and removed_at is null;

    -- Migration 69: Tausch-Sätze dieses Auftrags übernehmen ihren Platz.
    for satz in
      select ts.id, ts.storage_slot_id from public.tire_storage ts
       where ts.order_id = new.id and ts.kommt_rein and ts.removed_at is null
    loop
      if exists (select 1 from public.tire_storage a
                  where a.storage_slot_id = satz.storage_slot_id and a.removed_at is null and not a.kommt_rein)
         or exists (select 1 from public.verkaufsreifen v
                     where v.storage_slot_id = satz.storage_slot_id and v.bestand > 0) then
        select s.code into belegt from public.storage_slots s where s.id = satz.storage_slot_id;
        raise exception 'Platz % ist noch belegt – der Tausch lässt sich nicht abschließen. Den alten Satz für diesen Auftrag vormerken oder den neuen auf einen anderen Platz legen.', coalesce(belegt, '?');
      end if;
      update public.tire_storage set kommt_rein = false where id = satz.id;
    end loop;
  elsif old.status = 'erledigt' and new.status in ('offen', 'in_arbeit') then
    perform public.lager_vormerkung_zurueck(new.id);
  end if;

  if (new.status = 'storniert' and old.status is distinct from 'storniert')
     or (new.deleted_at is not null and old.deleted_at is null) then
    update public.tire_storage set entnahme_order_id = null
     where entnahme_order_id = new.id and removed_at is null;
  end if;
  return null;
end;
$$;

select 'Funktion wie Migration 69' as pruefung,
       (position('Migration 76' in pg_get_functiondef('public.auftrag_lager_entnahme()'::regprocedure)) = 0)::text as ergebnis;
