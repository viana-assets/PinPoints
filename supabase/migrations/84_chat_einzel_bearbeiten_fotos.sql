-- =====================================================================
-- Migration 84 – Team-Chat: Einzelchats, Bearbeiten/Löschen, Fotos (08.10.2026, v137).
--
-- Wunsch Vitali 08.10.2026 (Fahrplan E19, Auswahl „Bearbeiten/Löschen, Fotos, Einzelchats, Ältere
-- nachladen“). „Ältere nachladen“ braucht kein SQL – das ist eine größere Abfrage der App.
--
-- Bausteine:
--   - EINZELCHATS: `kanal = 'direkt'` mit Empfänger `an`. Lesen dürfen NUR die beiden Beteiligten –
--     auch Admin und Superadmin nicht (Richtlinie „Chat lesen“ neu). Der Empfänger muss den Chat
--     lesen dürfen (`chat_kann_mitlesen()`). Eine Antwort bleibt in ihrer Unterhaltung. Je
--     Unterhaltung ein eigener Lesestand (`chat_gelesen_direkt`); `chat_ungelesen()` zählt Team und
--     Einzelchats zusammen (die Zahl an der Blase), `chat_unterhaltungen()` liefert die Liste.
--     Reaktionen sieht und setzt nur, wer die Nachricht sieht.
--   - BEARBEITEN: nur die eigene Nachricht, nur den Text, nur in den ersten 24 Stunden
--     (CHAT_BEARBEITEN_STUNDEN in lib/chat.ts – wer eine Stelle ändert, ändert beide). Die
--     Nachricht trägt danach `bearbeitet_am`. Eine Bearbeitung löst keine zweite Push-Meldung aus.
--   - LÖSCHEN: nur die eigene, jederzeit. Die Zeile bleibt als „Nachricht gelöscht“ stehen (damit
--     Antworten darauf nicht in der Luft hängen), Text, Karte, Erwähnungen, Foto und Reaktionen
--     sind weg. Zurückholen geht nicht.
--   - FOTOS: privater Bucket `chat-fotos`, je Datei höchstens 3 MB (die App verkleinert vorher auf
--     1600 Pixel wie bei den Auftragsfotos). Der erste Ordner im Pfad ist der Schreiber. Sehen darf
--     die Datei, wer die Nachricht dazu sieht – im Einzelchat also nur die beiden.
--     Dateien kann SQL in Supabase nicht löschen. Wird eine Nachricht mit Foto gelöscht oder nach
--     12 Monaten aufgeräumt (oder „Alle Daten löschen“), merkt ein Trigger den Pfad in
--     `private.chat_fotos_weg` vor; der Minutentakt (app/api/push/senden) entfernt die Datei mit
--     dem Dienstschlüssel und hakt sie ab. Die Liste liegt im Schema private, damit „Alle Daten
--     löschen“ (TRUNCATE des Schemas public) sie nicht mitnimmt, bevor die Dateien weg sind.
--
-- Reihenfolge: nach 83, SQL zuerst, dann die Dateien von v137. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.chat_reaktionen') is null then
    raise exception 'Zuerst Migration 81 (Chat: Reaktionen und Antworten) ausführen. Es wurde nichts geändert.';
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage fehlt in diesem Projekt (storage.buckets). Es wurde nichts geändert. (Datenbank: %)', current_database();
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'private') then
    raise exception 'Das Schema private fehlt – zuerst Migration 28 ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Neue Spalten
-- ---------------------------------------------------------------------
alter table public.chat_nachrichten
  add column if not exists an            uuid references public.profiles(id) on delete cascade,
  add column if not exists bearbeitet_am timestamptz,
  add column if not exists geloescht_am  timestamptz,
  add column if not exists foto_pfad     text,
  add column if not exists foto_breite   integer,
  add column if not exists foto_hoehe    integer;

alter table public.chat_nachrichten drop constraint if exists chat_kanal_bekannt;
alter table public.chat_nachrichten add constraint chat_kanal_bekannt
  check (kanal in ('team', 'direkt') and (kanal = 'team') = (an is null) and (an is null or an <> autor));

-- Text: 1–4000 Zeichen; mit Foto darf er leer sein; eine gelöschte Nachricht hat keinen.
alter table public.chat_nachrichten drop constraint if exists chat_text_laenge;
alter table public.chat_nachrichten add constraint chat_text_laenge
  check ((geloescht_am is not null and text = '')
      or (geloescht_am is null and char_length(btrim(text)) <= 4000
          and (char_length(btrim(text)) >= 1 or foto_pfad is not null)));

