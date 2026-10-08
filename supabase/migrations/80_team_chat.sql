-- =====================================================================
-- Migration 80 – Team-Chat (08.10.2026, v129).
--
-- Wunsch Vitali 08.10.2026, Entwurf „Team-Chat“ abgenickt: EIN gemeinsamer Chat für alle mit
-- Zugang, Nachrichten mit einer Karte („Bezug“) auf Auftrag, Kunde, Lagerplatz oder
-- Verkaufsreifen, @-Erwähnungen, Push-Mitteilung bei JEDER Nachricht an alle anderen, rote Zahl
-- an der Chat-Blase und am App-Symbol. Aufbewahrung 12 Monate. Rechte: neue Zeile „chat“ in der
-- Rechtematrix (lesen/schreiben), ab Werk Admin, Techniker, Nutzer.
--
-- Bausteine:
--   - `chat_nachrichten`: eine Zeile je Nachricht. `kanal` ist heute immer 'team' – das Feld ist
--     die Tür für spätere Einzelchats. Der Bezug wird als Schnappschuss gespeichert (`bezug_titel`,
--     `bezug_unter`), damit die Karte auch dann noch lesbar ist, wenn der Auftrag nicht mehr im
--     geladenen Zeitraum liegt. Nicht protokolliert (kein audit_row): Das Protokoll hielte den
--     Text 36 Monate fest, der Chat soll nach 12 Monaten weg sein.
--   - `chat_gelesen`: je Zugang „gelesen bis“. Daraus zählt `chat_ungelesen()`.
--   - `chat_personen()`: wer im Chat vorkommt (Name aus `employees`, sonst die E-Mail).
--   - Push: Ein Trigger meldet jede neue Nachricht an `/api/push/senden` (wie der Zeitgeber aus
--     Migration 28, über `private.push_konfiguration`); die Route schickt sie an alle anderen
--     Geräte. Was dabei durchrutscht, holt der Minutentakt nach (`push_gesendet_am` ist leer).
--   - Wird ein Kunde oder Auftrag endgültig gelöscht, vergisst die Karte den Inhalt
--     (`chat_bezug_vergessen()`); der Text der Nachricht bleibt, wie er geschrieben wurde.
--   - Nächtlich um 03:25 UTC: Nachrichten älter als 12 Monate löschen (`chat_aufraeumen()`).
--
-- Reihenfolge: nach 79, SQL zuerst, dann die Dateien von v129. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Recht „chat“
-- ---------------------------------------------------------------------
insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
values ('chat', array['admin', 'techniker', 'user'], array['admin', 'techniker', 'user'], '{}'::text[])
on conflict (module_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Tabellen
-- ---------------------------------------------------------------------
create table if not exists public.chat_nachrichten (
  id               uuid primary key default gen_random_uuid(),
  kanal            text not null default 'team',
  autor            uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  text             text not null,
  bezug_art        text,
  bezug_id         uuid,
  bezug_titel      text,
  bezug_unter      text,
  erwaehnt         uuid[] not null default '{}',
  created_at       timestamptz not null default now(),
  push_gesendet_am timestamptz,
  constraint chat_kanal_bekannt check (kanal = 'team'),
  constraint chat_text_laenge check (char_length(btrim(text)) between 1 and 4000),
  constraint chat_bezug_bekannt check (bezug_art is null or bezug_art in ('auftrag', 'kunde', 'platz', 'verkaufsreifen')),
  constraint chat_bezug_vollstaendig check ((bezug_art is null) = (bezug_id is null))
);
create index if not exists chat_nachrichten_zeit on public.chat_nachrichten (kanal, created_at desc);
create index if not exists chat_nachrichten_offen on public.chat_nachrichten (created_at) where push_gesendet_am is null;

create table if not exists public.chat_gelesen (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  gelesen_bis timestamptz not null default now()
);

alter table public.chat_nachrichten enable row level security;
alter table public.chat_gelesen enable row level security;

-- Lesen: wer „Chat lesen“ darf. Schreiben: nur als man selbst. Ändern und Löschen gibt es in
-- dieser Fassung nicht (keine Richtlinie = verboten); aufgeräumt wird nur nach 12 Monaten.
drop policy if exists "Chat lesen" on public.chat_nachrichten;
create policy "Chat lesen" on public.chat_nachrichten
  for select to authenticated
  using (public.darf('chat', 'lesen'));
drop policy if exists "Chat schreiben" on public.chat_nachrichten;
create policy "Chat schreiben" on public.chat_nachrichten
  for insert to authenticated
  with check (public.darf('chat', 'schreiben') and autor = (select auth.uid()) and push_gesendet_am is null);

drop policy if exists "Eigener Lesestand" on public.chat_gelesen;
create policy "Eigener Lesestand" on public.chat_gelesen
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Die Kunden-Spalten dürfen nicht mitgeschickt werden: `created_at` setzt die Datenbank, damit
-- niemand eine Nachricht in die Vergangenheit legt.
create or replace function public.chat_nachricht_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.text := btrim(new.text);
  return new;
end;
$$;
drop trigger if exists trg_chat_nachricht_pruefen on public.chat_nachrichten;
create trigger trg_chat_nachricht_pruefen
  before insert on public.chat_nachrichten
  for each row execute procedure public.chat_nachricht_pruefen();

-- ---------------------------------------------------------------------
-- 3. Lesestand und Personen
-- ---------------------------------------------------------------------
create or replace function public.chat_ungelesen()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.darf('chat', 'lesen') then 0 else (
    select count(*)::integer from public.chat_nachrichten n
     where n.kanal = 'team'
       and n.autor <> (select auth.uid())
       and n.created_at > coalesce((select g.gelesen_bis from public.chat_gelesen g where g.profile_id = (select auth.uid())), '-infinity'::timestamptz)
  ) end;
$$;
revoke all on function public.chat_ungelesen() from public, anon;
grant execute on function public.chat_ungelesen() to authenticated;

-- Wer im Chat vorkommt – für Namen über den Nachrichten und die @-Auswahl. Nur Zugänge, die den
-- Chat lesen dürfen (der Superadmin immer). Name aus dem verknüpften Mitarbeiter, sonst der Teil
-- der E-Mail vor dem @.
create or replace function public.chat_personen()
returns table (id uuid, name text, rolle text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         coalesce(nullif(btrim((select e.name from public.employees e where e.profile_id = p.id order by e.created_at limit 1)), ''),
                  nullif(split_part(coalesce(p.email, ''), '@', 1), ''), 'Zugang') as name,
         p.role
    from public.profiles p
   where public.darf('chat', 'lesen')
     and (p.role = 'superadmin'
          or p.role = any (coalesce((select m.read_roles from public.module_permissions m where m.module_key = 'chat'), '{}'::text[])))
   order by 2;
$$;
revoke all on function public.chat_personen() from public, anon;
grant execute on function public.chat_personen() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Push bei jeder neuen Nachricht
-- ---------------------------------------------------------------------
-- Über pg_net an dieselbe Route wie der Zeitgeber (Migration 28). Gesendet wird erst nach dem
-- Festschreiben (pg_net arbeitet die Warteschlange danach ab), die Route findet die Zeile also.
-- Fehlt die Konfiguration oder pg_net, bleibt die Nachricht trotzdem gespeichert – der
-- Minutentakt holt den Versand nach.
create or replace function public.chat_push_anstossen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform net.http_post(
      url     := (select k.basis_url from private.push_konfiguration k) || '/api/push/senden',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-push-geheimnis', (select k.geheimnis from private.push_konfiguration k)
                 ),
      body    := jsonb_build_object('anlass', 'chat'),
      timeout_milliseconds := 8000
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;
drop trigger if exists trg_chat_push_anstossen on public.chat_nachrichten;
create trigger trg_chat_push_anstossen
  after insert on public.chat_nachrichten
  for each row execute procedure public.chat_push_anstossen();

-- ---------------------------------------------------------------------
-- 5. Endgültig gelöscht: die Karte vergisst den Inhalt
-- ---------------------------------------------------------------------
create or replace function public.chat_bezug_vergessen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  art text := tg_argv[0];
begin
  update public.chat_nachrichten n
     set bezug_titel = case art when 'kunde' then 'Kunde gelöscht' when 'auftrag' then 'Auftrag gelöscht' else 'gelöscht' end,
         bezug_unter = null
   where n.bezug_art = art and n.bezug_id = old.id;
  return old;
end;
$$;
drop trigger if exists trg_chat_bezug_vergessen on public.customers;
create trigger trg_chat_bezug_vergessen
  after delete on public.customers
  for each row execute procedure public.chat_bezug_vergessen('kunde');
drop trigger if exists trg_chat_bezug_vergessen on public.orders;
create trigger trg_chat_bezug_vergessen
  after delete on public.orders
  for each row execute procedure public.chat_bezug_vergessen('auftrag');

-- ---------------------------------------------------------------------
-- 6. Aufbewahrung: 12 Monate
-- ---------------------------------------------------------------------
create or replace function public.chat_aufraeumen(frist interval default interval '12 months')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  anzahl integer;
begin
  delete from public.chat_nachrichten where created_at < now() - frist;
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;
revoke all on function public.chat_aufraeumen(interval) from public, anon, authenticated;

select cron.unschedule('pinpoints-chat-aufraeumen')
 where exists (select 1 from cron.job where jobname = 'pinpoints-chat-aufraeumen');
select cron.schedule('pinpoints-chat-aufraeumen', '25 3 * * *', $auftrag$ select public.chat_aufraeumen(); $auftrag$);

-- ---------------------------------------------------------------------
-- 7. Live: neue Nachrichten ohne Neuladen (Supabase Realtime)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_nachrichten') then
    execute 'alter publication supabase_realtime add table public.chat_nachrichten';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 8. Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
-- ---------------------------------------------------------------------
select 'Tabellen chat_nachrichten, chat_gelesen' as pruefung,
       (to_regclass('public.chat_nachrichten') is not null and to_regclass('public.chat_gelesen') is not null)::text as ergebnis
union all
select 'Recht „chat“ in der Rechtematrix',
       (select coalesce(array_to_string(read_roles, ', '), '–') from public.module_permissions where module_key = 'chat')
union all
select 'Push-Anstoß eingerichtet (Konfiguration aus Migration 28)',
       (to_regclass('private.push_konfiguration') is not null and exists (select 1 from private.push_konfiguration))::text
union all
select 'Nächtliches Aufräumen (12 Monate)',
       exists (select 1 from cron.job where jobname = 'pinpoints-chat-aufraeumen')::text
union all
select 'Live-Aktualisierung (Realtime)',
       case when not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then 'keine Realtime-Veröffentlichung – die App fragt alle 20 s nach'
            else exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_nachrichten')::text end;
