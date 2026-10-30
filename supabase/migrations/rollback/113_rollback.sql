-- =====================================================================
-- Rücknahme von Migration 113 (Finance: Zahlungsausgang, v186).
--
-- Entfernt Zahlaufträge (samt ihrer Posten), die Bankdaten und Zahlungsbedingungen der Lieferanten und das Recht
-- „Finance › Zahlungen“. Gebucht hat 113 nichts – Belege und Buchungen bleiben unverändert. ACHTUNG: IBAN, BIC und
-- Zahlungsbedingungen der Lieferanten gehen dabei verloren.
-- Vorher die App auf v185 zurücksetzen. Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.fin_zahlauftrag_anlegen(uuid, date, jsonb);
drop function if exists public.fin_zahlauftrag_verwerfen(uuid, text);
drop table if exists public.fin_zahlauftrag_posten;
drop table if exists public.fin_zahlauftraege;

alter table public.fin_lieferanten drop constraint if exists fin_lief_iban;
alter table public.fin_lieferanten drop constraint if exists fin_lief_bic;
alter table public.fin_lieferanten drop constraint if exists fin_lief_ziel;
alter table public.fin_lieferanten drop constraint if exists fin_lief_skonto;
alter table public.fin_lieferanten
  drop column if exists iban,
  drop column if exists bic,
  drop column if exists zahlungsziel_tage,
  drop column if exists skonto_prozent,
  drop column if exists skonto_tage;

delete from public.module_permissions where module_key = 'finance.zahlungen';

select 'Migration 113 zurückgenommen' as pruefung,
       case when to_regclass('public.fin_zahlauftraege') is null
             and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fin_lieferanten' and column_name = 'iban')
             and not exists (select 1 from public.module_permissions where module_key = 'finance.zahlungen')
            then 'ja' else 'NEIN' end as ergebnis;