alter table public.chat_nachrichten drop constraint if exists chat_foto_passt;
alter table public.chat_nachrichten add constraint chat_foto_passt
  check (foto_pfad is null
      or (split_part(foto_pfad, '/', 1) = autor::text
          and foto_breite is not null and foto_hoehe is not null
          and foto_breite between 1 and 10000 and foto_hoehe between 1 and 10000));

create index if not exists chat_nachrichten_direkt_an on public.chat_nachrichten (an, created_at desc) where kanal = 'direkt';
create index if not exists chat_nachrichten_direkt_autor on public.chat_nachrichten (autor, created_at desc) where kanal = 'direkt';
create index if not exists chat_nachrichten_foto on public.chat_nachrichten (foto_pfad) where foto_pfad is not null;

-- ---------------------------------------------------------------------
-- 2. Wer darf eine Einzelnachricht bekommen? Wer den Chat lesen darf (wie `chat_personen()`).
-- ---------------------------------------------------------------------
create or replace function public.chat_kann_mitlesen(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_profile
       and (p.role = 'superadmin'
            or p.role = any (coalesce((select m.read_roles from public.module_permissions m where m.module_key = 'chat'), '{}'::text[])))
  );
$$;
revoke all on function public.chat_kann_mitlesen(uuid) from public, anon;
grant execute on function public.chat_kann_mitlesen(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Lesen: Team für alle mit „Chat lesen“, Einzelchats nur für die beiden Beteiligten.
-- ---------------------------------------------------------------------
drop policy if exists "Chat lesen" on public.chat_nachrichten;
create policy "Chat lesen" on public.chat_nachrichten
  for select to authenticated
  using (public.darf('chat', 'lesen')
         and (kanal = 'team' or autor = (select auth.uid()) or an = (select auth.uid())));

-- Bearbeiten und Löschen: nur die eigene Nachricht. WAS sich ändern darf, regelt der Trigger
-- `chat_nachricht_aendern()` unten (nur der Text, nur 24 Stunden; Löschen jederzeit).
drop policy if exists "Eigene Nachricht ändern" on public.chat_nachrichten;
create policy "Eigene Nachricht ändern" on public.chat_nachrichten
  for update to authenticated
  using (autor = (select auth.uid()) and public.darf('chat', 'schreiben'))
  with check (autor = (select auth.uid()));

-- Reaktionen nur an Nachrichten, die man sieht (die Unterabfrage läuft mit den Zeilenrechten des
-- Aufrufers) – und nicht an gelöschten.
drop policy if exists "Reaktionen lesen" on public.chat_reaktionen;
create policy "Reaktionen lesen" on public.chat_reaktionen
  for select to authenticated
  using (public.darf('chat', 'lesen')
         and exists (select 1 from public.chat_nachrichten n where n.id = nachricht_id));
drop policy if exists "Eigene Reaktion setzen" on public.chat_reaktionen;
create policy "Eigene Reaktion setzen" on public.chat_reaktionen
  for insert to authenticated
  with check (public.darf('chat', 'schreiben') and profile_id = (select auth.uid())
              and exists (select 1 from public.chat_nachrichten n where n.id = nachricht_id and n.geloescht_am is null));
drop policy if exists "Eigene Reaktion ändern" on public.chat_reaktionen;
create policy "Eigene Reaktion ändern" on public.chat_reaktionen
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (public.darf('chat', 'schreiben') and profile_id = (select auth.uid())
              and exists (select 1 from public.chat_nachrichten n where n.id = nachricht_id and n.geloescht_am is null));

-- ---------------------------------------------------------------------
-- 4. Prüfungen beim Schreiben und Ändern
-- ---------------------------------------------------------------------
-- Neu: Zeitpunkt setzt die Datenbank; bearbeitet/gelöscht sind beim Schreiben leer; ein
-- Empfänger muss mitlesen dürfen; eine Antwort bleibt in ihrer Unterhaltung. Bewusst ohne
-- `security definer`: Die Ursprungsnachricht wird mit den Zeilenrechten des Schreibers gesucht –
-- wer sie nicht sieht, kann nicht auf sie antworten.
create or replace function public.chat_nachricht_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  u record;
begin
  new.created_at := now();
  new.text := btrim(coalesce(new.text, ''));
  new.bearbeitet_am := null;
  new.geloescht_am := null;
  if new.kanal = 'direkt' and new.an is not null and not public.chat_kann_mitlesen(new.an) then
    raise exception 'Diese Person hat keinen Zugang zum Chat.';
  end if;
  if new.antwort_auf is not null then
    select n.kanal, n.autor, n.an into u from public.chat_nachrichten n where n.id = new.antwort_auf;
    if not found
       or u.kanal is distinct from new.kanal
       or (new.kanal = 'direkt'
           and (least(u.autor, u.an) is distinct from least(new.autor, new.an)
                or greatest(u.autor, u.an) is distinct from greatest(new.autor, new.an))) then
      raise exception 'Die Antwort gehört in dieselbe Unterhaltung wie die Nachricht, auf die sie antwortet.';
    end if;
  end if;
  return new;
end;
$$;

-- Ändern als angemeldeter Nutzer (`current_user` = authenticated): Alles außer dem Text bleibt,
-- wie es war. Bewusst ohne `security definer` (Muster aus Migration 78/81). Der Versand
-- (`push_gesendet_am`, Dienstschlüssel) und das Vergessen einer Karte (Migration 80) laufen nicht
-- als authenticated und sind davon nicht betroffen.
create or replace function public.chat_nachricht_aendern()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if old.geloescht_am is not null then
    raise exception 'Diese Nachricht ist gelöscht.';
  end if;
  new.id := old.id;
  new.kanal := old.kanal;
  new.autor := old.autor;
  new.an := old.an;
  new.created_at := old.created_at;
  new.push_gesendet_am := old.push_gesendet_am;
  new.antwort_auf := old.antwort_auf;
  new.erwaehnt := old.erwaehnt;
  new.bezug_art := old.bezug_art;
  new.bezug_id := old.bezug_id;
  new.bezug_titel := old.bezug_titel;
  new.bezug_unter := old.bezug_unter;
  new.foto_pfad := old.foto_pfad;
  new.foto_breite := old.foto_breite;
  new.foto_hoehe := old.foto_hoehe;
  new.bearbeitet_am := old.bearbeitet_am;

  if new.geloescht_am is not null then
    -- Löschen: Inhalt weg, die Zeile bleibt als „Nachricht gelöscht“.
    new.geloescht_am := now();
    new.text := '';
    new.bezug_art := null;
    new.bezug_id := null;
    new.bezug_titel := null;
    new.bezug_unter := null;
    new.erwaehnt := '{}';
    new.antwort_auf := null;
    new.foto_pfad := null;
    new.foto_breite := null;
    new.foto_hoehe := null;
    return new;
  end if;

  new.text := btrim(coalesce(new.text, ''));
  if new.text is distinct from old.text then
    -- Dieselbe Frist steht als CHAT_BEARBEITEN_STUNDEN in lib/chat.ts.
    if old.created_at < now() - interval '24 hours' then
      raise exception 'Bearbeiten geht nur in den ersten 24 Stunden nach dem Schreiben.';
    end if;
    new.bearbeitet_am := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_chat_nachricht_aendern on public.chat_nachrichten;
create trigger trg_chat_nachricht_aendern
  before update on public.chat_nachrichten
  for each row execute procedure public.chat_nachricht_aendern();

-- ---------------------------------------------------------------------
-- 5. Fotos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-fotos', 'chat-fotos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sehen: wer die Nachricht mit diesem Foto sieht (Zeilenrechte von chat_nachrichten), und der
-- Schreiber seine eigenen Dateien. Hochladen: mit „Chat schreiben“, nur in den eigenen Ordner.
-- Löschen: nur eigene Dateien (eine hochgeladene Datei, deren Nachricht dann nicht ankam).
drop policy if exists "MR Chatfotos lesen" on storage.objects;
create policy "MR Chatfotos lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-fotos'
         and ((storage.foldername(objects.name))[1] = (select auth.uid())::text
              or exists (select 1 from public.chat_nachrichten n where n.foto_pfad = objects.name)));
