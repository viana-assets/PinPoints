-- =====================================================================
-- Migration 90 – Finance, Phase F2: Belege und Lieferanten (13.10.2026, v148).
--
-- docs/finance.md Abschnitt 4.1, schlank: Eingangsrechnungen und Quittungen erfassen, buchen, bezahlen.
--
--   1. LIEFERANTEN `fin_lieferanten`: Name, USt-IdNr., Vorschlag für Konto und Steuerschlüssel. Kein
--      Löschen (ausblenden).
--   2. BELEGE `fin_belege`: Entwurf (frei änderbar, mit Datei) → gebucht (unveränderbar) → bezahlt;
--      Korrektur nur per Storno. Je Posten Konto, Betrag, Steuerschlüssel – gebucht wird über
--      `fin_posten_schreiben()` (Migration 88) gegen „Verbindlichkeiten aus Lieferungen und Leistungen“.
--   3. DATEIEN im privaten Bucket `fin-belege` (Foto, PDF, E-Rechnung als XML), Pfad `<Beleg-ID>/<Datei>`.
--      Hochladen nur zu einem Entwurf, Löschen nur im Entwurf – die Datei eines gebuchten Belegs bleibt
--      (Aufbewahrung, GoBD). Dateien löscht kein SQL (Migration 65); „Alle Daten löschen“ leert den Bucket
--      über app/api/alle-daten/fotos.
--   4. Einstiege: `fin_beleg_buchen()` (auf Wunsch gleich bar/Bank bezahlt), `fin_beleg_bezahlt()`,
--      `fin_beleg_zahlung_zuruecknehmen()`, `fin_beleg_stornieren()`.
--
-- PILOT wie alles in Finance. Reihenfolge: nach 89, SQL zuerst, dann die Dateien von v148. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_rechnungen') is null or to_regprocedure('public.fin_gegenbuchung(uuid,text,text,uuid)') is null then
    raise exception 'Zuerst Migration 89 (Finance: Rechnungen) ausführen. Es wurde nichts geändert.';
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage fehlt in diesem Projekt (storage.buckets). Es wurde nichts geändert. (Datenbank: %)', current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Quelle „beleg“ und das Verbindlichkeitskonto
-- ---------------------------------------------------------------------
alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
alter table public.fin_buchungen add constraint fin_buchung_quelle check (quelle in ('manuell', 'rechnung', 'zahlung', 'beleg'));

