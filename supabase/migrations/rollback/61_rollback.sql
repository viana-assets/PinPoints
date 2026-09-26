-- Rollback zu Migration 61 (Reifenverkauf aus dem Lager).
--
-- Erst den Code zurückdrehen, dann dieses Skript. Mit der Tabelle verschwinden alle
-- Verkaufsreifen samt ihrem Bestand. Positionen auf Aufträgen bleiben stehen (Artikel, Menge,
-- Preis und Text), sie verlieren nur den Verweis auf den Reifen.
--
-- Die beiden Artikel „Reifen neu" / „Reifen gebraucht" bleiben ebenfalls stehen – sie können
-- auf Aufträgen und Rechnungen vorkommen. Ihre Abrechnungsart wird auf „normal" gesetzt, damit
-- die alte Prüfregel aus Migration 46 wieder passt.
begin;

drop trigger if exists trg_reifenverkauf_buchen on public.orders;
drop trigger if exists trg_testauftrag_reifen_zurueck on public.orders;
drop trigger if exists trg_position_verkaufsreifen_pruefen on public.order_articles;
drop trigger if exists trg_position_verkaufsreifen_zaehlen on public.order_articles;
drop trigger if exists trg_platz_ohne_verkaufsreifen on public.tire_storage;

drop function if exists public.auftrag_reifenverkauf_buchen();
drop function if exists public.testauftrag_reifen_zurueck();
drop function if exists public.position_verkaufsreifen_pruefen();
drop function if exists public.position_verkaufsreifen_zaehlen();
drop function if exists public.platz_ohne_verkaufsreifen();

alter table public.order_articles drop column if exists verkaufsreifen_id;

drop table if exists public.verkaufsreifen;
drop function if exists public.verkaufsreifen_pruefen();
drop function if exists public.verkaufsreifen_zaehlen(uuid, integer, integer, text);

-- Die Löschsperre für Lager und Plätze wieder in der Fassung von Migration 55.
create or replace function public.lager_belegt_nicht_loeschen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  anzahl integer;
  beispiele text;
begin
  if tg_table_name = 'storage_slots' then
    select count(*) into anzahl
      from public.tire_storage t
     where t.storage_slot_id = old.id and t.removed_at is null;
    if anzahl > 0 then
      raise exception 'Lagerplatz % ist belegt. Erst den Satz auslagern oder umlagern, dann löschen.', old.code;
    end if;
  elsif tg_table_name = 'warehouses' then
    select count(*), string_agg(s.code, ', ' order by s.code)
      into anzahl, beispiele
      from public.tire_storage t
      join public.storage_slots s on s.id = t.storage_slot_id
     where s.warehouse_id = old.id and t.removed_at is null;
    if anzahl > 0 then
      raise exception 'Lager "%" kann nicht gelöscht werden: % belegte(r) Platz/Plätze (%). Erst auslagern oder umlagern.',
        old.name, anzahl, left(beispiele, 200);
    end if;
  end if;
  return old;
end;
$$;

update public.articles set abrechnungsart = 'normal' where abrechnungsart like 'reifenverkauf%';

alter table public.articles
  drop constraint if exists articles_abrechnungsart_bekannt,
  add constraint articles_abrechnungsart_bekannt check (abrechnungsart in ('normal', 'lagergebuehr'));

delete from public.module_permissions where module_key = 'lager.verkauf';

commit;