drop policy if exists "MR Chatfotos hochladen" on storage.objects;
create policy "MR Chatfotos hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-fotos'
              and public.darf('chat', 'schreiben')
              and (storage.foldername(objects.name))[1] = (select auth.uid())::text);
drop policy if exists "MR Chatfotos loeschen" on storage.objects;
create policy "MR Chatfotos loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-fotos' and (storage.foldername(objects.name))[1] = (select auth.uid())::text);

-- Die Liste der Dateien, die weg müssen.
create table if not exists private.chat_fotos_weg (
  pfad text primary key,
  seit timestamptz not null default now()
);
revoke all on table private.chat_fotos_weg from public, anon, authenticated;

-- Nach Löschen (der Nachricht oder ihres Fotos) und nach dem Aufräumen: Pfad vormerken; beim
-- Löschen einer Nachricht auch ihre Reaktionen entfernen.
create or replace function public.chat_nachricht_nachlauf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.foto_pfad is not null then
      insert into private.chat_fotos_weg (pfad) values (old.foto_pfad) on conflict (pfad) do nothing;
    end if;
    return old;
  end if;
  if old.foto_pfad is not null and new.foto_pfad is distinct from old.foto_pfad then
    insert into private.chat_fotos_weg (pfad) values (old.foto_pfad) on conflict (pfad) do nothing;
  end if;
  if old.geloescht_am is null and new.geloescht_am is not null then
    delete from public.chat_reaktionen r where r.nachricht_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_chat_nachricht_nachlauf on public.chat_nachrichten;