-- Wie Migration 89, dazu die Verbindlichkeiten. Dieselben Nummern in lib/finance/rechnungen.ts (FIN_RECHNUNG_KONTEN).
create or replace function public.fin_rechnung_konto(p_rahmen text, p_zweck text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_rahmen
    when 'skr03' then case p_zweck when 'forderung' then 1400 when 'kasse' then 1000 when 'bank' then 1200
      when 'erloes19' then 8400 when 'erloes7' then 8300 when 'erloes0' then 8200 when 'erloes_klein' then 8195
      when 'verbindlichkeit' then 1600 end
    when 'skr04' then case p_zweck when 'forderung' then 1200 when 'kasse' then 1600 when 'bank' then 1800
      when 'erloes19' then 4400 when 'erloes7' then 4300 when 'erloes0' then 4200 when 'erloes_klein' then 4185
      when 'verbindlichkeit' then 3300 end
  end
$$;
revoke all on function public.fin_rechnung_konto(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Lieferanten
-- ---------------------------------------------------------------------
create table if not exists public.fin_lieferanten (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  ust_id      text,
  konto       integer,
  steuer      text,
  aktiv       boolean not null default true,
  erstellt_am timestamptz not null default now(),
  constraint fin_lief_name  check (length(btrim(name)) between 1 and 120),
  constraint fin_lief_ustid check (ust_id is null or length(ust_id) <= 20),
  constraint fin_lief_konto check (konto is null or konto between 1 and 9999)
);
create unique index if not exists fin_lieferanten_name on public.fin_lieferanten (lower(btrim(name)));
comment on table public.fin_lieferanten is 'Migration 90: Lieferanten (Kreditoren) mit Kontovorschlag. Lesen/schreiben: finance.belege. Kein Löschen.';
alter table public.fin_lieferanten enable row level security;
drop policy if exists "Finance-Lieferanten lesen" on public.fin_lieferanten;
create policy "Finance-Lieferanten lesen" on public.fin_lieferanten for select to authenticated using (public.darf('finance.belege', 'lesen'));
drop policy if exists "Finance-Lieferanten anlegen" on public.fin_lieferanten;
create policy "Finance-Lieferanten anlegen" on public.fin_lieferanten for insert to authenticated with check (public.darf('finance.belege', 'schreiben'));
drop policy if exists "Finance-Lieferanten ändern" on public.fin_lieferanten;
create policy "Finance-Lieferanten ändern" on public.fin_lieferanten for update to authenticated
  using (public.darf('finance.belege', 'schreiben')) with check (public.darf('finance.belege', 'schreiben'));
revoke all on public.fin_lieferanten from anon, authenticated;
grant select on public.fin_lieferanten to authenticated;
grant insert (id, name, ust_id, konto, steuer) on public.fin_lieferanten to authenticated;
grant update (name, ust_id, konto, steuer, aktiv) on public.fin_lieferanten to authenticated;

-- ---------------------------------------------------------------------
-- 3. Belege
-- ---------------------------------------------------------------------
create table if not exists public.fin_belege (
  id                 uuid primary key default gen_random_uuid(),
  lieferant_id       uuid references public.fin_lieferanten (id),
  belegdatum         date not null default current_date,
  belegnummer        text,
  text               text,
  faellig_am         date,
  -- [{ "konto": 4530, "betrag": 59.50, "steuer": "vst19" }] – Betrag wie bei fin_buchen(): brutto, bei § 13b netto.
  posten             jsonb not null default '[]'::jsonb,
  datei_pfad         text,
  datei_typ          text,
  datei_name         text,
  status             text not null default 'entwurf',
  brutto             numeric(14,2),
  buchung_id         uuid references public.fin_buchungen (id),
  storno_buchung_id  uuid references public.fin_buchungen (id),
  bezahlt_am         date,
  bezahlt_art        text,
  zahlung_buchung_id uuid references public.fin_buchungen (id),
  erstellt_am        timestamptz not null default now(),
  erstellt_von       uuid default auth.uid(),
  aktualisiert_am    timestamptz not null default now(),
  constraint fin_beleg_status  check (status in ('entwurf', 'gebucht', 'storniert')),
  constraint fin_beleg_posten  check (jsonb_typeof(posten) = 'array' and jsonb_array_length(posten) <= 50),
  constraint fin_beleg_nummer  check (belegnummer is null or length(belegnummer) <= 60),
  constraint fin_beleg_text    check (text is null or length(text) <= 200),
  constraint fin_beleg_art     check (bezahlt_art is null or bezahlt_art in ('bar', 'bank')),
  constraint fin_beleg_bezahlt check ((bezahlt_am is null) = (bezahlt_art is null) and (bezahlt_am is null) = (zahlung_buchung_id is null)),
  constraint fin_beleg_gebucht check (status = 'entwurf' or buchung_id is not null)
);
create index if not exists fin_belege_status on public.fin_belege (status, belegdatum);
comment on table public.fin_belege is
  'Migration 90: Eingangsbelege. Entwurf direkt änderbar (finance.belege schreiben), gebucht/storniert nur über Funktionen.';
alter table public.fin_belege enable row level security;
drop policy if exists "Finance-Belege lesen" on public.fin_belege;
create policy "Finance-Belege lesen" on public.fin_belege for select to authenticated using (public.darf('finance.belege', 'lesen'));
drop policy if exists "Finance-Belege anlegen" on public.fin_belege;
create policy "Finance-Belege anlegen" on public.fin_belege for insert to authenticated with check (public.darf('finance.belege', 'schreiben'));
drop policy if exists "Finance-Belege ändern" on public.fin_belege;
create policy "Finance-Belege ändern" on public.fin_belege for update to authenticated
  using (public.darf('finance.belege', 'schreiben')) with check (public.darf('finance.belege', 'schreiben'));
-- Löschen prüft hier nur „lesen“ – die Entscheidung mit Begründung trifft fin_beleg_pruefen() (CLAUDE.md, Rechte und RLS).
drop policy if exists "Finance-Belege löschen" on public.fin_belege;
create policy "Finance-Belege löschen" on public.fin_belege for delete to authenticated using (public.darf('finance.belege', 'lesen'));
revoke all on public.fin_belege from anon, authenticated;
grant select, delete on public.fin_belege to authenticated;
grant insert (id, lieferant_id, belegdatum, belegnummer, text, faellig_am, posten, datei_pfad, datei_typ, datei_name) on public.fin_belege to authenticated;
grant update (lieferant_id, belegdatum, belegnummer, text, faellig_am, posten, datei_pfad, datei_typ, datei_name) on public.fin_belege to authenticated;

-- Direkt aus der App (current_user = authenticated) nur Entwürfe. Die Funktionen unten laufen als
-- Eigentümer und dürfen buchen. Bewusst OHNE security definer – sonst sähe der Trigger immer den Eigentümer.
create or replace function public.fin_beleg_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    new.aktualisiert_am := now();
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'entwurf' then
      raise exception 'Ein gebuchter Beleg wird nicht gelöscht – stornieren.';
    end if;
    if not public.darf('finance.belege', 'loeschen') then
      raise exception 'Einen Entwurf verwerfen darf nur, wer „Finance › Belege“ löschen darf.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'entwurf' then
    raise exception 'Ein gebuchter Beleg ist unveränderbar – Korrektur nur per Storno.';
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$$;
drop trigger if exists fin_beleg_pruefen on public.fin_belege;
create trigger fin_beleg_pruefen before insert or update or delete on public.fin_belege
  for each row execute function public.fin_beleg_pruefen();

-- ---------------------------------------------------------------------
-- 4. Dateien
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fin-belege', 'fin-belege', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/xml', 'text/xml'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Finance-Belegdateien lesen" on storage.objects;
create policy "Finance-Belegdateien lesen" on storage.objects for select to authenticated
  using (bucket_id = 'fin-belege' and public.darf('finance.belege', 'lesen'));
drop policy if exists "Finance-Belegdateien hochladen" on storage.objects;
create policy "Finance-Belegdateien hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'fin-belege' and public.darf('finance.belege', 'schreiben')
              and exists (select 1 from public.fin_belege b where b.id::text = (storage.foldername(name))[1] and b.status = 'entwurf'));
drop policy if exists "Finance-Belegdateien löschen" on storage.objects;
create policy "Finance-Belegdateien löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'fin-belege' and public.darf('finance.belege', 'schreiben')
         and not exists (select 1 from public.fin_belege b where b.id::text = (storage.foldername(name))[1] and b.status <> 'entwurf'));

