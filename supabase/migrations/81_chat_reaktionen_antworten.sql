-- =====================================================================
-- Migration 81 – Team-Chat: Reaktionen und Antworten (08.10.2026, v130).
--
-- Wunsch Vitali 08.10.2026 nach den ersten Nachrichten: auf eine Nachricht reagieren (Daumen hoch
-- und runter u. a.) und direkt auf eine Nachricht antworten, wie bei WhatsApp. Entschieden per
-- Auswahl: sechs Reaktionen (👍 👎 ❤️ 😂 😮 ✅), je Person eine je Nachricht; eine Antwort ist eine
-- normale Nachricht (Push an alle, der Verfasser der Ursprungsnachricht sieht „… hat dir
-- geantwortet“); eine Reaktion meldet sich per Push NUR beim Verfasser und zählt nicht als ungelesen.
--
-- Bausteine:
--   - `chat_nachrichten.antwort_auf`: worauf die Nachricht antwortet. Wird die Ursprungsnachricht
--     nach 12 Monaten aufgeräumt, wird das Feld leer (`on delete set null`) – die App zeigt dann
--     „frühere Nachricht“.
--   - `chat_reaktionen`: je Nachricht und Zugang höchstens eine Reaktion. Setzen, ändern und
--     zurücknehmen nur als man selbst und mit „Chat schreiben“; sehen mit „Chat lesen“.
--     `push_gesendet_am` setzt nur der Versand (Dienstschlüssel); eine geänderte Reaktion meldet
--     sich nicht ein zweites Mal.
--   - Push: derselbe Anstoß wie bei Nachrichten (`chat_push_anstossen()` aus Migration 80).
--   - Realtime: `chat_reaktionen` in `supabase_realtime`, damit Daumen ohne Neuladen erscheinen.
--
-- Reihenfolge: nach 80, SQL zuerst, dann die Dateien von v130. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.chat_nachrichten') is null then
    raise exception 'Zuerst Migration 80 (Team-Chat) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Antworten
-- ---------------------------------------------------------------------
alter table public.chat_nachrichten
  add column if not exists antwort_auf uuid references public.chat_nachrichten(id) on delete set null;
create index if not exists chat_nachrichten_antwort on public.chat_nachrichten (antwort_auf) where antwort_auf is not null;

-- ---------------------------------------------------------------------
-- 2. Reaktionen
-- ---------------------------------------------------------------------
create table if not exists public.chat_reaktionen (
  nachricht_id     uuid not null references public.chat_nachrichten(id) on delete cascade,
  profile_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji            text not null,
  created_at       timestamptz not null default now(),
  push_gesendet_am timestamptz,
  primary key (nachricht_id, profile_id),
  -- Dieselbe Liste steht als CHAT_REAKTIONEN in lib/chat.ts. Wer eine Stelle ändert, ändert beide.
  constraint chat_reaktion_bekannt check (emoji in ('👍', '👎', '❤️', '😂', '😮', '✅'))
);
create index if not exists chat_reaktionen_offen on public.chat_reaktionen (created_at) where push_gesendet_am is null;

alter table public.chat_reaktionen enable row level security;

drop policy if exists "Reaktionen lesen" on public.chat_reaktionen;
create policy "Reaktionen lesen" on public.chat_reaktionen
  for select to authenticated
  using (public.darf('chat', 'lesen'));
drop policy if exists "Eigene Reaktion setzen" on public.chat_reaktionen;
create policy "Eigene Reaktion setzen" on public.chat_reaktionen
  for insert to authenticated
  with check (public.darf('chat', 'schreiben') and profile_id = (select auth.uid()));
drop policy if exists "Eigene Reaktion ändern" on public.chat_reaktionen;
create policy "Eigene Reaktion ändern" on public.chat_reaktionen
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (public.darf('chat', 'schreiben') and profile_id = (select auth.uid()));
drop policy if exists "Eigene Reaktion zurücknehmen" on public.chat_reaktionen;
create policy "Eigene Reaktion zurücknehmen" on public.chat_reaktionen
  for delete to authenticated
  using (profile_id = (select auth.uid()));

-- Zeitpunkt setzt die Datenbank; `push_gesendet_am` setzt nur der Versand. Wer als angemeldeter
-- Nutzer schreibt (`current_user` = authenticated), kann es weder setzen noch leeren – sonst ließe
-- sich eine Meldung beliebig oft auslösen. Bewusst ohne `security definer`: nur so ist
-- `current_user` der aufrufende Nutzer (dasselbe Muster wie `kunde_kontakt_pruefen()`, Migration 78).
create or replace function public.chat_reaktion_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.created_at := now();
    if tg_op = 'INSERT' then
      new.push_gesendet_am := null;
    else
      new.push_gesendet_am := old.push_gesendet_am;
      new.nachricht_id := old.nachricht_id;
      new.profile_id := old.profile_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_chat_reaktion_pruefen on public.chat_reaktionen;
create trigger trg_chat_reaktion_pruefen
  before insert or update on public.chat_reaktionen
  for each row execute procedure public.chat_reaktion_pruefen();

-- Push-Anstoß wie bei Nachrichten (Funktion aus Migration 80).
drop trigger if exists trg_chat_push_anstossen on public.chat_reaktionen;
create trigger trg_chat_push_anstossen
  after insert on public.chat_reaktionen
  for each row execute procedure public.chat_push_anstossen();

-- ---------------------------------------------------------------------
-- 3. Live
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reaktionen') then
    execute 'alter publication supabase_realtime add table public.chat_reaktionen';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
-- ---------------------------------------------------------------------
select 'Antworten (Spalte antwort_auf)' as pruefung,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'chat_nachrichten' and column_name = 'antwort_auf')::text as ergebnis
union all
select 'Tabelle chat_reaktionen', (to_regclass('public.chat_reaktionen') is not null)::text
union all
select 'Live-Aktualisierung (Realtime)',
       case when not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then 'keine Realtime-Veröffentlichung – die App fragt alle 20 s nach'
            else exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_reaktionen')::text end;
