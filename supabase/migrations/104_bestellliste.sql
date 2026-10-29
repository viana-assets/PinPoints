-- =====================================================================
-- Migration 104 – Bestellliste: „Fehlt was?“ (29.10.2026, v173).
--
-- Wunsch Vitali 29.10.2026 (Mockup Claude outputs/Mockup_Bestellliste_v1.html): Techniker tragen vor Ort ein,
-- was fehlt – Nuss, Werkzeug, Verbrauchsmaterial – als FREITEXT, weil es oft Dinge sind, die es in keiner
-- Liste gibt. Das Büro bestellt und hakt ab. Entschieden: optional Kunde/Auftrag, Foto gleich dabei,
-- Stand (bestellt / da / nicht nötig) setzt nur, wer „Bestellliste verwalten“ darf (ab Werk: Admin).
--
--   1. Rechte `bestellungen` (lesen/schreiben: admin, techniker, user) und `bestellungen.verwalten` (admin).
--   2. `bestellwuensche`: Text, Menge (Freitext), dringend, für Transporter/Lager/allgemein, optional Kunde und
--      Auftrag, Foto; Stand offen → bestellt → da bzw. nicht nötig (mit Grund); Notiz/Lieferant vom Büro.
--      `bestellwunsch_plus`: „brauche ich auch“ statt eines zweiten Eintrags.
--   3. `bestellwunsch_pruefen()` (BEFORE, ohne security definer, mit current_user-Weiche): Wer eingetragen hat,
--      darf ändern und löschen, solange offen; den Stand nur, wer verwalten darf. Meldungen im Klartext.
--   4. Fotos im privaten Bucket `bestell-fotos` (3 MB, Ordner = eigene Kennung).
--   5. Push über die bestehende Route (`{"anlass":"bestellung"}`): dringend → an alle, die verwalten dürfen;
--      da / nicht nötig → an den, der eingetragen hat, und alle mit „+1“. Einmal je Anlass
--      (`push_buero_am`, `push_ersteller_am`); der Minutenlauf holt Verpasstes nach.
--
-- „Alle Daten löschen“ (Migration 72/86) leert beide Tabellen von selbst (Fachdaten).
-- Reihenfolge: nach 103, SQL zuerst, dann die Dateien von v173. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.firmenfahrzeuge') is null or to_regclass('public.orders') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.profiles / public.firmenfahrzeuge / public.orders. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage fehlt in diesem Projekt (storage.buckets). Es wurde nichts geändert. (Datenbank: %)', current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Rechte
-- ---------------------------------------------------------------------
insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
values ('bestellungen', array['admin', 'techniker', 'user'], array['admin', 'techniker', 'user'], '{}'::text[]),
       ('bestellungen.verwalten', array['admin'], array['admin'], '{}'::text[])