-- ---------------------------------------------------------------------
-- 5. Buchen, bezahlen, stornieren
-- ---------------------------------------------------------------------
create or replace function public.fin_beleg_zahlung_schreiben(p_beleg uuid, p_art text, p_datum date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.fin_belege%rowtype;
  e public.fin_einstellungen%rowtype;
  geld integer; verb integer; neu uuid; n integer;
begin
  if p_art is null or p_art not in ('bar', 'bank') then raise exception 'Bar oder Überweisung angeben.'; end if;
  if p_datum is null then raise exception 'Das Datum der Zahlung fehlt.'; end if;
  if p_datum > (now() at time zone 'Europe/Berlin')::date then raise exception 'Eine Zahlung in der Zukunft wird nicht erfasst.'; end if;
  select * into b from public.fin_belege where id = p_beleg for update;
  if b.id is null or b.status <> 'gebucht' then raise exception 'Erst den Beleg buchen, dann die Zahlung.'; end if;
  if b.bezahlt_am is not null then raise exception 'Dieser Beleg ist schon als bezahlt erfasst.'; end if;
  e := public.fin_buchbar(p_datum);
  geld := public.fin_rechnung_konto(e.kontenrahmen, case p_art when 'bar' then 'kasse' else 'bank' end);
  verb := public.fin_rechnung_konto(e.kontenrahmen, 'verbindlichkeit');
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = geld and k.aktiv) then
    raise exception 'Das Konto % ist ausgeblendet.', lpad(geld::text, 4, '0');
  end if;
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, p_datum, left(case p_art when 'bar' then 'Bar bezahlt: ' else 'Überweisung: ' end ||
          coalesce(nullif(b.belegnummer, ''), 'Beleg') || coalesce(' · ' || (select l.name from public.fin_lieferanten l where l.id = b.lieferant_id), ''), 200),
          b.belegnummer, 'zahlung', b.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', verb, b.brutto), (neu, 1, 'H', geld, b.brutto);
  update public.fin_belege set bezahlt_am = p_datum, bezahlt_art = p_art, zahlung_buchung_id = neu where id = b.id;
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;

