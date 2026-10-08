-- =====================================================================
-- Rücknahme von Migration 84 (Team-Chat: Einzelchats, Bearbeiten/Löschen, Fotos).
--
-- ACHTUNG – was dabei verloren geht:
--   - ALLE Einzelchat-Nachrichten werden gelöscht (der Team-Chat aus Migration 80 kennt nur den
--     einen gemeinsamen Kanal; sie dort hinzustellen, hieße private Nachrichten allen zu zeigen).
--   - Gelöschte Nachrichten („Nachricht gelöscht“) werden entfernt.
--   - Eine Nachricht, die NUR aus einem Foto bestand, behält den Text „[Foto]“.
--   - Der Vermerk „bearbeitet“ entfällt; der bearbeitete Text bleibt.
--   - Die Fotodateien bleiben im Bucket `chat-fotos` liegen – SQL darf sie nicht löschen. Danach in
--     Supabase unter Storage → chat-fotos den Bucket leeren und löschen (oder liegen lassen; ohne die
--     Richtlinien kommt niemand mehr heran).
--
-- Erst die Dateien von v136 wieder hochladen, dann dieses Skript. Zweimal lauffähig.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Rücknahme gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- Funktionen und Trigger von 84
drop function if exists public.chat_unterhaltungen();
drop function if exists public.chat_fotos_weg_liste(integer);
drop function if exists public.chat_fotos_weg_erledigt(text[]);
do $$
begin
  if to_regclass('public.chat_nachrichten') is not null then
    drop trigger if exists trg_chat_nachricht_aendern on public.chat_nachrichten;
    drop trigger if exists trg_chat_nachricht_nachlauf on public.chat_nachrichten;
    drop trigger if exists trg_chat_fotos_vor_leeren on public.chat_nachrichten;
    drop policy if exists "Eigene Nachricht ändern" on public.chat_nachrichten;
  end if;
end $$;
drop function if exists public.chat_nachricht_aendern();
drop function if exists public.chat_nachricht_nachlauf();
drop function if exists public.chat_fotos_vor_leeren();
drop table if exists private.chat_fotos_weg;
drop table if exists public.chat_gelesen_direkt;

drop policy if exists "MR Chatfotos lesen" on storage.objects;
drop policy if exists "MR Chatfotos hochladen" on storage.objects;
drop policy if exists "MR Chatfotos loeschen" on storage.objects;

-- Richtlinien und Funktionen wie in Migration 80 und 81 – zuerst, weil die Richtlinien von 84 an
-- den Spalten hängen, die unten wegfallen (nur wenn der Chat noch da ist).
do $$
begin
  if to_regclass('public.chat_nachrichten') is null then
    return;
  end if;

  drop policy if exists "Chat lesen" on public.chat_nachrichten;
  create policy "Chat lesen" on public.chat_nachrichten
    for select to authenticated
    using (public.darf('chat', 'lesen'));

  execute $f$
    create or replace function public.chat_nachricht_pruefen()
    returns trigger
    language plpgsql
    set search_path = ''
    as $b$
    begin
      new.created_at := now();
      new.text := btrim(new.text);
      return new;
    end;
    $b$
  $f$;

  execute $f$
    create or replace function public.chat_ungelesen()
    returns integer
    language sql
    stable
    security definer
    set search_path = ''
    as $b$
      select case when not public.darf('chat', 'lesen') then 0 else (
        select count(*)::integer from public.chat_nachrichten n
         where n.kanal = 'team'
           and n.autor <> (select auth.uid())
           and n.created_at > coalesce((select g.gelesen_bis from public.chat_gelesen g where g.profile_id = (select auth.uid())), '-infinity'::timestamptz)
      ) end;
    $b$
  $f$;
  revoke all on function public.chat_ungelesen() from public, anon;
  grant execute on function public.chat_ungelesen() to authenticated;

  if to_regclass('public.chat_reaktionen') is not null then
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
  end if;
end $$;
-- Nachrichten zurück auf den Stand von 80/81 und die Spalten entfernen.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'chat_nachrichten' and column_name = 'an') then
    execute $s$ delete from public.chat_nachrichten where kanal <> 'team' or geloescht_am is not null $s$;
    execute $s$ update public.chat_nachrichten set text = '[Foto]' where btrim(text) = '' and foto_pfad is not null $s$;
  end if;
end $$;
alter table if exists public.chat_nachrichten drop constraint if exists chat_foto_passt;
alter table if exists public.chat_nachrichten drop constraint if exists chat_kanal_bekannt;
alter table if exists public.chat_nachrichten drop constraint if exists chat_text_laenge;
drop index if exists public.chat_nachrichten_direkt_an;
drop index if exists public.chat_nachrichten_direkt_autor;
drop index if exists public.chat_nachrichten_foto;
alter table if exists public.chat_nachrichten
  drop column if exists an,
  drop column if exists bearbeitet_am,
  drop column if exists geloescht_am,
  drop column if exists foto_pfad,
  drop column if exists foto_breite,
  drop column if exists foto_hoehe;

do $$
begin
  if to_regclass('public.chat_nachrichten') is not null then
    alter table public.chat_nachrichten add constraint chat_kanal_bekannt check (kanal = 'team');
    alter table public.chat_nachrichten add constraint chat_text_laenge check (char_length(btrim(text)) between 1 and 4000);
  end if;
end $$;
drop function if exists public.chat_ungelesen_von(uuid);
drop function if exists public.chat_kann_mitlesen(uuid);

select 'Einzelchats, Bearbeiten, Fotos entfernt (sollte true sein)' as pruefung,
       (to_regclass('public.chat_gelesen_direkt') is null
        and to_regprocedure('public.chat_unterhaltungen()') is null
        and not exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'chat_nachrichten' and column_name in ('an', 'foto_pfad')))::text as ergebnis
union all
select 'Bucket chat-fotos – Dateien bitte unter Storage entfernen',
       coalesce((select 'noch da, ' || count(o.*)::text || ' Dateien' from storage.buckets b left join storage.objects o on o.bucket_id = b.id
                  where b.id = 'chat-fotos' group by b.id), 'nicht vorhanden');