on conflict (module_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Tabellen
-- ---------------------------------------------------------------------
create table if not exists public.bestellwuensche (
  id                 uuid primary key default gen_random_uuid(),
  text               text not null,
  menge              text,
  dringend           boolean not null default false,
  fuer               text not null default 'allgemein',
  firmenfahrzeug_id  uuid references public.firmenfahrzeuge(id) on delete set null,
  kunde_id           uuid references public.customers(id) on delete set null,
  auftrag_id         uuid references public.orders(id) on delete set null,
  foto_pfad          text,
  foto_breite        integer,
  foto_hoehe         integer,
  status             text not null default 'offen',
  notiz              text,
  grund              text,
  erstellt_von       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  geaendert_am       timestamptz not null default now(),
  status_am          timestamptz,
  status_von         uuid references public.profiles(id) on delete set null,
  push_buero_am      timestamptz,
  push_ersteller_am  timestamptz,
  constraint bw_text      check (length(btrim(text)) between 1 and 500),
  constraint bw_menge     check (menge is null or length(menge) <= 60),
  constraint bw_fuer      check (fuer in ('transporter', 'lager', 'allgemein')),
  -- Ein Transporter nur bei „für Transporter“. Umgekehrt nicht erzwungen: Wird der Transporter gelöscht,
  -- bleibt der Wunsch mit leerem Fahrzeug stehen (on delete set null).
  constraint bw_transporter check (fuer = 'transporter' or firmenfahrzeug_id is null),
  constraint bw_status    check (status in ('offen', 'bestellt', 'da', 'nicht_noetig')),
  constraint bw_notiz     check (notiz is null or length(notiz) <= 300),
  constraint bw_grund     check (grund is null or length(grund) <= 300),
  constraint bw_grund_noetig check (status <> 'nicht_noetig' or length(btrim(coalesce(grund, ''))) >= 3),
  constraint bw_foto      check (foto_pfad is null or (coalesce(foto_breite, 0) > 0 and coalesce(foto_hoehe, 0) > 0))
);
comment on table public.bestellwuensche is
  'Bestellliste (Migration 104): was Techniker und Büro brauchen, als Freitext. Stand setzt nur bestellungen.verwalten.';
create index if not exists bestellwuensche_status on public.bestellwuensche (status, created_at desc);
create index if not exists bestellwuensche_erstellt_von on public.bestellwuensche (erstellt_von);

create table if not exists public.bestellwunsch_plus (
  wunsch_id   uuid not null references public.bestellwuensche(id) on delete cascade,
  profile_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (wunsch_id, profile_id)
);
comment on table public.bestellwunsch_plus is
  '„+1 – brauche ich auch“ zu einem Bestellwunsch (Migration 104) – statt eines zweiten Eintrags.';

-- ---------------------------------------------------------------------
-- 3. Prüfung (BEFORE): wer was darf – im Klartext
-- ---------------------------------------------------------------------
-- Ohne security definer: `current_user` ist direkt aus der App `authenticated`; der Push-Versand (Dienst-
-- schlüssel, `service_role`) und künftige Funktionen mit eigener Prüfung kommen durch (Vorbild Migration 78).
create or replace function public.bestellwunsch_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  verwalter boolean;
  ich uuid := (select auth.uid());
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  verwalter := public.darf('bestellungen.verwalten', 'schreiben');

  if tg_op = 'INSERT' then
    if new.status <> 'offen' or new.notiz is not null or new.grund is not null then
      raise exception 'Ein neuer Bestellwunsch beginnt als „offen“ – Lieferant und Stand trägt das Büro ein.';
    end if;
    new.erstellt_von := ich;
    new.created_at := now();
    new.geaendert_am := now();
    new.status_am := null;
    new.status_von := null;
    new.push_buero_am := null;
    new.push_ersteller_am := null;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if verwalter then return old; end if;
    if old.erstellt_von is distinct from ich or old.status <> 'offen' then
      raise exception 'Löschen kann nur, wer den Wunsch eingetragen hat – und nur, solange er offen ist.';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.erstellt_von is distinct from old.erstellt_von or new.created_at is distinct from old.created_at then
    raise exception 'Wer und wann eingetragen hat, lässt sich nicht ändern.';
  end if;
  -- Die Push-Stempel gehören dem Versand.
  new.push_buero_am := old.push_buero_am;
  new.push_ersteller_am := old.push_ersteller_am;

  if new.status is distinct from old.status or new.notiz is distinct from old.notiz or new.grund is distinct from old.grund then
    if not verwalter then
      raise exception 'Den Stand (bestellt, da, nicht nötig) und die Notiz zur Bestellung setzt nur das Büro.';
    end if;
  end if;
  if new.status is distinct from old.status then
    new.status_am := now();
    new.status_von := ich;
    -- „Da“ oder „nicht nötig“ meldet sich bei dem, der eingetragen hat – auch nach einem Hin und Her.
    if new.status in ('da', 'nicht_noetig') then new.push_ersteller_am := null; end if;
    if new.status <> 'nicht_noetig' then new.grund := null; end if;
  else
    new.status_am := old.status_am;
    new.status_von := old.status_von;
  end if;

  if (new.text, new.menge, new.dringend, new.fuer, new.firmenfahrzeug_id, new.kunde_id, new.auftrag_id, new.foto_pfad, new.foto_breite, new.foto_hoehe)
     is distinct from
     (old.text, old.menge, old.dringend, old.fuer, old.firmenfahrzeug_id, old.kunde_id, old.auftrag_id, old.foto_pfad, old.foto_breite, old.foto_hoehe) then
    if not verwalter and (old.erstellt_von is distinct from ich or old.status <> 'offen') then
      raise exception 'Ändern kann nur, wer den Wunsch eingetragen hat – und nur, solange er offen ist.';
    end if;
    new.geaendert_am := now();
  else
    new.geaendert_am := old.geaendert_am;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bestellwunsch_pruefen on public.bestellwuensche;
create trigger trg_bestellwunsch_pruefen
  before insert or update or delete on public.bestellwuensche
  for each row execute procedure public.bestellwunsch_pruefen();

-- ---------------------------------------------------------------------
-- 4. Zeilenrechte
-- ---------------------------------------------------------------------
alter table public.bestellwuensche enable row level security;
alter table public.bestellwunsch_plus enable row level security;

drop policy if exists "Bestellliste lesen" on public.bestellwuensche;
create policy "Bestellliste lesen" on public.bestellwuensche
  for select to authenticated using (public.darf('bestellungen', 'lesen'));
drop policy if exists "Bestellwunsch eintragen" on public.bestellwuensche;
create policy "Bestellwunsch eintragen" on public.bestellwuensche
  for insert to authenticated with check (public.darf('bestellungen', 'schreiben'));
-- Ändern: wer schreiben darf; was genau, entscheidet bestellwunsch_pruefen() (mit Begründung).
drop policy if exists "Bestellwunsch aendern" on public.bestellwuensche;
create policy "Bestellwunsch aendern" on public.bestellwuensche
  for update to authenticated using (public.darf('bestellungen', 'schreiben')) with check (public.darf('bestellungen', 'schreiben'));
-- Löschen: nur lesen prüfen (ein abgelehntes DELETE wäre sonst still), entscheiden tut der Trigger (CLAUDE.md §2).
drop policy if exists "Bestellwunsch loeschen" on public.bestellwuensche;
create policy "Bestellwunsch loeschen" on public.bestellwuensche
  for delete to authenticated using (public.darf('bestellungen', 'lesen'));

drop policy if exists "Plus lesen" on public.bestellwunsch_plus;
create policy "Plus lesen" on public.bestellwunsch_plus
  for select to authenticated using (public.darf('bestellungen', 'lesen'));
drop policy if exists "Eigenes Plus setzen" on public.bestellwunsch_plus;
create policy "Eigenes Plus setzen" on public.bestellwunsch_plus
  for insert to authenticated
  with check (public.darf('bestellungen', 'schreiben') and profile_id = (select auth.uid())
              and exists (select 1 from public.bestellwuensche w where w.id = wunsch_id and w.status in ('offen', 'bestellt')));
drop policy if exists "Eigenes Plus zuruecknehmen" on public.bestellwunsch_plus;
create policy "Eigenes Plus zuruecknehmen" on public.bestellwunsch_plus
  for delete to authenticated using (profile_id = (select auth.uid()));

revoke update on public.bestellwunsch_plus from anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Fotos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bestell-fotos', 'bestell-fotos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "MR Bestellfotos lesen" on storage.objects;
create policy "MR Bestellfotos lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'bestell-fotos' and public.darf('bestellungen', 'lesen'));
drop policy if exists "MR Bestellfotos hochladen" on storage.objects;
create policy "MR Bestellfotos hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bestell-fotos'
              and public.darf('bestellungen', 'schreiben')
              and (storage.foldername(objects.name))[1] = (select auth.uid())::text);