create or replace function public.fin_beleg_buchen(p_beleg uuid, p_bezahlt text default null, p_bezahlt_am date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.fin_belege%rowtype;
  e public.fin_einstellungen%rowtype;
  lname text;
  verb integer;
  neu uuid;
  n integer;
  posten jsonb;
  summe numeric;
begin
  if not public.darf('finance.belege', 'schreiben') then
    raise exception 'Belege buchen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Belege“ schreiben).';
  end if;
  select * into b from public.fin_belege where id = p_beleg for update;
  if b.id is null then raise exception 'Diesen Beleg gibt es nicht.'; end if;
  if b.status <> 'entwurf' then raise exception 'Dieser Beleg ist schon gebucht.'; end if;
  select name into lname from public.fin_lieferanten where id = b.lieferant_id;
  if lname is null then raise exception 'Der Lieferant fehlt.'; end if;
  if jsonb_array_length(b.posten) = 0 then raise exception 'Der Beleg braucht mindestens einen Posten.'; end if;
  e := public.fin_buchbar(b.belegdatum);
  verb := public.fin_rechnung_konto(e.kontenrahmen, 'verbindlichkeit');
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = verb and k.aktiv) then
    raise exception 'Das Konto % (Verbindlichkeiten) ist ausgeblendet.', lpad(verb::text, 4, '0');
  end if;
  select jsonb_agg(jsonb_build_object('soll', p -> 'konto', 'haben', verb, 'betrag', p -> 'betrag', 'steuer', p -> 'steuer'))
    into posten from jsonb_array_elements(b.posten) p;
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, b.belegdatum,
          left(coalesce(nullif(btrim(b.text), ''), 'Beleg') || ' · ' || lname, 200), b.belegnummer, 'beleg', b.id)
  returning id into neu;
  perform public.fin_posten_schreiben(neu, e.kontenrahmen, e.besteuerung, e.r13b_empfaenger, e.innergemeinschaftlich, posten);
  select coalesce(sum(case z.seite when 'H' then z.betrag else -z.betrag end), 0) into summe
    from public.fin_buchungszeilen z where z.buchung_id = neu and z.konto = verb;
  if summe <= 0 then raise exception 'Der Beleg ergibt keine Verbindlichkeit – bitte die Posten prüfen.'; end if;
  update public.fin_belege set status = 'gebucht', buchung_id = neu, brutto = summe,
         faellig_am = coalesce(faellig_am, belegdatum) where id = b.id;
  if p_bezahlt is not null then
    perform public.fin_beleg_zahlung_schreiben(b.id, p_bezahlt, coalesce(p_bezahlt_am, b.belegdatum));
  end if;
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n, 'brutto', summe);
end;
$$;

