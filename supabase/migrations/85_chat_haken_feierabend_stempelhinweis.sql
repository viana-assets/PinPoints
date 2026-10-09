-- =====================================================================
-- Migration 85 – Haken im Chat, Feierabend mit Heimfahrt, Stempel-Erinnerung (09.10.2026, v138).
--
-- Wunsch Vitali 09.10.2026:
--   1. HAKEN WIE BEI WHATSAPP an der eigenen Nachricht: ✓ gesendet, ✓✓ grau bei allen angekommen,
--      ✓✓ grün von allen gelesen (Team: alle mit Chat-Zugang außer dem Schreiber; Einzelchat: die
--      eine Person). Entschieden: nur die Haken, keine Namen, wer wann gelesen hat.
--      - „Angekommen“ heißt: Die App der Person hat die Nachricht abgeholt (`chat_empfangen()`, läuft
--        bei offener App mit der Zahl an der Blase) ODER die Push-Meldung wurde ihrem Gerät zugestellt
--        (Versand mit Dienstschlüssel, `chat_zugestellt_setzen()`). Je Person und Unterhaltung ein
--        „angekommen bis“ (`zugestellt_bis`) neben dem „gelesen bis“.
--      - `chat_haken(partner)` gibt dem Schreiber nur ZWEI Zeitpunkte zurück: bis wann bei allen
--        angekommen, bis wann von allen gelesen (das Minimum über alle Empfänger). Wer was gelesen
--        hat, verrät sie im Team nicht.
--   2. FEIERABEND: Erledigt jemand seinen letzten Auftrag des Tages, fragt die App „Für heute
--      fertig?“. „Ja“ stempelt aus und schreibt 30 Minuten Heimfahrt gut (`zeit_feierabend()`,
--      `zeit_schichten.heimfahrt_minuten`). Die Datenbank prüft selbst, dass heute ein eigener Auftrag
--      erledigt ist, keiner mehr offen ist und es heute noch keine Heimfahrt gab – sonst ließe sich
--      die halbe Stunde beliebig holen. Wer selbst ausstempelt (auch nach der Erinnerung), bekommt
--      keine Heimfahrt: Die Zeit bis dahin ist schon gestempelt. Korrigieren mit „Zeiten aller ·
--      schreiben“ und Grund (`zeit_heimfahrt_setzen()`), wie jede Korrektur festgehalten.
--   3. STEMPEL-ERINNERUNG per Push (Minutentakt, lib/stempelErinnerungVersand.ts): 30 Minuten vor
--      dem ersten eigenen Termin „Einstempeln nicht vergessen“, wenn nicht eingestempelt; 30 Minuten
--      nach dem geplanten Ende des letzten, wenn noch eingestempelt und der Auftrag nicht erledigt.
--      Je Person abschaltbar (`user_settings.stempel_erinnerung_aktiv`), einmal je Tag und Art
--      (`push_stempel_erinnerung`, „erst eintragen, dann senden“).
--   Dazu: RLS auf `private.chat_fotos_weg` (Hinweis des SQL-Editors bei Migration 84; die Tabelle war
--   für Nutzer ohnehin gesperrt).
--
-- Reihenfolge: nach 84, SQL zuerst, dann die Dateien von v138. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.chat_gelesen_direkt') is null then
    raise exception 'Zuerst Migration 84 (Chat: Einzelchats, Bearbeiten, Fotos) ausführen. Es wurde nichts geändert.';
  end if;
  if to_regclass('public.zeit_abwesenheiten') is null then
    raise exception 'Zuerst Migration 83 (Zeiterfassung: Urlaub) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- =====================================================================
-- 1. Haken im Chat
-- =====================================================================
alter table public.chat_gelesen add column if not exists zugestellt_bis timestamptz;
alter table public.chat_gelesen_direkt add column if not exists zugestellt_bis timestamptz;

