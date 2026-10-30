-- =====================================================================
-- Migration 108 – Finance, Stufe C (Teil 3): Kostenstellen (30.10.2026, v182).
--
-- docs/finance.md Abschnitt 14, Entscheidung 4 vom 30.10.2026: „beides“ – Kostenstelle je Transporter (DATEV KOST1),
-- Kostenträger je Leistungsart (KOST2: Montage, Einlagerung, Reifenverkauf).
--
--   1. `fin_kostenstellen`: Art (kost1/kost2), Nummer (DATEV-tauglich: Buchstaben und Ziffern, höchstens 8), Bezeichnung,
--      aktiv, bei KOST1 der Transporter (`firmenfahrzeuge`). Angelegt werden hier gleich die drei Leistungsarten
--      (100 Montage, 200 Einlagerung, 300 Reifenverkauf) und je aktivem Transporter eine KOST1 (T1, T2 …).
--      `fin_kostenstellen_uebernehmen()` holt später neue Transporter (und nach „Alle Daten löschen“ die Leistungsarten) nach. Pflege mit „Finance › Einstellungen“ schreiben.
--   2. KOST1/KOST2 an jeder Buchungszeile (`fin_buchungszeilen.kost1/kost2`, die Nummer als Schnappschuss wie bei DATEV),
--      an Stapelzeilen, Vorlagen und wiederkehrenden Buchungen. `fin_buchen()` nimmt je Posten `kost1`/`kost2` an und
--      setzt sie an die Erlös-, Aufwands- oder Anlagezeile des Postens (nicht an Geld-, Personen- oder Steuerzeilen).
--      Ein Storno übernimmt die Kostenstellen der stornierten Buchung (Trigger, für jede Art Gegenbuchung).
--   3. Neue Fassungen von `fin_stapel_zeile_speichern()`, `fin_stapel_buchen()`, `fin_vorlage_speichern()`,
--      `fin_wiederkehrend_speichern()` und `fin_wiederkehrend_holen()` mit Kostenstellen; die alten Fassungen ohne
--      Kostenstellen werden entfernt (die neuen nehmen sie als freiwillige Angabe, die App bis v181 läuft weiter).
--
-- Noch NICHT hier: Leistungsart automatisch aus dem Artikel einer FSM-Rechnung – das kommt mit Stufe D (alle Rechnungen).
-- Reihenfolge: nach 107, SQL zuerst, dann v182. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.fin_wiederkehrend_holen(uuid,date)') is null or to_regclass('public.firmenfahrzeuge') is null then
    raise exception 'Zuerst Migration 107 (Finance: Vorlagen und wiederkehrende Buchungen) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Kostenstellen
-- ---------------------------------------------------------------------
create table if not exists public.fin_kostenstellen (
  id                uuid primary key default gen_random_uuid(),
  art               text not null,
  nummer            text not null,
  bezeichnung       text not null,
  aktiv             boolean not null default true,
  firmenfahrzeug_id uuid references public.firmenfahrzeuge (id) on delete set null,
  erstellt_am       timestamptz not null default now(),
  geaendert_am      timestamptz,
  constraint fin_ks_art check (art in ('kost1', 'kost2')),
  constraint fin_ks_nummer check (nummer ~ '^[A-Za-z0-9]{1,8}$'),
  constraint fin_ks_bez check (length(btrim(bezeichnung)) between 1 and 60),
  constraint fin_ks_fahrzeug check (art = 'kost1' or firmenfahrzeug_id is null),
  unique (art, nummer)
);
create unique index if not exists fin_ks_fahrzeug_einmal on public.fin_kostenstellen (firmenfahrzeug_id) where firmenfahrzeug_id is not null;
alter table public.fin_kostenstellen enable row level security;
drop policy if exists "Finance-Kostenstellen lesen" on public.fin_kostenstellen;
create policy "Finance-Kostenstellen lesen" on public.fin_kostenstellen for select to authenticated using (public.darf('finance', 'lesen'));
revoke all on public.fin_kostenstellen from anon, authenticated;
grant select on public.fin_kostenstellen to authenticated;
comment on table public.fin_kostenstellen is
  'Migration 108: KOST1 (je Transporter) und KOST2 (je Leistungsart) für DATEV. Geschrieben über fin_kostenstelle_speichern()/fin_kostenstellen_uebernehmen(). docs/finance.md Abschnitt 14.';

