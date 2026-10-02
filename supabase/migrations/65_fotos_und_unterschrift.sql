-- =====================================================================
-- Migration 65 – Foto und Unterschrift am Auftrag (Fahrplan E3, 02.10.2026, v105).
--
-- Zustand der Reifen vorher/nachher fotografieren und den Kunden auf dem Handy quittieren lassen.
-- Bei einer Reklamation ist das der Unterschied zwischen Aussage gegen Aussage und einem Beleg.
--
-- 1. Ein PRIVATER Speicherbereich (Bucket) `auftrag-belege` in Supabase Storage. Die Dateien liegen
--    unter `<auftrag-id>/<datei>`; angezeigt werden sie nur über zeitlich begrenzte Links.
-- 2. Die Tabelle `auftrag_belege`: je Foto bzw. Unterschrift eine Zeile mit Art, Pfad, Maßen.
-- 3. Rechte: Wer den Auftrag sieht, sieht seine Belege (für den Techniker also nur die eigenen
--    Aufträge – die Richtlinien fragen `orders` und damit dessen Zeilenrechte). Hinzufügen darf, wer
--    Aufträge schreiben darf; löschen, wer Aufträge löschen darf. Ändern gibt es nicht: Ein Beleg,
--    den man nachträglich umschreiben kann, ist keiner.
-- 4. Der Auskunftsauszug (E10) nennt die Belege eines Kunden.
--
-- Dateien werden NIE per SQL gelöscht – Supabase lässt das nicht mehr zu (nur über die Storage-
-- Schnittstelle). Die Anwendung löscht deshalb zuerst die Dateien und dann die Zeile; beim
-- endgültigen Löschen eines Kunden ebenso (components/admin/PapierkorbPanel.tsx).
--
-- Der SQL-Editor führt Anweisung für Anweisung aus (CLAUDE.md, Abschnitt 2): Jeder Abschnitt steht
-- für sich und ist wiederholbar. Reihenfolge SQL/Dateien: **SQL zuerst** – die neue Oberfläche liest
-- `auftrag_belege` und lädt in den Bucket.
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.orders') is null or to_regprocedure('public.darf(text,text)') is null
     or to_regprocedure('public.kunde_auskunft(uuid)') is null then
    raise exception
      'FALSCHES PROJEKT oder Migration 64 fehlt: Hier gibt es kein public.orders / public.darf() / public.kunde_auskunft(). Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage fehlt in diesem Projekt (storage.buckets). Es wurde nichts geändert. (Datenbank: %)', current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Der Speicherbereich
-- ---------------------------------------------------------------------
-- Privat: Ohne Anmeldung kommt niemand an eine Datei, auch nicht mit dem Dateinamen. Höchstens
-- 3 MB je Datei – die App verkleinert vorher auf 1600 Pixel Kante (lib/belege.ts), ein Foto hat
-- danach meist 200–500 kB. Nur Bilder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('auftrag-belege', 'auftrag-belege', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Der erste Ordner im Pfad ist die Auftrags-Kennung. Wer den Auftrag sehen darf, darf die Dateien
-- sehen – die Abfrage auf `orders` läuft mit den Zeilenrechten des Aufrufers.
drop policy if exists "MR Belege lesen" on storage.objects;
create policy "MR Belege lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'auftrag-belege'
         and exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1]));
drop policy if exists "MR Belege hochladen" on storage.objects;
create policy "MR Belege hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'auftrag-belege'
              and public.darf('auftraege.auftrag', 'schreiben')
              and exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1]));
drop policy if exists "MR Belege loeschen" on storage.objects;
create policy "MR Belege loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'auftrag-belege' and public.darf('auftraege.auftrag', 'loeschen'));

-- ---------------------------------------------------------------------
-- 2. Die Tabelle
-- ---------------------------------------------------------------------
create table if not exists public.auftrag_belege (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  -- vorher / nachher / schaden / unterschrift
  art          text not null,
  -- Pfad im Bucket `auftrag-belege`: „<order_id>/<datei>"
  pfad         text not null,
  -- Bei Fotos eine Beschriftung („Flanke VL"), bei der Unterschrift der Name, der darunter steht.
  beschriftung text,
  breite       integer,
  hoehe        integer,
  bytes        integer,
  created_at   timestamptz not null default now(),
  created_by   uuid
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'auftrag_belege_art_bekannt') then
    alter table public.auftrag_belege add constraint auftrag_belege_art_bekannt
      check (art in ('vorher', 'nachher', 'schaden', 'unterschrift'));
  end if;
  -- Der Pfad gehört zum Auftrag der Zeile – sonst ließe sich ein fremdes Foto „ausleihen".
  if not exists (select 1 from pg_constraint where conname = 'auftrag_belege_pfad_passt') then
    alter table public.auftrag_belege add constraint auftrag_belege_pfad_passt
      check (split_part(pfad, '/', 1) = order_id::text and length(pfad) > 37);
  end if;
end $$;
create unique index if not exists auftrag_belege_pfad_einmalig on public.auftrag_belege (pfad);
create index if not exists auftrag_belege_auftrag_idx on public.auftrag_belege (order_id, created_at);

alter table public.auftrag_belege enable row level security;

drop policy if exists "Belege lesen" on public.auftrag_belege;
create policy "Belege lesen" on public.auftrag_belege
  for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));
