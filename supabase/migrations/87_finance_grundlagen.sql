-- =====================================================================
-- Migration 87 – Finance, Phase F0: Rechte und Einstellungen (13.10.2026, v145).
--
-- Wunsch Vitali 13.10.2026 (docs/finance.md): Finance als eigenes System neben FSM, zuerst NUR für
-- den Superadmin. Diese Migration legt an, was F0 braucht – noch keine Buchhaltung:
--
--   1. RECHTE `finance` und `finance.*` in module_permissions – alle Rollenlisten LEER. Der Superadmin
--      darf ohnehin alles (`darf()`), alle anderen sehen nichts, bis sie in Admin › Rechte freigeschaltet
--      werden. `on conflict do nothing`: Wer schon freigeschaltet hat, behält es beim zweiten Lauf.
--   2. TABELLE `fin_einstellungen` – je Wirtschaftsjahr eine Zeile: Rechtsform, Gewinnermittlung
--      (EÜR/Bilanz), Kontenrahmen (SKR03/04), Besteuerung (Regel/Kleinunternehmer § 19), Soll/Ist,
--      Voranmeldungszeitraum, Dauerfristverlängerung, § 13b, innergemeinschaftliche Geschäfte,
--      Starttag. Lesen mit „Finance öffnen“, schreiben mit „Finance-Einstellungen“. Kein Löschen.
--      „Alle Daten löschen“ leert die Tabelle mit (entschieden 13.10.2026, docs/finance.md Abschnitt 8).
--
-- Reihenfolge: nach 86, SQL zuerst, dann die Dateien von v145. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.darf(text,text)') is null then
    raise exception 'Zuerst Migration 42 (Rechte darf()) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Rechte – alle leer: nur der Superadmin
-- ---------------------------------------------------------------------
insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
values ('finance',               '{}'::text[], '{}'::text[], '{}'::text[]),
       ('finance.rechnungen',    '{}'::text[], '{}'::text[], '{}'::text[]),
       ('finance.belege',        '{}'::text[], '{}'::text[], '{}'::text[]),
       ('finance.bank',          '{}'::text[], '{}'::text[], '{}'::text[]),
       ('finance.buchen',        '{}'::text[], '{}'::text[], '{}'::text[]),
       ('finance.steuer',        '{}'::text[], '{}'::text[], '{}'::text[]),
       ('finance.abschluss',     '{}'::text[], '{}'::text[], '{}'::text[]),
       ('finance.einstellungen', '{}'::text[], '{}'::text[], '{}'::text[])
on conflict (module_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Einstellungen je Wirtschaftsjahr
-- ---------------------------------------------------------------------
create table if not exists public.fin_einstellungen (
  wirtschaftsjahr       integer primary key,
  rechtsform            text not null default 'einzel',
  gewinnermittlung      text not null default 'euer',
  kontenrahmen          text not null default 'skr03',
  besteuerung           text not null default 'regel',
  versteuerung          text not null default 'soll',
  voranmeldung          text not null default 'monat',
  dauerfrist            boolean not null default false,
  r13b_empfaenger       boolean not null default true,
  innergemeinschaftlich boolean not null default false,
  wj_beginn_monat       smallint not null default 1,
  start_datum           date not null default current_date,
  aktualisiert_am       timestamptz not null default now(),
  aktualisiert_von      uuid default auth.uid(),
  constraint fin_einst_jahr        check (wirtschaftsjahr between 2000 and 2100),
  constraint fin_einst_rechtsform  check (rechtsform in ('einzel', 'gbr', 'ug', 'gmbh', 'sonstige')),
  constraint fin_einst_gewinn      check (gewinnermittlung in ('euer', 'bilanz')),
  constraint fin_einst_konten      check (kontenrahmen in ('skr03', 'skr04')),
  constraint fin_einst_besteuerung check (besteuerung in ('regel', 'klein')),
  constraint fin_einst_versteuerung check (versteuerung in ('soll', 'ist')),
  constraint fin_einst_voranmeldung check (voranmeldung in ('monat', 'quartal', 'keine')),
  constraint fin_einst_dauerfrist  check (not (dauerfrist and voranmeldung = 'keine')),
  constraint fin_einst_wj_monat    check (wj_beginn_monat between 1 and 12)
);
comment on table public.fin_einstellungen is
  'Migration 87: Finance-Einstellungen je Wirtschaftsjahr (Gewinnermittlung, Kontenrahmen, Umsatzsteuer). Lesen: finance, schreiben: finance.einstellungen. docs/finance.md Abschnitt 3.';

alter table public.fin_einstellungen enable row level security;

drop policy if exists "Finance-Einstellungen lesen" on public.fin_einstellungen;
create policy "Finance-Einstellungen lesen" on public.fin_einstellungen
  for select to authenticated using (public.darf('finance', 'lesen'));
drop policy if exists "Finance-Einstellungen anlegen" on public.fin_einstellungen;
create policy "Finance-Einstellungen anlegen" on public.fin_einstellungen
  for insert to authenticated with check (public.darf('finance.einstellungen', 'schreiben'));
drop policy if exists "Finance-Einstellungen ändern" on public.fin_einstellungen;
create policy "Finance-Einstellungen ändern" on public.fin_einstellungen
  for update to authenticated
  using (public.darf('finance.einstellungen', 'schreiben'))
  with check (public.darf('finance.einstellungen', 'schreiben'));
-- Bewusst keine Löschrichtlinie: Einstellungen werden geändert, nicht gelöscht.

revoke all on public.fin_einstellungen from anon;
grant select, insert, update on public.fin_einstellungen to authenticated;

-- Wer wann zuletzt geändert hat, setzt die Datenbank – nicht die App.
create or replace function public.fin_einstellungen_stempel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.aktualisiert_am := now();
  new.aktualisiert_von := (select auth.uid());
  return new;
end;
$$;
drop trigger if exists fin_einstellungen_stempel on public.fin_einstellungen;
create trigger fin_einstellungen_stempel before insert or update on public.fin_einstellungen
  for each row execute function public.fin_einstellungen_stempel();

-- ---------------------------------------------------------------------
-- 3. Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
-- ---------------------------------------------------------------------
select 'Rechte finance.* (Rollen, die lesen dürfen)' as pruefung,
       coalesce((select string_agg(module_key || ': ' || coalesce(nullif(array_to_string(read_roles, ', '), ''), 'nur Superadmin'), ' · ' order by module_key)
                   from public.module_permissions where module_key like 'finance%'), 'fehlt') as ergebnis
union all
select 'Tabelle fin_einstellungen (RLS)',
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_einstellungen')), 'fehlt')
union all
select 'Richtlinien auf fin_einstellungen',
       coalesce((select string_agg(p.cmd || ' · ' || p.policyname, ', ' order by p.cmd) from pg_policies p
                  where p.schemaname = 'public' and p.tablename = 'fin_einstellungen'), 'keine');