create trigger trg_chat_nachricht_nachlauf
  after update or delete on public.chat_nachrichten
  for each row execute procedure public.chat_nachricht_nachlauf();

-- „Alle Daten löschen“ (Migration 72) leert die Tabellen mit TRUNCATE – das löst die Zeilen-
-- Trigger nicht aus. Deshalb vorher alle Fotopfade vormerken, in derselben Anweisung.
create or replace function public.chat_fotos_vor_leeren()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.chat_fotos_weg (pfad)
  select n.foto_pfad from public.chat_nachrichten n where n.foto_pfad is not null
  on conflict (pfad) do nothing;
  return null;
end;
$$;
drop trigger if exists trg_chat_fotos_vor_leeren on public.chat_nachrichten;
create trigger trg_chat_fotos_vor_leeren
  before truncate on public.chat_nachrichten
  for each statement execute procedure public.chat_fotos_vor_leeren();

-- Für den Minutentakt (Dienstschlüssel): vorgemerkte Pfade holen und nach dem Löschen abhaken.
create or replace function public.chat_fotos_weg_liste(p_anzahl integer default 100)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select w.pfad from private.chat_fotos_weg w order by w.seit, w.pfad
   limit greatest(1, least(coalesce(p_anzahl, 100), 1000));
$$;
create or replace function public.chat_fotos_weg_erledigt(p_pfade text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  anzahl integer;
begin
  delete from private.chat_fotos_weg w where w.pfad = any (coalesce(p_pfade, '{}'::text[]));
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;
revoke all on function public.chat_fotos_weg_liste(integer) from public, anon, authenticated;
revoke all on function public.chat_fotos_weg_erledigt(text[]) from public, anon, authenticated;
grant execute on function public.chat_fotos_weg_liste(integer) to service_role;
grant execute on function public.chat_fotos_weg_erledigt(text[]) to service_role;

-- ---------------------------------------------------------------------
-- 6. Lesestand je Einzelchat, Ungelesene, Liste der Unterhaltungen
-- ---------------------------------------------------------------------
create table if not exists public.chat_gelesen_direkt (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  partner     uuid not null references public.profiles(id) on delete cascade,
  gelesen_bis timestamptz not null default now(),
  primary key (profile_id, partner)
);
alter table public.chat_gelesen_direkt enable row level security;
drop policy if exists "Eigener Lesestand (direkt)" on public.chat_gelesen_direkt;
create policy "Eigener Lesestand (direkt)" on public.chat_gelesen_direkt
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Ungelesen für eine Person: Team nach `chat_gelesen`, Einzelchats je Partner nach
-- `chat_gelesen_direkt`; eigene und gelöschte Nachrichten zählen nicht. Nur für den Versand
-- (Dienstschlüssel) – die App fragt `chat_ungelesen()` für sich selbst.
create or replace function public.chat_ungelesen_von(p_profile uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.chat_nachrichten n
      where n.kanal = 'team' and n.autor <> p_profile and n.geloescht_am is null
        and n.created_at > coalesce((select g.gelesen_bis from public.chat_gelesen g where g.profile_id = p_profile), '-infinity'::timestamptz))
    +
    (select count(*) from public.chat_nachrichten n
      where n.kanal = 'direkt' and n.an = p_profile and n.geloescht_am is null
        and n.created_at > coalesce((select g.gelesen_bis from public.chat_gelesen_direkt g
                                      where g.profile_id = p_profile and g.partner = n.autor), '-infinity'::timestamptz))
  )::integer;
$$;
revoke all on function public.chat_ungelesen_von(uuid) from public, anon, authenticated;
grant execute on function public.chat_ungelesen_von(uuid) to service_role;

