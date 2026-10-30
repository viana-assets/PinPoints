-- =====================================================================
-- Rücknahme Migration 110 – Personenkonten (v184).
--
-- Entfernt den Trigger, die Funktionen, die Spalte `fin_buchungszeilen.personenkonto` und die Tabelle
-- `fin_personenkonten`. Die Buchungen selbst bleiben unverändert (gebucht war immer auf dem Sammelkonto); nur die
-- Zuordnung zu Debitor/Kreditor geht verloren und entsteht beim erneuten Ausführen von 110 wieder. Zweimal lauffähig.
-- Danach die App auf v183 zurück (sie liest `personenkonto` und `fin_personenkonten_stand()`).
-- =====================================================================

drop trigger if exists trg_fin_zeile_personenkonto on public.fin_buchungszeilen;
drop function if exists public.fin_zeile_personenkonto();
drop function if exists public.fin_personenkonten_stand(integer);
drop function if exists public.fin_personenkonto_fuer(uuid, integer);
drop function if exists public.fin_debitor(uuid, integer);
drop function if exists public.fin_debitor(uuid);
drop function if exists public.fin_kreditor(uuid);
drop index if exists public.fin_zeilen_personenkonto;
alter table public.fin_buchungszeilen drop column if exists personenkonto;
drop table if exists public.fin_personenkonten;

select 'Tabelle fin_personenkonten' as pruefung, case when to_regclass('public.fin_personenkonten') is null then 'weg' else 'noch da' end as ergebnis
union all
select 'Spalte personenkonto',
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fin_buchungszeilen' and column_name = 'personenkonto')
            then 'noch da' else 'weg' end;