-- Die App meldet „abgeholt“: Team-Stand und jeder Einzelchat, in dem mir jemand geschrieben hat.
-- Nur, wo seit dem letzten Mal etwas Neues kam (sonst schriebe jede Minute jede App jede Zeile).
-- Fehlt die Zeile noch, entsteht sie mit „gelesen bis“ = nie – angekommen ist nicht gelesen.
create or replace function public.chat_empfangen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ich uuid := (select auth.uid());
begin
  if ich is null or not public.darf('chat', 'lesen') then
    return;
  end if;
  insert into public.chat_gelesen as g (profile_id, gelesen_bis, zugestellt_bis)
  values (ich, '-infinity'::timestamptz, now())
  on conflict (profile_id) do update set zugestellt_bis = now()
   where g.zugestellt_bis is null
      or g.zugestellt_bis < (select max(n.created_at) from public.chat_nachrichten n where n.kanal = 'team');
  insert into public.chat_gelesen_direkt as g (profile_id, partner, gelesen_bis, zugestellt_bis)
  select ich, n.autor, '-infinity'::timestamptz, now()
    from public.chat_nachrichten n
   where n.kanal = 'direkt' and n.an = ich
   group by n.autor
  on conflict (profile_id, partner) do update set zugestellt_bis = now()
   where g.zugestellt_bis is null
      or g.zugestellt_bis < (select max(n2.created_at) from public.chat_nachrichten n2
                              where n2.kanal = 'direkt' and n2.an = g.profile_id and n2.autor = g.partner);
end;
$$;
revoke all on function public.chat_empfangen() from public, anon;
grant execute on function public.chat_empfangen() to authenticated;