drop policy if exists "MR Bestellfotos loeschen" on storage.objects;
create policy "MR Bestellfotos loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bestell-fotos'
         and ((storage.foldername(objects.name))[1] = (select auth.uid())::text
              or public.darf('bestellungen.verwalten', 'schreiben')));

-- ---------------------------------------------------------------------
-- 6. Push anstoßen (wie der Chat, Migration 80)
-- ---------------------------------------------------------------------
create or replace function public.bestellwunsch_push_anstossen()
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
      body    := jsonb_build_object('anlass', 'bestellung'),
      timeout_milliseconds := 8000
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;
drop trigger if exists trg_bestellwunsch_push_neu on public.bestellwuensche;
create trigger trg_bestellwunsch_push_neu
  after insert on public.bestellwuensche
  for each row when (new.dringend)
  execute procedure public.bestellwunsch_push_anstossen();
drop trigger if exists trg_bestellwunsch_push_stand on public.bestellwuensche;
create trigger trg_bestellwunsch_push_stand
  after update of status, dringend on public.bestellwuensche
  for each row when ((new.status in ('da', 'nicht_noetig') and old.status is distinct from new.status)
                     or (new.dringend and not old.dringend and new.status = 'offen'))
  execute procedure public.bestellwunsch_push_anstossen();

-- ---------------------------------------------------------------------
-- 7. Ergebnis
-- ---------------------------------------------------------------------
select 'Rechte bestellungen / bestellungen.verwalten' as pruefung,
       (select count(*)::text from public.module_permissions where module_key in ('bestellungen', 'bestellungen.verwalten')) || ' von 2' as ergebnis
union all
select 'Tabellen bestellwuensche, bestellwunsch_plus',
       case when to_regclass('public.bestellwuensche') is not null and to_regclass('public.bestellwunsch_plus') is not null then 'da' else 'fehlt' end
union all
select 'Bucket bestell-fotos',
       coalesce((select case when b.public then 'ÖFFENTLICH – prüfen!' else 'ja, privat' end from storage.buckets b where b.id = 'bestell-fotos'), 'fehlt')
union all
select 'Richtlinien auf bestellwuensche',
       (select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'bestellwuensche');