drop policy if exists "Belege anlegen" on public.auftrag_belege;
create policy "Belege anlegen" on public.auftrag_belege
  for insert to authenticated
  with check (public.darf('auftraege.auftrag', 'schreiben') and exists (select 1 from public.orders o where o.id = order_id));
-- Löschen: wie überall seit Migration 42 – die Richtlinie lässt sehen, der Trigger entscheidet und begründet.
drop policy if exists "Belege loeschen" on public.auftrag_belege;
create policy "Belege loeschen" on public.auftrag_belege
  for delete to authenticated using (exists (select 1 from public.orders o where o.id = order_id));

drop trigger if exists trg_loeschrecht on public.auftrag_belege;
create trigger trg_loeschrecht
  before delete on public.auftrag_belege
  for each row execute procedure public.pruefe_loeschrecht('auftraege.auftrag');
drop trigger if exists trg_stamp_row on public.auftrag_belege;
create trigger trg_stamp_row
  before insert on public.auftrag_belege
  for each row execute procedure public.stamp_row();
drop trigger if exists trg_audit_row on public.auftrag_belege;
create trigger trg_audit_row
  after insert or delete on public.auftrag_belege
  for each row execute procedure public.audit_row();

grant select, insert, delete on public.auftrag_belege to authenticated;
grant all on public.auftrag_belege to service_role;

comment on table public.auftrag_belege is
  'Fotos und Unterschrift je Auftrag (Fahrplan E3, Migration 65). Die Dateien liegen im privaten Bucket auftrag-belege unter <order_id>/…';

-- ---------------------------------------------------------------------
-- 3. Auskunftsauszug: die Belege des Kunden dazu
-- ---------------------------------------------------------------------
-- Die bisherige Funktion aus Migration 64 bleibt unverändert unter neuem Namen; die neue ruft sie
-- und hängt die Belege an. So steht der lange Abruf nicht ein zweites Mal hier.
do $$
begin
  if to_regprocedure('public.kunde_auskunft_grund(uuid)') is null then
    alter function public.kunde_auskunft(uuid) rename to kunde_auskunft_grund;
  end if;
end $$;
revoke all on function public.kunde_auskunft_grund(uuid) from public, anon, authenticated;

create or replace function public.kunde_auskunft(p_kunde uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ergebnis jsonb;
begin
  -- Prüft Rolle und Laufkundschaft selbst und bricht sonst ab.
  ergebnis := public.kunde_auskunft_grund(p_kunde);
  return ergebnis || jsonb_build_object('belege', coalesce((
    select jsonb_agg(jsonb_build_object('auftrag', o.order_number, 'art', b.art, 'beschriftung', b.beschriftung,
                                        'aufgenommen', b.created_at) order by b.created_at, b.id)
      from public.auftrag_belege b join public.orders o on o.id = b.order_id
     where o.customer_id = p_kunde), '[]'::jsonb));
end;
$$;

comment on function public.kunde_auskunft(uuid) is
  'Fahrplan E10 (Migration 64), seit Migration 65 mit den Belegen (Fotos/Unterschrift). Nur Admin/Superadmin.';
revoke all on function public.kunde_auskunft(uuid) from public, anon;
grant execute on function public.kunde_auskunft(uuid) to authenticated;

commit;

-- Zur Kontrolle (Ergebnistabelle – der SQL-Editor zeigt keine Meldungen):
select 'Bucket auftrag-belege (privat)' as pruefung,
  (select case when b.public then 'ÖFFENTLICH – prüfen!' else 'ja, privat' end from storage.buckets b where b.id = 'auftrag-belege') as ergebnis
union all
select 'Speicher-Richtlinien', (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'MR Belege%')
union all
select 'Tabelle auftrag_belege', (to_regclass('public.auftrag_belege') is not null)::text
union all
select 'Auskunft mit Belegen', (to_regprocedure('public.kunde_auskunft_grund(uuid)') is not null)::text;