create or replace function public.fin_beleg_bezahlt(p_beleg uuid, p_art text, p_datum date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.belege', 'schreiben') then
    raise exception 'Zahlungen erfassen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Belege“ schreiben).';
  end if;
  return public.fin_beleg_zahlung_schreiben(p_beleg, p_art, p_datum);
end;
$$;

create or replace function public.fin_beleg_zahlung_zuruecknehmen(p_beleg uuid, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.fin_belege%rowtype;
  g jsonb;
begin
  if not public.darf('finance.belege', 'schreiben') then
    raise exception 'Zahlungen zurücknehmen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Belege“ schreiben).';
  end if;
  select * into b from public.fin_belege where id = p_beleg for update;
  if b.zahlung_buchung_id is null then raise exception 'Zu diesem Beleg ist keine Zahlung erfasst.'; end if;
  g := public.fin_gegenbuchung(b.zahlung_buchung_id, p_grund, null, null);
  update public.fin_belege set bezahlt_am = null, bezahlt_art = null, zahlung_buchung_id = null where id = b.id;
  return g;
end;
$$;

create or replace function public.fin_beleg_stornieren(p_beleg uuid, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.fin_belege%rowtype;
  g jsonb;
begin
  if not public.darf('finance.belege', 'schreiben') then
    raise exception 'Belege stornieren ist für deine Rolle nicht freigeschaltet (Recht „Finance › Belege“ schreiben).';
  end if;
  select * into b from public.fin_belege where id = p_beleg for update;
  if b.id is null then raise exception 'Diesen Beleg gibt es nicht.'; end if;
  if b.status <> 'gebucht' then raise exception 'Storniert wird nur ein gebuchter Beleg – einen Entwurf verwirft man.'; end if;
  if b.bezahlt_am is not null then raise exception 'Erst die Zahlung zurücknehmen, dann den Beleg stornieren.'; end if;
  g := public.fin_gegenbuchung(b.buchung_id, p_grund, null, null);
  update public.fin_belege set status = 'storniert', storno_buchung_id = (g ->> 'id')::uuid where id = b.id;
  return g;
end;
$$;

-- Von Hand stornieren (Migration 88/89): auch Belegbuchungen gehen ihren eigenen Weg.
create or replace function public.fin_stornieren(p_id uuid, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q text;
begin
  if not public.darf('finance.buchen', 'schreiben') then
    raise exception 'Stornieren ist für deine Rolle nicht freigeschaltet (Recht „Finance › Buchungen“ schreiben).';
  end if;
  select quelle into q from public.fin_buchungen where id = p_id;
  if q = 'rechnung' then
    raise exception 'Diese Buchung kommt aus einer Rechnung – storniert wird die Rechnung (in FSM), dann storniert Finance die Buchung mit.';
  end if;
  if q = 'beleg' then
    raise exception 'Diese Buchung kommt aus einem Beleg – stornieren unter Finance › Belege am Beleg.';
  end if;
  if q = 'zahlung' then
    raise exception 'Diese Buchung ist eine Zahlung – zurücknehmen an der Rechnung bzw. am Beleg.';
  end if;
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;

revoke all on function public.fin_beleg_zahlung_schreiben(uuid, text, date) from public, anon, authenticated;
revoke all on function public.fin_beleg_buchen(uuid, text, date) from public, anon;
revoke all on function public.fin_beleg_bezahlt(uuid, text, date) from public, anon;
revoke all on function public.fin_beleg_zahlung_zuruecknehmen(uuid, text) from public, anon;
revoke all on function public.fin_beleg_stornieren(uuid, text) from public, anon;
revoke all on function public.fin_stornieren(uuid, text) from public, anon;
revoke all on function public.fin_beleg_pruefen() from public, anon, authenticated;
grant execute on function public.fin_beleg_buchen(uuid, text, date) to authenticated;
grant execute on function public.fin_beleg_bezahlt(uuid, text, date) to authenticated;
grant execute on function public.fin_beleg_zahlung_zuruecknehmen(uuid, text) to authenticated;
grant execute on function public.fin_beleg_stornieren(uuid, text) to authenticated;
grant execute on function public.fin_stornieren(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Kontrolle – eine Ergebnistabelle.
-- ---------------------------------------------------------------------
select 'Tabellen (RLS)' as pruefung,
       coalesce((select string_agg(c.relname || case when c.relrowsecurity then ' an' else ' AUS' end, ', ' order by c.relname)
                   from pg_class c join pg_namespace s on s.oid = c.relnamespace
                  where s.nspname = 'public' and c.relname in ('fin_belege', 'fin_lieferanten')), 'fehlt') as ergebnis
union all
select 'Richtlinien', coalesce((select string_agg(p.tablename || ': ' || p.cmd, ', ' order by p.tablename, p.cmd) from pg_policies p
                                 where p.schemaname = 'public' and p.tablename in ('fin_belege', 'fin_lieferanten')), 'keine')
union all
select 'Speicher fin-belege', coalesce((select case when b.public then 'ÖFFENTLICH – prüfen!' else 'ja, privat' end from storage.buckets b where b.id = 'fin-belege'), 'fehlt')
union all
select 'Speicher-Richtlinien', coalesce((select string_agg(p.cmd, ', ' order by p.cmd) from pg_policies p
                                          where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname like 'Finance-Belegdateien%'), 'keine')
union all
select 'Funktionen', (select string_agg(x, ', ') from unnest(array['fin_beleg_buchen(uuid,text,date)', 'fin_beleg_bezahlt(uuid,text,date)',
                       'fin_beleg_zahlung_zuruecknehmen(uuid,text)', 'fin_beleg_stornieren(uuid,text)']) x where to_regprocedure('public.' || x) is not null);