create or replace function public.chat_ungelesen()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.darf('chat', 'lesen') then 0
              else public.chat_ungelesen_von((select auth.uid())) end;
$$;
revoke all on function public.chat_ungelesen() from public, anon;
grant execute on function public.chat_ungelesen() to authenticated;

-- Die Unterhaltungen des Aufrufers: eine Zeile „Team“ (partner leer) und je Einzelchat eine Zeile
-- mit der letzten Nachricht und der Zahl der Ungelesenen. Neueste zuerst.
create or replace function public.chat_unterhaltungen()
returns table (partner uuid, letzte_am timestamptz, letzte_von uuid, letzte_text text, letzte_foto boolean, ungelesen integer)
language sql
stable
security definer
set search_path = ''
as $$
  with ich as (select (select auth.uid()) as id),
  team as (
    select n.created_at, n.autor, n.text, n.foto_pfad, n.geloescht_am
      from public.chat_nachrichten n
     where n.kanal = 'team'
     order by n.created_at desc, n.id desc
     limit 1
  ),
  direkt as (
    select case when n.autor = ich.id then n.an else n.autor end as partner, n.*
      from public.chat_nachrichten n, ich
     where n.kanal = 'direkt' and (n.autor = ich.id or n.an = ich.id)
  ),
  letzte as (
    select distinct on (d.partner) d.partner, d.created_at, d.autor, d.text, d.foto_pfad, d.geloescht_am
      from direkt d
     order by d.partner, d.created_at desc, d.id desc
  )
  select x.partner, x.letzte_am, x.letzte_von, x.letzte_text, x.letzte_foto, x.ungelesen
    from (
      select null::uuid as partner, t.created_at as letzte_am, t.autor as letzte_von,
             case when t.geloescht_am is not null then '' else t.text end as letzte_text,
             coalesce(t.foto_pfad is not null, false) as letzte_foto,
             (select count(*) from public.chat_nachrichten n, ich
               where n.kanal = 'team' and n.autor <> ich.id and n.geloescht_am is null
                 and n.created_at > coalesce((select g.gelesen_bis from public.chat_gelesen g where g.profile_id = ich.id), '-infinity'::timestamptz))::integer as ungelesen
        from (select 1) eins left join team t on true
      union all
      select l.partner, l.created_at, l.autor,
             case when l.geloescht_am is not null then '' else l.text end,
             l.foto_pfad is not null,
             (select count(*) from direkt d, ich
               where d.partner = l.partner and d.an = ich.id and d.geloescht_am is null
                 and d.created_at > coalesce((select g.gelesen_bis from public.chat_gelesen_direkt g
                                               where g.profile_id = ich.id and g.partner = l.partner), '-infinity'::timestamptz))::integer
        from letzte l
    ) x
   where public.darf('chat', 'lesen')
   order by x.partner is not null, x.letzte_am desc nulls last;
$$;
revoke all on function public.chat_unterhaltungen() from public, anon;
grant execute on function public.chat_unterhaltungen() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
--    Die Richtlinien werden mit ausgegeben: Mehrere Richtlinien je Befehl gelten mit ODER, ein
--    falscher Name beim Ersetzen bliebe sonst still stehen (CLAUDE.md).
-- ---------------------------------------------------------------------
select 'Einzelchats, Bearbeiten, Fotos (Spalten an, bearbeitet_am, geloescht_am, foto_pfad)' as pruefung,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'chat_nachrichten'
           and column_name in ('an', 'bearbeitet_am', 'geloescht_am', 'foto_pfad', 'foto_breite', 'foto_hoehe'))::text || ' von 6' as ergebnis
union all
select 'Bucket chat-fotos (privat)',
       coalesce((select case when b.public then 'ÖFFENTLICH – prüfen!' else 'ja, privat' end from storage.buckets b where b.id = 'chat-fotos'), 'fehlt')
union all
select 'Lesestand je Einzelchat (chat_gelesen_direkt)', (to_regclass('public.chat_gelesen_direkt') is not null)::text
union all
select 'Fotos vormerken (private.chat_fotos_weg)', (to_regclass('private.chat_fotos_weg') is not null)::text
union all
select 'Richtlinie ' || p.tablename || ' · ' || p.cmd || ' · ' || p.policyname,
       coalesce(p.qual, '') || case when p.with_check is not null then ' | prüft: ' || p.with_check else '' end
  from pg_policies p
 where (p.schemaname = 'public' and p.tablename in ('chat_nachrichten', 'chat_reaktionen', 'chat_gelesen_direkt'))
    or (p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname like 'MR Chatfotos%');
