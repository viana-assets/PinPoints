-- =====================================================================
-- Viana PinPoints – Rücknahme von 38
--
-- Zuerst den Anwendungscode zurückdrehen: Die aktuelle Fassung schreibt `rechnung_noetig` und
-- `endpreis_netto` und liest das Terminraster aus `betrieb`.
--
-- Die Endpreise gehen verloren. `discount_percent` steht noch – 38 hat es absichtlich nicht
-- gelöscht –, enthält aber den Stand von vor 38: Alles, was seither an Sonderpreisen
-- eingetragen wurde, ist danach weg. Vorher sichern:
--
--   select oa.id, o.order_number, oa.quantity, oa.net_price, oa.endpreis_netto
--   from public.order_articles oa join public.orders o on o.id = oa.order_id
--   where oa.endpreis_netto is not null;
-- =====================================================================

alter table public.order_articles drop constraint if exists order_articles_endpreis_nicht_negativ;
alter table public.order_articles drop column if exists endpreis_netto;
alter table public.orders drop column if exists rechnung_noetig;

drop trigger if exists trg_audit_row on public.betrieb;
drop table if exists public.betrieb;