-- Die drei Leistungsarten (Entscheidung 4) und je aktivem Transporter eine KOST1 – beim ersten Lauf.
insert into public.fin_kostenstellen (art, nummer, bezeichnung)
values ('kost2', '100', 'Montage'), ('kost2', '200', 'Einlagerung'), ('kost2', '300', 'Reifenverkauf')
on conflict (art, nummer) do nothing;

-- Neue Transporter nachholen: nächste freie Nummer T1, T2 … Gibt zurück, wie viele dazukamen.
create or replace function public.fin_kostenstellen_transporter()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
  n integer := 0;
  nr integer;
begin
  for f in select ff.id, ff.kennzeichen, ff.bezeichnung from public.firmenfahrzeuge ff
            where ff.aktiv and not exists (select 1 from public.fin_kostenstellen k where k.firmenfahrzeug_id = ff.id)
            order by ff.kennzeichen loop
    select coalesce(max(substring(k.nummer from 2)::integer), 0) + 1 into nr
      from public.fin_kostenstellen k where k.art = 'kost1' and k.nummer ~ '^T[0-9]{1,7}$';
    insert into public.fin_kostenstellen (art, nummer, bezeichnung, firmenfahrzeug_id)
    values ('kost1', 'T' || nr, left(f.kennzeichen || coalesce(' · ' || nullif(btrim(f.bezeichnung), ''), ''), 60), f.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
select public.fin_kostenstellen_transporter();

create or replace function public.fin_kostenstellen_uebernehmen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.darf('finance.einstellungen', 'schreiben') then
    raise exception 'Kostenstellen pflegen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Einstellungen“ schreiben).';
  end if;
  -- Nach „Alle Daten löschen“ sind auch die Leistungsarten fort – sie kommen hier wieder.
  insert into public.fin_kostenstellen (art, nummer, bezeichnung)
  values ('kost2', '100', 'Montage'), ('kost2', '200', 'Einlagerung'), ('kost2', '300', 'Reifenverkauf')
  on conflict (art, nummer) do nothing;
  get diagnostics n = row_count;
  return n + public.fin_kostenstellen_transporter();
end;
$$;

-- Neu (p_id null) oder ändern. Art und Nummer stehen fest, sobald auf die Kostenstelle gebucht ist (die Nummer steht
-- als Schnappschuss an den Buchungen und in DATEV).
create or replace function public.fin_kostenstelle_speichern(p_id uuid, p_art text, p_nummer text, p_bezeichnung text, p_aktiv boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alt public.fin_kostenstellen%rowtype;
  neu uuid;
begin
  if not public.darf('finance.einstellungen', 'schreiben') then
    raise exception 'Kostenstellen pflegen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Einstellungen“ schreiben).';
  end if;
  if p_art is null or p_art not in ('kost1', 'kost2') then raise exception 'KOST1 (Transporter) oder KOST2 (Leistungsart) wählen.'; end if;
  if p_nummer is null or btrim(p_nummer) !~ '^[A-Za-z0-9]{1,8}$' then raise exception 'Die Nummer: Buchstaben und Ziffern, höchstens 8 Zeichen.'; end if;
  if coalesce(btrim(p_bezeichnung), '') = '' or length(btrim(p_bezeichnung)) > 60 then raise exception 'Die Bezeichnung fehlt (höchstens 60 Zeichen).'; end if;
  if exists (select 1 from public.fin_kostenstellen k where k.art = p_art and k.nummer = btrim(p_nummer) and k.id is distinct from p_id) then
    raise exception 'Die Nummer % gibt es bei % schon.', btrim(p_nummer), upper(p_art);
  end if;
  if p_id is null then
    insert into public.fin_kostenstellen (art, nummer, bezeichnung, aktiv) values (p_art, btrim(p_nummer), btrim(p_bezeichnung), coalesce(p_aktiv, true))
    returning id into neu;
    return neu;
  end if;
  select * into alt from public.fin_kostenstellen where id = p_id for update;
  if alt.id is null then raise exception 'Diese Kostenstelle gibt es nicht (mehr).'; end if;
  if (alt.art <> p_art or alt.nummer <> btrim(p_nummer)) and exists (
       select 1 from public.fin_buchungszeilen z where (alt.art = 'kost1' and z.kost1 = alt.nummer) or (alt.art = 'kost2' and z.kost2 = alt.nummer)) then
    raise exception 'Auf % ist schon gebucht – Art und Nummer stehen fest. Die Bezeichnung lässt sich ändern.', alt.nummer;
  end if;
  update public.fin_kostenstellen
     set art = p_art, nummer = btrim(p_nummer), bezeichnung = btrim(p_bezeichnung), aktiv = coalesce(p_aktiv, true), geaendert_am = now()
   where id = p_id;
  return p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Spalten
-- ---------------------------------------------------------------------
alter table public.fin_buchungszeilen add column if not exists kost1 text;
alter table public.fin_buchungszeilen add column if not exists kost2 text;
alter table public.fin_stapel_zeilen add column if not exists kost1 text;
alter table public.fin_stapel_zeilen add column if not exists kost2 text;
alter table public.fin_vorlagen add column if not exists kost1 text;
alter table public.fin_vorlagen add column if not exists kost2 text;
alter table public.fin_wiederkehrend add column if not exists kost1 text;
alter table public.fin_wiederkehrend add column if not exists kost2 text;

-- Prüft eine angegebene Kostenstelle (leer ist erlaubt) und liefert die Nummer ohne Leerzeichen.
create or replace function public.fin_kost(p_art text, p_nummer text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n text := nullif(btrim(coalesce(p_nummer, '')), '');
begin
  if n is null then return null; end if;
  if not exists (select 1 from public.fin_kostenstellen k where k.art = p_art and k.nummer = n and k.aktiv) then
    raise exception '% „%“ gibt es nicht oder ist ausgeblendet (Finance › Buchungen › Kostenstellen).',
      case p_art when 'kost1' then 'Die Kostenstelle (Transporter)' else 'Der Kostenträger (Leistungsart)' end, n;
  end if;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Buchen mit Kostenstellen
-- ---------------------------------------------------------------------
-- Wie Migration 88, dazu je Posten kost1/kost2 an die Erlös-, Aufwands- oder Anlagezeile. Dieselbe Regel steht in
-- lib/finance/buchung.ts (`kostFehler`) für die Vorschau.
create or replace function public.fin_buchen(p_datum date, p_text text, p_beleg text, p_posten jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  neu uuid;
  n integer;
  p jsonb;
  i integer := 0;
  k1 text;
  k2 text;
  betroffen integer;
begin
  if not public.darf('finance.buchen', 'schreiben') then
    raise exception 'Buchen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Buchungen“ schreiben).';
  end if;
  if coalesce(btrim(p_text), '') = '' then raise exception 'Der Buchungstext fehlt.'; end if;
  e := public.fin_buchbar(p_datum);
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg)
  values (e.wirtschaftsjahr, n, p_datum, btrim(p_text), nullif(btrim(coalesce(p_beleg, '')), ''))
  returning id into neu;
  perform public.fin_posten_schreiben(neu, e.kontenrahmen, e.besteuerung, e.r13b_empfaenger, e.innergemeinschaftlich, p_posten);
  for p in select value from jsonb_array_elements(p_posten) loop
    i := i + 1;
    k1 := public.fin_kost('kost1', p ->> 'kost1');
    k2 := public.fin_kost('kost2', p ->> 'kost2');
    continue when k1 is null and k2 is null;
    update public.fin_buchungszeilen z set kost1 = k1, kost2 = k2
      from public.fin_konten k
     where z.buchung_id = neu and z.posten = i and not z.ist_steuer
       and k.kontenrahmen = e.kontenrahmen and k.nummer = z.konto and k.kategorie in ('erloes', 'aufwand', 'anlage');
    get diagnostics betroffen = row_count;
    if betroffen = 0 then
      raise exception 'Posten %: Eine Kostenstelle gehört an ein Erlös-, Aufwands- oder Anlagekonto – hier ist keins.', i;
    end if;
  end loop;
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;

-- Storno (jede Gegenbuchung, `fin_gegenbuchung()` aus Migration 89): dieselben Kostenstellen wie die stornierte Buchung.
-- Die Gegenbuchung schreibt ihre Zeilen in derselben Reihenfolge (order by id) – Zeile k gehört zu Zeile k.
create or replace function public.fin_storno_kost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fin_buchungszeilen s set kost1 = o.kost1, kost2 = o.kost2
    from (select z.kost1, z.kost2, row_number() over (order by z.id) rn from public.fin_buchungszeilen z where z.buchung_id = new.id) o,
         (select z.id, row_number() over (order by z.id) rn from public.fin_buchungszeilen z where z.buchung_id = new.storniert_durch) g
   where s.id = g.id and g.rn = o.rn and (o.kost1 is not null or o.kost2 is not null);
  return null;
end;
$$;
drop trigger if exists trg_fin_storno_kost on public.fin_buchungen;
create trigger trg_fin_storno_kost after update of storniert_durch on public.fin_buchungen
  for each row when (old.storniert_durch is null and new.storniert_durch is not null) execute function public.fin_storno_kost();

-- ---------------------------------------------------------------------
-- 4. Stapel, Vorlagen, wiederkehrende Buchungen mit Kostenstellen
-- ---------------------------------------------------------------------
create or replace function public.fin_stapel_zeile_speichern(p_id uuid, p_stapel uuid, p_datum date, p_beleg text, p_text text,
  p_soll integer, p_haben integer, p_betrag numeric, p_steuer text, p_kost1 text default null, p_kost2 text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
  neu uuid;
  k1 text;
  k2 text;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if p_datum is null then raise exception 'Das Datum fehlt.'; end if;
  if extract(year from p_datum)::integer <> st.jahr then
    raise exception 'Das Datum % liegt nicht im Wirtschaftsjahr % des Stapels.', to_char(p_datum, 'DD.MM.YYYY'), st.jahr;
  end if;
  if p_beleg is not null and length(btrim(p_beleg)) > 60 then raise exception 'Die Belegnummer ist zu lang (höchstens 60 Zeichen).'; end if;
  perform public.fin_felder_pruefen(p_text, p_soll, p_haben, p_betrag, 200);
  if p_betrag is null then raise exception 'Der Betrag muss größer als 0 sein (auf den Cent).'; end if;
  k1 := public.fin_kost('kost1', p_kost1);
  k2 := public.fin_kost('kost2', p_kost2);
  if p_id is null then
    insert into public.fin_stapel_zeilen (stapel_id, datum, beleg, text, soll, haben, betrag, steuer, kost1, kost2)
    values (p_stapel, p_datum, nullif(btrim(coalesce(p_beleg, '')), ''), btrim(p_text), p_soll, p_haben, p_betrag,
            nullif(btrim(coalesce(p_steuer, '')), ''), k1, k2)
    returning id into neu;
    return neu;
  end if;
  update public.fin_stapel_zeilen
     set datum = p_datum, beleg = nullif(btrim(coalesce(p_beleg, '')), ''), text = btrim(p_text), soll = p_soll, haben = p_haben,
         betrag = p_betrag, steuer = nullif(btrim(coalesce(p_steuer, '')), ''), kost1 = k1, kost2 = k2, geaendert_am = now()
   where id = p_id and stapel_id = p_stapel;
  if not found then raise exception 'Diese Zeile gibt es in dem Stapel nicht (mehr).'; end if;
  return p_id;
end;
$$;

create or replace function public.fin_stapel_buchen(p_stapel uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
  z record;
  r jsonb;
  i integer := 0;
  erste integer;
  letzte integer;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if not exists (select 1 from public.fin_stapel_zeilen where stapel_id = p_stapel) then
    raise exception 'Der Stapel „%“ ist leer.', st.bezeichnung;
  end if;
  for z in select * from public.fin_stapel_zeilen where stapel_id = p_stapel order by datum, lfd loop
    i := i + 1;
    begin
      r := public.fin_buchen(z.datum, z.text, z.beleg,
        jsonb_build_array(jsonb_build_object('soll', z.soll, 'haben', z.haben, 'betrag', z.betrag, 'steuer', z.steuer,
                                             'kost1', z.kost1, 'kost2', z.kost2)));
    exception when others then
      raise exception 'Zeile % (% · %): % – nichts gebucht, der Stapel bleibt offen.', i, to_char(z.datum, 'DD.MM.'), left(z.text, 40), sqlerrm;
    end;
    update public.fin_stapel_zeilen set buchung_id = (r ->> 'id')::uuid where id = z.id;
    erste := coalesce(erste, (r ->> 'nr')::integer);
    letzte := (r ->> 'nr')::integer;
  end loop;
  update public.fin_stapel set zustand = 'gebucht', gebucht_am = now(), gebucht_von = auth.uid() where id = p_stapel;
  return jsonb_build_object('anzahl', i, 'jahr', st.jahr, 'von', erste, 'bis', letzte);
end;
$$;

create or replace function public.fin_vorlage_speichern(p_id uuid, p_kurz text, p_text text, p_soll integer, p_haben integer,
  p_betrag numeric, p_steuer text, p_kost1 text default null, p_kost2 text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  neu uuid;
  k1 text := public.fin_kost('kost1', p_kost1);
  k2 text := public.fin_kost('kost2', p_kost2);
begin
  perform public.fin_stapel_recht();
  if coalesce(btrim(p_kurz), '') = '' or length(btrim(p_kurz)) > 40 then raise exception 'Der Kurzname fehlt (höchstens 40 Zeichen).'; end if;
  perform public.fin_felder_pruefen(p_text, p_soll, p_haben, p_betrag, 200);
  if exists (select 1 from public.fin_vorlagen v where lower(btrim(v.kurz)) = lower(btrim(p_kurz)) and v.id is distinct from p_id) then
    raise exception 'Eine Vorlage „%“ gibt es schon.', btrim(p_kurz);
  end if;
  if p_id is null then
    insert into public.fin_vorlagen (kurz, text, soll, haben, betrag, steuer, kost1, kost2)
    values (btrim(p_kurz), btrim(p_text), p_soll, p_haben, p_betrag, nullif(btrim(coalesce(p_steuer, '')), ''), k1, k2)
    returning id into neu;
    return neu;
  end if;
  update public.fin_vorlagen
     set kurz = btrim(p_kurz), text = btrim(p_text), soll = p_soll, haben = p_haben, betrag = p_betrag,
         steuer = nullif(btrim(coalesce(p_steuer, '')), ''), kost1 = k1, kost2 = k2, geaendert_am = now()
   where id = p_id;
  if not found then raise exception 'Diese Vorlage gibt es nicht (mehr).'; end if;
  return p_id;
end;
$$;

create or replace function public.fin_wiederkehrend_speichern(p_id uuid, p_text text, p_soll integer, p_haben integer, p_betrag numeric,
  p_steuer text, p_rhythmus text, p_ab date, p_bis date, p_aktiv boolean, p_kost1 text default null, p_kost2 text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alt public.fin_wiederkehrend%rowtype;
  neu uuid;
  k1 text := public.fin_kost('kost1', p_kost1);
  k2 text := public.fin_kost('kost2', p_kost2);
begin
  perform public.fin_stapel_recht();
  perform public.fin_felder_pruefen(p_text, p_soll, p_haben, p_betrag, 180);
  if p_betrag is null then raise exception 'Eine wiederkehrende Buchung braucht einen festen Betrag.'; end if;
  if p_rhythmus is null or p_rhythmus not in ('monat', 'quartal', 'halbjahr', 'jahr') then raise exception 'Unbekannter Rhythmus.'; end if;
  if p_ab is null then raise exception 'Der erste Termin fehlt.'; end if;
  if p_bis is not null and p_bis < p_ab then raise exception '„Bis“ liegt vor dem ersten Termin.'; end if;
  if p_id is null then
    insert into public.fin_wiederkehrend (text, soll, haben, betrag, steuer, rhythmus, ab, bis, aktiv, kost1, kost2)
    values (btrim(p_text), p_soll, p_haben, p_betrag, nullif(btrim(coalesce(p_steuer, '')), ''), p_rhythmus, p_ab, p_bis, coalesce(p_aktiv, true), k1, k2)
    returning id into neu;
    return neu;
  end if;
  select * into alt from public.fin_wiederkehrend where id = p_id for update;
  if alt.id is null then raise exception 'Diese wiederkehrende Buchung gibt es nicht (mehr).'; end if;
  if (alt.ab <> p_ab or alt.rhythmus <> p_rhythmus)
     and exists (select 1 from public.fin_stapel_zeilen z where z.wiederkehrend_id = p_id) then
    raise exception 'Erster Termin und Rhythmus stehen fest, seit Termine geholt wurden – für einen neuen Rhythmus diese beenden („bis“) und eine neue anlegen.';
  end if;
  update public.fin_wiederkehrend
     set text = btrim(p_text), soll = p_soll, haben = p_haben, betrag = p_betrag, steuer = nullif(btrim(coalesce(p_steuer, '')), ''),
         rhythmus = p_rhythmus, ab = p_ab, bis = p_bis, aktiv = coalesce(p_aktiv, true), kost1 = k1, kost2 = k2, geaendert_am = now()
   where id = p_id;
  return p_id;
end;
$$;

create or replace function public.fin_wiederkehrend_holen(p_stapel uuid, p_bis date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.fin_stapel%rowtype;
  w public.fin_wiederkehrend%rowtype;
  schritt integer;
  k integer;
  d date;
  von date;
  ende date;
  n integer := 0;
begin
  perform public.fin_stapel_recht();
  st := public.fin_stapel_offen(p_stapel);
  if p_bis is null then raise exception 'Der Stichtag fehlt.'; end if;
  von := make_date(st.jahr, 1, 1);
  for w in select * from public.fin_wiederkehrend where aktiv order by ab, id loop
    schritt := case w.rhythmus when 'monat' then 1 when 'quartal' then 3 when 'halbjahr' then 6 else 12 end;
    ende := least(p_bis, make_date(st.jahr, 12, 31), coalesce(w.bis, p_bis));
    k := 0;
    loop
      d := (w.ab + make_interval(months => k * schritt))::date;
      exit when d > ende or k > 1200;
      if d >= von and not exists (select 1 from public.fin_stapel_zeilen z where z.wiederkehrend_id = w.id and z.termin = d) then
        insert into public.fin_stapel_zeilen (stapel_id, datum, beleg, text, soll, haben, betrag, steuer, kost1, kost2, wiederkehrend_id, termin)
        values (p_stapel, d, null, left(w.text || ' ' || to_char(d, 'MM/YYYY'), 200), w.soll, w.haben, w.betrag, w.steuer, w.kost1, w.kost2, w.id, d);
        n := n + 1;
      end if;
      k := k + 1;
    end loop;
  end loop;
  return jsonb_build_object('anzahl', n);
end;
$$;

-- Die alten Fassungen ohne Kostenstellen erst JETZT entfernen, wo die neuen stehen (der SQL-Editor ist nicht atomar:
-- erst entfernen, dann anlegen, ließe bei einem Abbruch gar keine Fassung übrig).
drop function if exists public.fin_stapel_zeile_speichern(uuid, uuid, date, text, text, integer, integer, numeric, text);
drop function if exists public.fin_vorlage_speichern(uuid, text, text, integer, integer, numeric, text);
drop function if exists public.fin_wiederkehrend_speichern(uuid, text, integer, integer, numeric, text, text, date, date, boolean);

revoke all on function public.fin_kostenstellen_transporter() from public, anon, authenticated;
revoke all on function public.fin_kost(text, text) from public, anon, authenticated;
revoke all on function public.fin_storno_kost() from public, anon, authenticated;
revoke all on function public.fin_kostenstellen_uebernehmen() from public, anon;
revoke all on function public.fin_kostenstelle_speichern(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.fin_stapel_zeile_speichern(uuid, uuid, date, text, text, integer, integer, numeric, text, text, text) from public, anon;
revoke all on function public.fin_vorlage_speichern(uuid, text, text, integer, integer, numeric, text, text, text) from public, anon;
revoke all on function public.fin_wiederkehrend_speichern(uuid, text, integer, integer, numeric, text, text, date, date, boolean, text, text) from public, anon;
grant execute on function public.fin_kostenstellen_uebernehmen() to authenticated;
grant execute on function public.fin_kostenstelle_speichern(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.fin_stapel_zeile_speichern(uuid, uuid, date, text, text, integer, integer, numeric, text, text, text) to authenticated;
grant execute on function public.fin_vorlage_speichern(uuid, text, text, integer, integer, numeric, text, text, text) to authenticated;
grant execute on function public.fin_wiederkehrend_speichern(uuid, text, integer, integer, numeric, text, text, date, date, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Ergebnis
-- ---------------------------------------------------------------------
select 'Tabelle fin_kostenstellen (RLS)' as pruefung,
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_kostenstellen')), 'fehlt') as ergebnis
union all
select 'Leistungsarten (KOST2)', (select string_agg(nummer || ' ' || bezeichnung, ', ' order by nummer) from public.fin_kostenstellen where art = 'kost2')
union all
select 'Transporter (KOST1)', (select count(*)::text from public.fin_kostenstellen where art = 'kost1') || ' angelegt'
union all
select 'Spalten kost1/kost2 (Buchungszeilen, Stapel, Vorlagen, wiederkehrend)',
       (select count(*)::text from information_schema.columns where table_schema = 'public' and column_name in ('kost1', 'kost2')
         and table_name in ('fin_buchungszeilen', 'fin_stapel_zeilen', 'fin_vorlagen', 'fin_wiederkehrend')) || ' von 8'
union all
select 'Storno übernimmt Kostenstellen', case when exists (select 1 from pg_trigger where tgname = 'trg_fin_storno_kost') then 'ja' else 'nein' end
union all
select 'Alte Fassungen ohne Kostenstellen entfernt',
       case when to_regprocedure('public.fin_stapel_zeile_speichern(uuid,uuid,date,text,text,integer,integer,numeric,text)') is null
             and to_regprocedure('public.fin_vorlage_speichern(uuid,text,text,integer,integer,numeric,text)') is null
             and to_regprocedure('public.fin_wiederkehrend_speichern(uuid,text,integer,integer,numeric,text,text,date,date,boolean)') is null
            then 'ja' else 'nein' end;
