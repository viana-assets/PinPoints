-- =====================================================================
-- Migration 76 – Ein Tausch fällt mit dem Storno oder Löschen seines Auftrags weg
-- (07.10.2026, v122).
--
-- Befund 07.10.2026 (Bildschirmfoto, Auftrag mit vorgemerktem Satz auf einem Platz): „⇄ Tausch auf
-- …“ scheiterte mit „duplicate key value violates unique constraint
-- tire_storage_ein_tausch_je_platz“. Auf dem Platz stand schon ein Tausch-Satz (`kommt_rein`) –
-- aus einem ANDEREN Auftrag, der inzwischen storniert oder gelöscht war. Migration 69 hob beim
-- Storno/Löschen nur die Vormerkung des alten Satzes auf, den Tausch-Satz ließ sie stehen. Er war
-- danach nirgends mehr zu sehen (Tausch-Sätze erscheinen nur in ihrem Auftrag) und sperrte den
-- Platz für jeden neuen Tausch.
--
-- Neu:
--   1. `auftrag_lager_entnahme()`: Beim Stornieren oder Löschen werden auch die Tausch-Sätze dieses
--      Auftrags verworfen (`removed_at`) – sie lagen nie im Regal. Sonst unverändert wie Migration 69.
--   2. Vorhandene verwaiste Tausch-Sätze werden einmal verworfen: Tausch-Sätze, deren Auftrag fehlt,
--      gelöscht, storniert oder abgeschlossen ist, oder deren alter Satz nicht mehr für denselben
--      Auftrag vorgemerkt ist. Ein gültiger Tausch an einem offenen Auftrag bleibt unberührt.
--      Das Protokoll hält jede Änderung fest.
--
-- Reihenfolge: nach 75, SQL zuerst, dann die Dateien von v122.
-- =====================================================================

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
    -- Migration 76: zuerst die Tausch-Sätze verwerfen – solange einer steht, ließe sich die
    -- Vormerkung des alten Satzes nicht aufheben (Migration 69).
    update public.tire_storage set removed_at = now()
     where order_id = new.id and kommt_rein and removed_at is null;
    update public.tire_storage set entnahme_order_id = null
     where entnahme_order_id = new.id and removed_at is null;
  end if;
  return null;
end;
$$;

-- Einmal aufräumen: verwaiste Tausch-Sätze verwerfen. Eine Anweisung; ein zweiter Lauf findet nichts.
update public.tire_storage k
   set removed_at = now()
 where k.kommt_rein and k.removed_at is null
   and (
     not exists (select 1 from public.orders o
                  where o.id = k.order_id and o.deleted_at is null and o.status in ('offen', 'in_arbeit'))
     or not exists (select 1 from public.tire_storage a
                     where a.id = k.tausch_fuer and a.removed_at is null
                       and a.entnahme_order_id is not distinct from k.order_id)
   );

-- Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen. Nur Platz und Nummer.
select 'Verworfene verwaiste Tausch-Sätze (heute)' as pruefung,
       coalesce((select string_agg(coalesce(s.code, '?'), ', ' order by s.code)
                   from public.tire_storage k left join public.storage_slots s on s.id = k.storage_slot_id
                  where k.kommt_rein and k.removed_at >= current_date), 'keine') as ergebnis
union all
select 'Noch wartende Tausch-Sätze (gültig, an offenen Aufträgen)',
       (select count(*) from public.tire_storage where kommt_rein and removed_at is null)::text
union all
select 'Storno verwirft Tausch',
       (position('Migration 76' in pg_get_functiondef('public.auftrag_lager_entnahme()'::regprocedure)) > 0)::text;
