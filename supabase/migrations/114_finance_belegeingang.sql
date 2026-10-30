-- =====================================================================
-- Migration 114 – Finance, Stufe F: Belegeingang – Belegbild an jeder Buchung (30.10.2026, v186).
--
-- docs/finance.md Abschnitt 19.
--
--   1. `fin_buchung_dateien`: Foto, PDF oder E-Rechnung an JEDER Buchung (von Hand, Bank, Kasse, Stapel) – nicht nur an
--      Belegen. Die Datei liegt im privaten Bucket `fin-belege` unter `buchung/<Buchungs-ID>/<Datei>`.
--      Unveränderbar wie die Buchung (GoBD): kein Ändern, kein Löschen – ein falsch angehängtes Bild bleibt stehen, die
--      Buchung wird storniert und neu gebucht. Lesen mit „Finance › Buchungen“ lesen, anhängen mit „… schreiben“.
--   2. Storage: Hochladen und Lesen unter `buchung/…` nach dem Buchungsrecht; die Löschregel aus Migration 90 nimmt
--      `buchung/…` ausdrücklich aus (sonst hätte „Finance › Belege“ schreiben diese Dateien löschen können).
--   Der Belegkorb (mehrere Fotos auf einmal → je ein Entwurf) braucht keine Datenbankänderung.
--
-- Reihenfolge: nach 113, SQL zuerst, dann v186. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_zahlauftraege') is null then
    raise exception 'Zuerst Migration 113 (Finance: Zahlungsausgang) ausführen. Es wurde nichts geändert.';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage fehlt in diesem Projekt (storage.objects). Es wurde nichts geändert. (Datenbank: %)', current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Dateien an Buchungen
-- ---------------------------------------------------------------------
create table if not exists public.fin_buchung_dateien (
  id           uuid primary key default gen_random_uuid(),
  buchung_id   uuid not null references public.fin_buchungen (id),
  pfad         text not null unique,
  name         text not null,
  typ          text not null,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  constraint fin_bd_name check (length(name) between 1 and 200),
  constraint fin_bd_typ  check (typ in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/xml', 'text/xml'))
);
create index if not exists fin_buchung_dateien_buchung on public.fin_buchung_dateien (buchung_id);
comment on table public.fin_buchung_dateien is
  'Migration 114: Belegbild an einer Buchung (Bucket fin-belege, Pfad buchung/<Buchung>/…). Unveränderbar; lesen finance.buchen.';
alter table public.fin_buchung_dateien enable row level security;
drop policy if exists "Finance-Buchungsdateien lesen" on public.fin_buchung_dateien;
create policy "Finance-Buchungsdateien lesen" on public.fin_buchung_dateien for select to authenticated using (public.darf('finance.buchen', 'lesen'));
revoke all on public.fin_buchung_dateien from anon, authenticated;
grant select on public.fin_buchung_dateien to authenticated;

-- Nach dem Hochladen: die Datei an der Buchung festhalten. Der Pfad muss zur Buchung gehören.
create or replace function public.fin_buchung_datei_merken(p_buchung uuid, p_pfad text, p_name text, p_typ text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.darf('finance.buchen', 'schreiben') then
    raise exception 'Belegbilder anhängen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Buchungen“ schreiben).';
  end if;
  if not exists (select 1 from public.fin_buchungen where id = p_buchung) then raise exception 'Diese Buchung gibt es nicht.'; end if;
  if p_pfad is null or p_pfad not like 'buchung/' || p_buchung::text || '/%' or p_pfad like '%..%' then
    raise exception 'Der Ablageort passt nicht zur Buchung.';
  end if;
  if p_typ is null or p_typ not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/xml', 'text/xml') then
    raise exception 'Erlaubt sind Foto (JPEG, PNG, WebP), PDF und E-Rechnung (XML).';
  end if;
  if (select count(*) from public.fin_buchung_dateien where buchung_id = p_buchung) >= 10 then
    raise exception 'Höchstens 10 Dateien je Buchung.';
  end if;
  insert into public.fin_buchung_dateien (buchung_id, pfad, name, typ)
  values (p_buchung, p_pfad, left(coalesce(nullif(btrim(p_name), ''), 'Beleg'), 200), p_typ)
  on conflict (pfad) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.fin_buchung_datei_merken(uuid, text, text, text) from public, anon;
grant execute on function public.fin_buchung_datei_merken(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Storage
-- ---------------------------------------------------------------------
drop policy if exists "Finance-Buchungsdateien lesen" on storage.objects;
create policy "Finance-Buchungsdateien lesen" on storage.objects for select to authenticated
  using (bucket_id = 'fin-belege' and (storage.foldername(name))[1] = 'buchung' and public.darf('finance.buchen', 'lesen'));
drop policy if exists "Finance-Buchungsdateien hochladen" on storage.objects;
create policy "Finance-Buchungsdateien hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'fin-belege' and (storage.foldername(name))[1] = 'buchung' and public.darf('finance.buchen', 'schreiben')
              and exists (select 1 from public.fin_buchungen b where b.id::text = (storage.foldername(name))[2]));
-- Wie Migration 90, dazu: nie unter buchung/ (diese Dateien sind unveränderbar).
drop policy if exists "Finance-Belegdateien löschen" on storage.objects;
create policy "Finance-Belegdateien löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'fin-belege' and (storage.foldername(name))[1] <> 'buchung' and public.darf('finance.belege', 'schreiben')
         and not exists (select 1 from public.fin_belege b where b.id::text = (storage.foldername(name))[1] and b.status <> 'entwurf'));

-- ---------------------------------------------------------------------
-- 3. Ergebnis
-- ---------------------------------------------------------------------
select 'Tabelle fin_buchung_dateien (RLS)' as pruefung,
       (select c.relname || case when c.relrowsecurity then ' RLS an' else ' RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_buchung_dateien')) as ergebnis
union all
select 'Funktion fin_buchung_datei_merken', case when to_regprocedure('public.fin_buchung_datei_merken(uuid,text,text,text)') is not null then 'ja' else 'FEHLT' end
union all
select 'Storage-Regeln Finance (fin-belege)',
       (select string_agg(p.policyname, ', ' order by p.policyname) from pg_policies p
         where p.schemaname = 'storage' and p.tablename = 'objects' and (p.policyname like 'Finance-Belegdateien%' or p.policyname like 'Finance-Buchungsdateien%'));