-- Der Versand (Dienstschlüssel) meldet „Push zugestellt“: angekommen bis mindestens `p_bis`.
-- `p_partner` leer = Team, sonst der Einzelchat der Person `p_profile` mit `p_partner`.
create or replace function public.chat_zugestellt_setzen(p_profile uuid, p_partner uuid, p_bis timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_profile is null or p_bis is null then
    return;
  end if;
  if p_partner is null then
    insert into public.chat_gelesen as g (profile_id, gelesen_bis, zugestellt_bis)
    values (p_profile, '-infinity'::timestamptz, p_bis)
    on conflict (profile_id) do update set zugestellt_bis = greatest(coalesce(g.zugestellt_bis, '-infinity'::timestamptz), p_bis);
  else
    insert into public.chat_gelesen_direkt as g (profile_id, partner, gelesen_bis, zugestellt_bis)
    values (p_profile, p_partner, '-infinity'::timestamptz, p_bis)
    on conflict (profile_id, partner) do update set zugestellt_bis = greatest(coalesce(g.zugestellt_bis, '-infinity'::timestamptz), p_bis);
  end if;
end;
$$;
revoke all on function public.chat_zugestellt_setzen(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.chat_zugestellt_setzen(uuid, uuid, timestamptz) to service_role;

-- Für die Haken des Aufrufers: bis wann ist bei ALLEN Empfängern angekommen, bis wann von ALLEN
-- gelesen. Eine eigene Nachricht mit `created_at` ≤ `gelesen_bis` ist grün, ≤ `zugestellt_bis` grau
-- doppelt, sonst ein Haken. Gelesen schließt angekommen ein. Ohne Empfänger (allein im Chat): alles
-- gelesen. Team: alle mit Chat-Leserecht (wie `chat_personen()`) außer mir; Einzelchat: der Partner.
create or replace function public.chat_haken(p_partner uuid default null)
returns table (zugestellt_bis timestamptz, gelesen_bis timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with ich as (select (select auth.uid()) as id),
  empfaenger as (
    select coalesce(g.zugestellt_bis, '-infinity'::timestamptz) as zu, coalesce(g.gelesen_bis, '-infinity'::timestamptz) as ge
      from public.profiles p
      cross join ich
      left join public.chat_gelesen g on g.profile_id = p.id
     where p_partner is null
       and p.id <> ich.id
       and (p.role = 'superadmin'
            or p.role = any (coalesce((select m.read_roles from public.module_permissions m where m.module_key = 'chat'), '{}'::text[])))
    union all
    select coalesce(g.zugestellt_bis, '-infinity'::timestamptz), coalesce(g.gelesen_bis, '-infinity'::timestamptz)
      from ich
      left join public.chat_gelesen_direkt g on g.profile_id = p_partner and g.partner = ich.id
     where p_partner is not null
  )
  select coalesce(min(greatest(e.zu, e.ge)), 'infinity'::timestamptz),
         coalesce(min(e.ge), 'infinity'::timestamptz)
    from empfaenger e
  having public.darf('chat', 'lesen');
$$;
revoke all on function public.chat_haken(uuid) from public, anon;
grant execute on function public.chat_haken(uuid) to authenticated;

-- Hinweis des SQL-Editors bei Migration 84: RLS auch hier (keine Richtlinie = für Nutzer gesperrt;
-- die Funktionen mit `security definer` gehören dem Eigentümer und sind davon nicht betroffen).
alter table private.chat_fotos_weg enable row level security;

-- =====================================================================
-- 2. Feierabend mit Heimfahrt
-- =====================================================================
alter table public.zeit_schichten add column if not exists heimfahrt_minuten integer not null default 0;
alter table public.zeit_schichten drop constraint if exists zeit_heimfahrt_bereich;
alter table public.zeit_schichten add constraint zeit_heimfahrt_bereich check (heimfahrt_minuten between 0 and 120);

-- Wie in Migration 82, dazu die Heimfahrt – damit Vorher/Nachher einer Korrektur sie zeigt.
create or replace function public.zeit_schicht_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', s.id, 'profile_id', s.profile_id, 'beginn', s.beginn, 'ende', s.ende,
           'heimfahrt_minuten', s.heimfahrt_minuten,
           'pausen', coalesce((select jsonb_agg(jsonb_build_object('beginn', p.beginn, 'ende', p.ende) order by p.beginn)
                                 from public.zeit_pausen p where p.schicht_id = s.id), '[]'::jsonb))
    from public.zeit_schichten s where s.id = p_id;
$$;
revoke all on function public.zeit_schicht_json(uuid) from public, anon, authenticated;

-- „Für heute fertig? – Ja“: ausstempeln und 30 Minuten Heimfahrt gutschreiben. Dieselben 30 stehen
-- als ZEIT_HEIMFAHRT_MINUTEN in lib/zeiterfassung.ts – wer eine Stelle ändert, ändert beide.
-- Der Tag ist der Kalendertag in Nürnberg (ZEITZONE in lib/constants.ts).
create or replace function public.zeit_feierabend()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ich   uuid := (select auth.uid());
  offen uuid;
  heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not public.darf('zeiterfassung', 'schreiben') then
    raise exception 'Stempeln ist für deine Rolle nicht freigeschaltet (Recht „Zeiterfassung“).';
  end if;
  select id into offen from public.zeit_schichten where profile_id = ich and ende is null for update;
  if offen is null then raise exception 'Du bist nicht eingestempelt.'; end if;
  if not exists (
    select 1 from public.orders o
      join public.order_employees oe on oe.order_id = o.id
      join public.employees e on e.id = oe.employee_id
     where e.profile_id = ich and o.order_date = heute and o.status = 'erledigt' and o.deleted_at is null) then
    raise exception 'Heimfahrt gibt es nach dem letzten erledigten Auftrag des Tages – heute ist keiner erledigt. Bitte normal ausstempeln.';
  end if;
  if exists (
    select 1 from public.orders o
      join public.order_employees oe on oe.order_id = o.id
      join public.employees e on e.id = oe.employee_id
     where e.profile_id = ich and o.order_date = heute and o.status in ('offen', 'in_arbeit') and o.deleted_at is null) then
    raise exception 'Heute steht noch ein Auftrag an – die Heimfahrt gibt es nach dem letzten. Bitte normal ausstempeln, wenn du trotzdem aufhörst.';
  end if;
  if exists (
    select 1 from public.zeit_schichten s
     where s.profile_id = ich and s.heimfahrt_minuten > 0
       and (s.beginn at time zone 'Europe/Berlin')::date = heute) then
    raise exception 'Die Heimfahrt für heute ist schon gutgeschrieben. Bitte normal ausstempeln.';
  end if;
  update public.zeit_pausen set ende = now() where schicht_id = offen and ende is null;
  update public.zeit_schichten set ende = now(), heimfahrt_minuten = 30 where id = offen;
  return 30;
end;
$$;
revoke all on function public.zeit_feierabend() from public, anon;
grant execute on function public.zeit_feierabend() to authenticated;

-- Heimfahrt korrigieren (gutschreiben, ändern, wegnehmen) – wie jede Korrektur nur mit „Zeiten
-- aller · schreiben“ und Grund, mit Vorher/Nachher in `zeit_korrekturen`.
create or replace function public.zeit_heimfahrt_setzen(p_id uuid, p_minuten integer, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grund  text := btrim(coalesce(p_grund, ''));
  v_person uuid;
  v_vorher jsonb;
begin
  if not public.darf('zeiterfassung.alle', 'schreiben') then
    raise exception 'Korrigieren darf nur, wer das Recht „Zeiten aller korrigieren“ hat.';
  end if;
  if char_length(v_grund) < 3 then raise exception 'Bitte einen Grund für die Korrektur angeben.'; end if;
  if p_minuten is null or p_minuten < 0 or p_minuten > 120 then raise exception 'Heimfahrt: 0 bis 120 Minuten.'; end if;
  select profile_id into v_person from public.zeit_schichten where id = p_id for update;
  if v_person is null then raise exception 'Diese Schicht gibt es nicht mehr.'; end if;
  if (select heimfahrt_minuten from public.zeit_schichten where id = p_id) = p_minuten then
    return;
  end if;
  v_vorher := public.zeit_schicht_json(p_id);
  update public.zeit_schichten
     set heimfahrt_minuten = p_minuten, korrigiert_am = now(), korrigiert_von = (select auth.uid()), korrektur_grund = v_grund
   where id = p_id;
  insert into public.zeit_korrekturen (schicht_id, profile_id, vorher, nachher, grund, von)
  values (p_id, v_person, v_vorher, public.zeit_schicht_json(p_id), v_grund, (select auth.uid()));
end;
$$;
revoke all on function public.zeit_heimfahrt_setzen(uuid, integer, text) from public, anon;
grant execute on function public.zeit_heimfahrt_setzen(uuid, integer, text) to authenticated;

-- =====================================================================
-- 3. Stempel-Erinnerung
-- =====================================================================
alter table public.user_settings add column if not exists stempel_erinnerung_aktiv boolean not null default true;
comment on column public.user_settings.stempel_erinnerung_aktiv is
  'Migration 85: Push „Einstempeln nicht vergessen“ / „Ausstempeln vergessen?“ an (Vorgabe) oder aus, je Person.';

create table if not exists public.push_stempel_erinnerung (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  tag         date not null,
  art         text not null,
  gesendet_am timestamptz not null default now(),
  primary key (profile_id, tag, art),
  constraint push_stempel_art check (art in ('ein', 'aus'))
);
create index if not exists push_stempel_erinnerung_tag on public.push_stempel_erinnerung (tag);
-- Nur der Versand (Dienstschlüssel) liest und schreibt: RLS an, keine Richtlinie.
alter table public.push_stempel_erinnerung enable row level security;
comment on table public.push_stempel_erinnerung is
  'Migration 85: Welche Stempel-Erinnerung (ein/aus) an welchem Tag schon an wen ging – einmal je Tag und Art. Älter als 30 Tage räumt der Versand ab.';

-- =====================================================================
-- 4. Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
-- =====================================================================
select 'Haken: angekommen-bis in chat_gelesen und chat_gelesen_direkt' as pruefung,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name in ('chat_gelesen', 'chat_gelesen_direkt') and column_name = 'zugestellt_bis')::text || ' von 2' as ergebnis
union all
select 'Haken: Funktionen chat_haken, chat_empfangen, chat_zugestellt_setzen',
       ((to_regprocedure('public.chat_haken(uuid)') is not null)::int + (to_regprocedure('public.chat_empfangen()') is not null)::int
        + (to_regprocedure('public.chat_zugestellt_setzen(uuid,uuid,timestamptz)') is not null)::int)::text || ' von 3'
union all
select 'Feierabend: Heimfahrt-Spalte und zeit_feierabend()',
       (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'zeit_schichten' and column_name = 'heimfahrt_minuten')
        and to_regprocedure('public.zeit_feierabend()') is not null)::text
union all
select 'Stempel-Erinnerung: Schalter in user_settings, Tabelle push_stempel_erinnerung',
       (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_settings' and column_name = 'stempel_erinnerung_aktiv')
        and to_regclass('public.push_stempel_erinnerung') is not null)::text
union all
select 'RLS an: private.chat_fotos_weg, public.push_stempel_erinnerung',
       (select string_agg(n.nspname || '.' || c.relname || ' ' || case when c.relrowsecurity then 'an' else 'AUS' end, ', ' order by c.relname)
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where (n.nspname, c.relname) in (('private', 'chat_fotos_weg'), ('public', 'push_stempel_erinnerung')));
