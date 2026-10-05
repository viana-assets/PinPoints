-- Rollback zu Migration 67 (Auslagern erst beim Abschließen).
--
-- Entfernt die Trigger und Funktionen und die Spalte `order_articles.lager_satz_id`. Sätze, die
-- gerade vorgemerkt sind, werden dabei SOFORT ausgelagert – so, wie es die Fassung v110 getan
-- hätte (die Gebühr steht ja schon auf dem Auftrag). Erst danach lässt sich die Prüfung aus
-- Migration 46 („Entnahme braucht ein Datum“) wieder anlegen.
-- Reihenfolge: zuerst die Dateien von v110 hochladen (die von v111 merken nur vor), dann dieses Skript.
begin;

drop trigger if exists trg_auftrag_lager_entnahme on public.orders;
drop function if exists public.auftrag_lager_entnahme();
drop trigger if exists trg_tire_storage_vormerkung_pruefen on public.tire_storage;
drop function if exists public.tire_storage_vormerkung_pruefen();
drop function if exists public.lager_vormerkung_zurueck(uuid);

update public.tire_storage set removed_at = now()
 where entnahme_order_id is not null and removed_at is null;

drop index if exists public.order_articles_lager_satz_idx;
alter table public.order_articles drop column if exists lager_satz_id;

comment on column public.tire_storage.entnahme_order_id is
  'In welchem Auftrag wurde dieser Satz herausgegeben? Dort steht die Lagergebühr. Null bei Sätzen, die noch liegen oder die ohne Auftrag entnommen wurden.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.tire_storage'::regclass and conname = 'tire_storage_entnahme_braucht_datum'
  ) then
    alter table public.tire_storage
      add constraint tire_storage_entnahme_braucht_datum
      check (entnahme_order_id is null or removed_at is not null);
  end if;
end $$;

commit;

select 'Vorgemerkte Sätze nach dem Rollback' as pruefung,
       (select count(*)::text from public.tire_storage where entnahme_order_id is not null and removed_at is null) as ergebnis;
