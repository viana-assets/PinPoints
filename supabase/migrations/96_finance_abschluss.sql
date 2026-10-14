-- =====================================================================
-- Migration 96 – Finance, Phase F8: Jahresabschluss (14.10.2026, v154).
--
-- docs/finance.md Abschnitt 4.7, schlank:
--
--   1. ABSCHLUSSBUCHUNGEN `fin_abschlussposten` (nur bei Bilanzierung): Rückstellung (Aufwand an Rückstellung),
--      aktive Rechnungsabgrenzung (Abgrenzung an Aufwand), passive Rechnungsabgrenzung (Erlös an Abgrenzung) –
--      gebucht am 31.12., Quelle `abschluss`. Abgrenzungen werden am 01.01. des Folgejahres aufgelöst
--      (`fin_abschlussposten_aufloesen()`); eine Rückstellung wird mit der Zahlung verbraucht (Bank an Rückstellung).
--   2. SALDENVORTRAG `fin_vortrag_buchen(jahr)`: Bestandskonten ins Folgejahr – am 01.01. gegen 9000, Quelle `vortrag`.
--      Umsatzsteuer- und Vorsteuerkonten zusammen auf „Umsatzsteuer Vorjahr“ (1790/3840); Gewinn, Privatkonten und
--      ein Rest auf 9000 gehen ins Kapital (Einzelunternehmen, GbR: 0880/2010; UG/GmbH: Gewinnvortrag 0860/2970).
--      Erneut vortragen storniert den alten Vortrag; `fin_vortrag_vorschau()` zeigt vorher, was gebucht würde.
--   3. Neue Konten: Rückstellungen 0970/3070, Rechnungsabgrenzung aktiv 0980/1900 und passiv 0990/3900,
--      Gewinnvortrag 0860/2970.
--   4. `fin_euer()` lässt Saldenvorträge aus (Buchungen mit Konto 9000 sind keine Zahlung), `fin_kassensturz()` zählt
--      nach einem Vortrag nur das laufende Jahr, `fin_stornieren()` verweist Abschluss und Vortrag auf ihre Seite.
--
-- Bilanz und GuV rechnet die App aus `fin_auswertung_salden()` (lib/finance/abschluss.ts). Rechte: „Finance ›
-- Auswertungen und Abschluss“. PILOT wie alles in Finance. Reihenfolge: nach 95, SQL zuerst, dann v154.
-- Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_anlagen') is null then
    raise exception 'Zuerst Migration 95 (Finance: Anlagen und Abschreibungen) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
alter table public.fin_buchungen add constraint fin_buchung_quelle
  check (quelle in ('manuell', 'rechnung', 'zahlung', 'beleg', 'bank', 'kasse', 'afa', 'abgang', 'abschluss', 'vortrag'));

insert into public.fin_konten (kontenrahmen, nummer, bezeichnung, kategorie) values
  ('skr03', 860, 'Gewinnvortrag vor Verwendung', 'kapital'),
  ('skr04', 2970, 'Gewinnvortrag vor Verwendung', 'kapital'),
  ('skr03', 970, 'Sonstige Rückstellungen', 'verbindlichkeit'),
  ('skr04', 3070, 'Sonstige Rückstellungen', 'verbindlichkeit'),
  ('skr03', 980, 'Aktive Rechnungsabgrenzung', 'forderung'),
  ('skr04', 1900, 'Aktive Rechnungsabgrenzung', 'forderung'),
  ('skr03', 990, 'Passive Rechnungsabgrenzung', 'verbindlichkeit'),
  ('skr04', 3900, 'Passive Rechnungsabgrenzung', 'verbindlichkeit')
on conflict (kontenrahmen, nummer) do nothing;

-- Feste Konten je Kontenrahmen (wie FIN_ABSCHLUSS_KONTEN in lib/finance/abschluss.ts).
create or replace function public.fin_abschluss_konto(p_rahmen text, p_was text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_was
    when 'rueckstellung' then case p_rahmen when 'skr03' then 970 else 3070 end
    when 'rap_aktiv'     then case p_rahmen when 'skr03' then 980 else 1900 end
    when 'rap_passiv'    then case p_rahmen when 'skr03' then 990 else 3900 end
    when 'gewinnvortrag' then case p_rahmen when 'skr03' then 860 else 2970 end
    when 'kapital'       then case p_rahmen when 'skr03' then 880 else 2010 end
    when 'ust_vorjahr'   then case p_rahmen when 'skr03' then 1790 else 3840 end
    when 'vortrag'       then 9000
  end
$$;

-- ---------------------------------------------------------------------
-- 1. Abschlussbuchungen
-- ---------------------------------------------------------------------
create table if not exists public.fin_abschlussposten (
  id                    uuid primary key default gen_random_uuid(),
  jahr                  integer not null,
  art                   text not null,
  konto                 integer not null,
  betrag                numeric(14,2) not null,
  text                  text not null,
  buchung_id            uuid not null references public.fin_buchungen (id),
  aufloesung_buchung_id uuid references public.fin_buchungen (id),
  erstellt_am           timestamptz not null default now(),
  erstellt_von          uuid default auth.uid(),
  constraint fin_ap_art check (art in ('rueckstellung', 'rap_aktiv', 'rap_passiv')),
  constraint fin_ap_betrag check (betrag > 0),
  constraint fin_ap_text check (length(btrim(text)) between 1 and 120)
);
create index if not exists fin_abschlussposten_jahr on public.fin_abschlussposten (jahr);
alter table public.fin_abschlussposten enable row level security;
drop policy if exists "Finance-Abschluss lesen" on public.fin_abschlussposten;
create policy "Finance-Abschluss lesen" on public.fin_abschlussposten for select to authenticated using (public.darf('finance.abschluss', 'lesen'));
revoke all on public.fin_abschlussposten from anon, authenticated;
grant select on public.fin_abschlussposten to authenticated;
comment on table public.fin_abschlussposten is
  'Migration 96: Rückstellungen und Rechnungsabgrenzungen zum 31.12. (nur Bilanzierung). Geschrieben nur über fin_abschlussposten_*(). docs/finance.md „So ist F8 gebaut“.';

create or replace function public.fin_abschlussposten_buchen(p_jahr integer, p_art text, p_konto integer, p_betrag numeric, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  d date;
  kat text; gegen integer;
  neu uuid; n integer; pid uuid;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Abschlussbuchungen sind für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  if p_art is null or p_art not in ('rueckstellung', 'rap_aktiv', 'rap_passiv') then raise exception 'Unbekannte Art der Abschlussbuchung.'; end if;
  if p_betrag is null or p_betrag <= 0 or p_betrag <> round(p_betrag, 2) then raise exception 'Den Betrag in Euro und Cent angeben (größer 0).'; end if;
  if coalesce(btrim(p_text), '') = '' or length(btrim(p_text)) > 120 then raise exception 'Bitte einen Text angeben (höchstens 120 Zeichen) – wofür?'; end if;
  if p_jahr is null or make_date(p_jahr, 12, 1) > (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Abschlussbuchungen für % frühestens ab dem 01.12.%.', p_jahr, p_jahr;
  end if;
  d := make_date(p_jahr, 12, 31);
  e := public.fin_buchbar(d);
  if e.gewinnermittlung <> 'bilanz' then
    raise exception 'Rückstellungen und Rechnungsabgrenzungen gibt es nur bei Bilanzierung – % ist eine Einnahmen-Überschuss-Rechnung.', p_jahr;
  end if;
  select k.kategorie into kat from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = p_konto and k.aktiv;
  if p_art in ('rueckstellung', 'rap_aktiv') and kat is distinct from 'aufwand' then
    raise exception 'Für diese Abschlussbuchung ein Aufwandskonto wählen.';
  end if;
  if p_art = 'rap_passiv' and kat is distinct from 'erloes' then
    raise exception 'Für die passive Abgrenzung ein Erlöskonto wählen.';
  end if;
  gegen := public.fin_abschluss_konto(e.kontenrahmen, p_art);
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = gegen and k.aktiv) then
    raise exception 'Das Konto % ist ausgeblendet.', gegen;
  end if;
  pid := gen_random_uuid();
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, d, left(case p_art when 'rueckstellung' then 'Rückstellung: ' when 'rap_aktiv' then 'Aktive Abgrenzung: ' else 'Passive Abgrenzung: ' end || btrim(p_text), 200),
          null, 'abschluss', pid)
  returning id into neu;
  -- Rückstellung: Aufwand an Rückstellung · aktive Abgrenzung: Abgrenzung an Aufwand · passive: Erlös an Abgrenzung
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', case p_art when 'rap_aktiv' then gegen else p_konto end, p_betrag),
    (neu, 1, 'H', case p_art when 'rap_aktiv' then p_konto else gegen end, p_betrag);
  insert into public.fin_abschlussposten (id, jahr, art, konto, betrag, text, buchung_id) values (pid, p_jahr, p_art, p_konto, p_betrag, btrim(p_text), neu);
  return jsonb_build_object('id', pid, 'nr', n);
end;
$$;

-- Abgrenzung am 01.01. des Folgejahres auflösen (umgekehrt buchen).
create or replace function public.fin_abschlussposten_aufloesen(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.fin_abschlussposten%rowtype;
  e public.fin_einstellungen%rowtype;
  d date; gegen integer; neu uuid; n integer;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Abschlussbuchungen sind für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  select * into x from public.fin_abschlussposten where id = p_id for update;
  if x.id is null then raise exception 'Diese Abschlussbuchung gibt es nicht.'; end if;
  if x.art = 'rueckstellung' then
    raise exception 'Eine Rückstellung wird mit der Zahlung verbraucht (Bank an Rückstellung); was übrig bleibt, von Hand gegen sonstige Erträge auflösen.';
  end if;
  if x.aufloesung_buchung_id is not null then raise exception 'Diese Abgrenzung ist schon aufgelöst.'; end if;
  d := make_date(x.jahr + 1, 1, 1);
  if d > (now() at time zone 'Europe/Berlin')::date then raise exception 'Aufgelöst wird am 01.01.% – nicht vorher.', x.jahr + 1; end if;
  e := public.fin_buchbar(d);
  gegen := public.fin_abschluss_konto(e.kontenrahmen, x.art);
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, d, left('Auflösung ' || case x.art when 'rap_aktiv' then 'aktive' else 'passive' end || ' Abgrenzung: ' || x.text, 200), null, 'abschluss', x.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', case x.art when 'rap_aktiv' then x.konto else gegen end, x.betrag),
    (neu, 1, 'H', case x.art when 'rap_aktiv' then gegen else x.konto end, x.betrag);
  update public.fin_abschlussposten set aufloesung_buchung_id = neu where id = p_id;
  return jsonb_build_object('nr', n);
end;
$$;

-- Zurücknehmen: Auflösung und Buchung stornieren, Posten entfernen (die Buchungen bleiben im Journal).
create or replace function public.fin_abschlussposten_zuruecknehmen(p_id uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.fin_abschlussposten%rowtype;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Abschlussbuchungen sind für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  select * into x from public.fin_abschlussposten where id = p_id for update;
  if x.id is null then raise exception 'Diese Abschlussbuchung gibt es nicht.'; end if;
  if x.aufloesung_buchung_id is not null then perform public.fin_gegenbuchung(x.aufloesung_buchung_id, p_grund, null, null); end if;
  perform public.fin_gegenbuchung(x.buchung_id, p_grund, null, null);
  delete from public.fin_abschlussposten where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Saldenvortrag ins Folgejahr
-- ---------------------------------------------------------------------
-- Was vorgetragen würde: [{konto, betrag}] mit betrag = Soll − Haben am 31.12., Summe 0. Ohne Rechteprüfung.
create or replace function public.fin_vortrag_zeilen(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  ziel integer; ust integer;
  kapg boolean;
  privat numeric;
  zeilen jsonb;
  rest numeric;
begin
  select * into e from public.fin_einstellungen where wirtschaftsjahr = p_jahr;
  if e.wirtschaftsjahr is null then raise exception 'Für % sind die Finance-Einstellungen nicht gespeichert.', p_jahr; end if;
  kapg := e.rechtsform in ('ug', 'gmbh');
  ziel := public.fin_abschluss_konto(e.kontenrahmen, case when kapg then 'gewinnvortrag' else 'kapital' end);
  ust := public.fin_abschluss_konto(e.kontenrahmen, 'ust_vorjahr');
  with s as (
    select z.konto, k.kategorie, sum(case z.seite when 'S' then z.betrag else -z.betrag end) as saldo
      from public.fin_buchungszeilen z
      join public.fin_buchungen b on b.id = z.buchung_id
      left join public.fin_konten k on k.kontenrahmen = e.kontenrahmen and k.nummer = z.konto
     where b.jahr = p_jahr
     group by z.konto, k.kategorie
  )
  select coalesce(sum(saldo) filter (where kategorie = 'privat'), 0) into privat from s;
  if kapg and privat <> 0 then
    raise exception 'Bei einer UG/GmbH gibt es keine Privatkonten – dort stehen % €. Zuerst mit dem Steuerberater klären und umbuchen.', privat;
  end if;
  with s as (
    select z.konto, k.kategorie, sum(case z.seite when 'S' then z.betrag else -z.betrag end) as saldo
      from public.fin_buchungszeilen z
      join public.fin_buchungen b on b.id = z.buchung_id
      left join public.fin_konten k on k.kontenrahmen = e.kontenrahmen and k.nummer = z.konto
     where b.jahr = p_jahr
     group by z.konto, k.kategorie
  ), vor as (
    select konto, saldo from s where kategorie in ('anlage', 'geld', 'forderung', 'verbindlichkeit') or (kategorie = 'kapital' and konto <> ziel)
    union all
    select ust, sum(saldo) from s where kategorie = 'steuer' having count(*) > 0
  ), summe as (
    select konto, round(sum(saldo), 2) as betrag from vor group by konto
  )
  select coalesce(jsonb_agg(jsonb_build_object('konto', konto, 'betrag', betrag) order by konto), '[]'::jsonb), coalesce(sum(betrag), 0)
    into zeilen, rest from summe where betrag <> 0;
  if rest <> 0 then
    zeilen := zeilen || jsonb_build_array(jsonb_build_object('konto', ziel, 'betrag', -rest));
  end if;
  return zeilen;
end;
$$;
revoke all on function public.fin_vortrag_zeilen(integer) from public, anon, authenticated;

-- Der gebuchte Vortrag aus p_jahr (im Folgejahr), nicht storniert.
create or replace function public.fin_vortrag_buchung(p_jahr integer)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from public.fin_buchungen b
   where b.jahr = p_jahr + 1 and b.quelle = 'vortrag' and b.storno_von is null and b.storniert_durch is null
   order by b.nr desc limit 1
$$;
revoke all on function public.fin_vortrag_buchung(integer) from public, anon, authenticated;

create or replace function public.fin_vortrag_vorschau(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  f public.fin_einstellungen%rowtype;
  v uuid;
begin
  if not public.darf('finance.abschluss', 'lesen') then
    raise exception 'Der Jahresabschluss ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“).';
  end if;
  select * into e from public.fin_einstellungen where wirtschaftsjahr = p_jahr;
  if e.wirtschaftsjahr is null then return jsonb_build_object('eingerichtet', false); end if;
  select * into f from public.fin_einstellungen where wirtschaftsjahr = p_jahr + 1;
  v := public.fin_vortrag_buchung(p_jahr);
  return jsonb_build_object(
    'eingerichtet', true,
    'folgejahr', f.wirtschaftsjahr is not null,
    'folgejahr_rahmen', f.kontenrahmen,
    'zeilen', public.fin_vortrag_zeilen(p_jahr),
    'gebucht', case when v is null then null else (
      select jsonb_build_object('nr', b.nr, 'datum', b.datum, 'zeilen', coalesce((
        select jsonb_agg(jsonb_build_object('konto', x.konto, 'betrag', x.betrag) order by x.konto)
          from (select z.konto, sum(case z.seite when 'S' then z.betrag else -z.betrag end) as betrag
                  from public.fin_buchungszeilen z where z.buchung_id = b.id and z.konto <> 9000 group by z.konto) x), '[]'::jsonb))
        from public.fin_buchungen b where b.id = v) end,
    -- Anfangsbestände von Hand im Folgejahr (9000 außerhalb des Vortrags)
    'von_hand', (select count(distinct b.id) from public.fin_buchungen b join public.fin_buchungszeilen z on z.buchung_id = b.id
                  where b.jahr = p_jahr + 1 and z.konto = 9000 and b.quelle <> 'vortrag' and b.storno_von is null and b.storniert_durch is null));
end;
$$;

create or replace function public.fin_vortrag_buchen(p_jahr integer, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  f public.fin_einstellungen%rowtype;
  alt uuid; zeilen jsonb; x jsonb;
  neu uuid; n integer; i integer := 0; betrag numeric;
  heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Den Saldenvortrag buchen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  if p_jahr is null or make_date(p_jahr + 1, 1, 1) > heute then raise exception 'Vorgetragen wird, wenn das Jahr % vorbei ist.', p_jahr; end if;
  select * into e from public.fin_einstellungen where wirtschaftsjahr = p_jahr;
  if e.wirtschaftsjahr is null then raise exception 'Für % sind die Finance-Einstellungen nicht gespeichert.', p_jahr; end if;
  select * into f from public.fin_einstellungen where wirtschaftsjahr = p_jahr + 1;
  if f.wirtschaftsjahr is null then raise exception 'Zuerst die Finance-Einstellungen für % speichern.', p_jahr + 1; end if;
  if f.kontenrahmen <> e.kontenrahmen then raise exception 'Der Kontenrahmen wechselt von % zu % – das kann der Vortrag nicht umschlüsseln.', e.kontenrahmen, f.kontenrahmen; end if;
  if exists (select 1 from public.fin_buchungen b join public.fin_buchungszeilen z on z.buchung_id = b.id
              where b.jahr = p_jahr + 1 and z.konto = 9000 and b.quelle <> 'vortrag' and b.storno_von is null and b.storniert_durch is null) then
    raise exception 'In % gibt es schon Anfangsbestände von Hand (Konto 9000) – erst stornieren, sonst stünde alles doppelt da.', p_jahr + 1;
  end if;
  alt := public.fin_vortrag_buchung(p_jahr);
  if alt is not null then
    if coalesce(btrim(p_grund), '') = '' then raise exception 'Der Vortrag ist schon gebucht – zum Erneuern einen Grund angeben.'; end if;
    perform public.fin_gegenbuchung(alt, p_grund, null, null);
  end if;
  zeilen := public.fin_vortrag_zeilen(p_jahr);
  if jsonb_array_length(zeilen) = 0 then return jsonb_build_object('nr', null, 'konten', 0); end if;
  e := public.fin_buchbar(make_date(p_jahr + 1, 1, 1));
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle)
  values (e.wirtschaftsjahr, n, make_date(p_jahr + 1, 1, 1), 'Saldenvorträge aus ' || p_jahr, null, 'vortrag')
  returning id into neu;
  for x in select * from jsonb_array_elements(zeilen) loop
    i := i + 1;
    betrag := (x ->> 'betrag')::numeric;
    insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
      (neu, i, case when betrag > 0 then 'S' else 'H' end, (x ->> 'konto')::integer, abs(betrag)),
      (neu, i, case when betrag > 0 then 'H' else 'S' end, 9000, abs(betrag));
  end loop;
  return jsonb_build_object('nr', n, 'konten', i);
end;
$$;

create or replace function public.fin_vortrag_zuruecknehmen(p_jahr integer, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  alt uuid;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Den Saldenvortrag zurücknehmen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  alt := public.fin_vortrag_buchung(p_jahr);
  if alt is null then raise exception 'Für % ist kein Vortrag gebucht.', p_jahr; end if;
  perform public.fin_gegenbuchung(alt, p_grund, null, null);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Bestehende Funktionen angepasst (Rücknahme stellt 93/94/95 wieder her)
-- ---------------------------------------------------------------------
-- EÜR wie Migration 94, ohne Saldenvorträge.
create or replace function public.fin_euer(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
begin
  if not public.fin_auswertung_darf() then
    raise exception 'Auswertungen sind für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen“).';
  end if;
  select * into e from public.fin_einstellungen where wirtschaftsjahr = p_jahr;
  if e.wirtschaftsjahr is null then return jsonb_build_object('eingerichtet', false); end if;
  return (
    with zeilen as (
      select z.buchung_id, z.konto, case z.seite when 'S' then z.betrag else -z.betrag end as signiert, k.kategorie, b.quelle, b.quelle_id
        from public.fin_buchungszeilen z
        join public.fin_buchungen b on b.id = z.buchung_id
        left join public.fin_konten k on k.kontenrahmen = e.kontenrahmen and k.nummer = z.konto
       where b.jahr = p_jahr
         -- Seit Migration 96: Saldenvorträge (Buchungen mit Konto 9000) sind keine Zahlung.
         and not exists (select 1 from public.fin_buchungszeilen v join public.fin_konten kv on kv.kontenrahmen = e.kontenrahmen and kv.nummer = v.konto
                          where v.buchung_id = b.id and kv.kategorie = 'vortrag')
    ), mit_geld as (
      select distinct buchung_id from zeilen where kategorie = 'geld'
    ), ohne_geld_afa as (
      -- Abschreibung: keine Geldzeile, aber Aufwand gegen Anlage.
      select buchung_id from zeilen group by buchung_id
      having bool_or(kategorie = 'anlage') and bool_or(kategorie = 'aufwand') and not bool_or(kategorie = 'geld')
    ), direkt as (
      -- Gegenzeilen einer Geldbuchung: Wirkung = −signiert (Haben auf Erlös = Zufluss).
      select z.buchung_id, z.konto, z.kategorie, -z.signiert as wirkung, z.quelle, z.quelle_id
        from zeilen z join mit_geld g on g.buchung_id = z.buchung_id
       where z.kategorie is distinct from 'geld'
      union all
      select z.buchung_id, z.konto, z.kategorie, -z.signiert, z.quelle, z.quelle_id
        from zeilen z join ohne_geld_afa a on a.buchung_id = z.buchung_id
       where z.kategorie = 'aufwand'
    ), quelle as (
      -- Zu welcher Buchung gehört eine Forderung/Verbindlichkeit aus einer Zahlung?
      select d.*, coalesce((select r.buchung_id from public.fin_rechnungen r where r.rechnung_id = d.quelle_id),
                           (select bl.buchung_id from public.fin_belege bl where bl.id = d.quelle_id)) as ursprung
        from direkt d
    ), aufgeteilt as (
      select q.konto, q.kategorie, q.wirkung, false as unklar from quelle q
       where q.kategorie is null or q.kategorie not in ('forderung', 'verbindlichkeit')
      union all
      -- Anteilig auf die übrigen Zeilen der Ursprungsbuchung: Wirkung × Zeile / Summe der übrigen Zeilen.
      select o.konto, k.kategorie, q.wirkung * o.signiert / nullif(s.summe, 0), false
        from quelle q
        join lateral (select sum(case x.seite when 'S' then x.betrag else -x.betrag end) as summe
                        from public.fin_buchungszeilen x join public.fin_konten kk on kk.kontenrahmen = e.kontenrahmen and kk.nummer = x.konto
                       where x.buchung_id = q.ursprung and kk.kategorie not in ('forderung', 'verbindlichkeit')) s on true
        join lateral (select x.konto, case x.seite when 'S' then x.betrag else -x.betrag end as signiert
                        from public.fin_buchungszeilen x join public.fin_konten kk on kk.kontenrahmen = e.kontenrahmen and kk.nummer = x.konto
                       where x.buchung_id = q.ursprung and kk.kategorie not in ('forderung', 'verbindlichkeit')) o on true
        left join public.fin_konten k on k.kontenrahmen = e.kontenrahmen and k.nummer = o.konto
       where q.kategorie in ('forderung', 'verbindlichkeit') and q.ursprung is not null and s.summe <> 0
      union all
      select q.konto, q.kategorie, q.wirkung, true from quelle q
       where q.kategorie in ('forderung', 'verbindlichkeit') and q.ursprung is null
    )
    select jsonb_build_object(
      'eingerichtet', true,
      'konten', coalesce((select jsonb_agg(jsonb_build_object('konto', konto, 'wirkung', w) order by konto)
                            from (select konto, round(sum(wirkung), 2) as w from aufgeteilt where not unklar
                                   group by konto having round(sum(wirkung), 2) <> 0) x), '[]'::jsonb),
      'unklar', coalesce((select round(sum(wirkung), 2) from aufgeteilt where unklar), 0))
  );
end;
$$;

-- Kassensturz wie Migration 93; nach einem Vortrag nur das laufende Jahr.
create or replace function public.fin_kassensturz(p_datum date, p_gezaehlt numeric, p_notiz text, p_ausgleichen boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  kasse integer; gegen integer;
  bestand numeric; diff numeric;
  neu uuid; n integer;
  heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not public.darf('finance.bank', 'schreiben') then
    raise exception 'Den Kassensturz festhalten ist für deine Rolle nicht freigeschaltet (Recht „Finance › Bank“ schreiben).';
  end if;
  if p_datum is null or p_datum > heute then raise exception 'Der Kassensturz braucht ein Datum, nicht in der Zukunft.'; end if;
  if p_gezaehlt is null or p_gezaehlt < 0 then raise exception 'Den gezählten Bestand eintragen (0 € oder mehr).'; end if;
  select * into e from public.fin_einstellungen where wirtschaftsjahr = extract(year from p_datum)::integer;
  if e.wirtschaftsjahr is null then raise exception 'Für % sind die Finance-Einstellungen noch nicht gespeichert.', extract(year from p_datum)::integer; end if;
  kasse := public.fin_rechnung_konto(e.kontenrahmen, 'kasse');
  select coalesce(sum(case z.seite when 'S' then z.betrag else -z.betrag end), 0) into bestand
    from public.fin_buchungszeilen z join public.fin_buchungen b on b.id = z.buchung_id
   where z.konto = kasse and b.datum <= p_datum
     -- Seit Migration 96: Ist das Jahr vorgetragen, steht der Anfangsbestand darin – frühere Jahre nicht noch einmal zählen.
     and (b.jahr = e.wirtschaftsjahr or public.fin_vortrag_buchung(e.wirtschaftsjahr - 1) is null);
  diff := round(p_gezaehlt, 2) - bestand;
  if p_ausgleichen and diff <> 0 then
    e := public.fin_buchbar(p_datum);
    gegen := case when diff < 0 then case e.kontenrahmen when 'skr03' then 4900 else 6300 end
                  else case e.kontenrahmen when 'skr03' then 2700 else 4830 end end;
    if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = gegen and k.aktiv) then
      raise exception 'Das Konto % ist ausgeblendet.', gegen;
    end if;
    n := public.fin_naechste_nr(e.wirtschaftsjahr);
    insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle)
    values (e.wirtschaftsjahr, n, p_datum, case when diff < 0 then 'Kassenfehlbetrag (Kassensturz)' else 'Kassenüberschuss (Kassensturz)' end, null, 'kasse')
    returning id into neu;
    insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
      (neu, 1, 'S', case when diff < 0 then gegen else kasse end, abs(diff)),
      (neu, 1, 'H', case when diff < 0 then kasse else gegen end, abs(diff));
  end if;
  insert into public.fin_kassenstuerze (datum, gezaehlt, buchbestand, differenz, notiz, buchung_id)
  values (p_datum, round(p_gezaehlt, 2), bestand, diff, left(nullif(btrim(coalesce(p_notiz, '')), ''), 200), neu);
  return jsonb_build_object('buchbestand', bestand, 'differenz', diff, 'nr', n);
end;
$$;

-- Stornieren wie Migration 95; Abschluss und Vortrag über ihre Seite.
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
  if q = 'bank' then
    raise exception 'Diese Buchung kommt aus dem Bankabgleich – unter Finance › Bank & Kasse die Zuordnung aufheben.';
  end if;
  if q = 'abgang' then
    raise exception 'Diese Buchung ist ein Anlagenabgang – unter Finance › Anlagen an der Anlage zurücknehmen.';
  end if;
  if q = 'abschluss' then
    raise exception 'Diese Buchung ist eine Abschlussbuchung – unter Finance › Jahresabschluss zurücknehmen.';
  end if;
  if q = 'vortrag' then
    raise exception 'Diese Buchung ist der Saldenvortrag – unter Finance › Jahresabschluss zurücknehmen oder neu vortragen.';
  end if;
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;

revoke all on function public.fin_abschluss_konto(text, text) from public, anon, authenticated;
revoke all on function public.fin_abschlussposten_buchen(integer, text, integer, numeric, text) from public, anon;
revoke all on function public.fin_abschlussposten_aufloesen(uuid) from public, anon;
revoke all on function public.fin_abschlussposten_zuruecknehmen(uuid, text) from public, anon;
revoke all on function public.fin_vortrag_vorschau(integer) from public, anon;
revoke all on function public.fin_vortrag_buchen(integer, text) from public, anon;
revoke all on function public.fin_vortrag_zuruecknehmen(integer, text) from public, anon;
grant execute on function public.fin_abschlussposten_buchen(integer, text, integer, numeric, text) to authenticated;
grant execute on function public.fin_abschlussposten_aufloesen(uuid) to authenticated;
grant execute on function public.fin_abschlussposten_zuruecknehmen(uuid, text) to authenticated;
grant execute on function public.fin_vortrag_vorschau(integer) to authenticated;
grant execute on function public.fin_vortrag_buchen(integer, text) to authenticated;
grant execute on function public.fin_vortrag_zuruecknehmen(integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Kontrolle – eine Ergebnistabelle.
-- ---------------------------------------------------------------------
select 'Tabelle fin_abschlussposten (RLS)' as pruefung,
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_abschlussposten')), 'fehlt') as ergebnis
union all
select 'Richtlinien auf fin_abschlussposten',
       coalesce((select string_agg(p.cmd || ' · ' || p.policyname, ', ') from pg_policies p where p.schemaname = 'public' and p.tablename = 'fin_abschlussposten'), 'keine')
union all
select 'Neue Konten', (select count(*)::text || ' von 8' from public.fin_konten k
                        where (k.kontenrahmen, k.nummer) in (('skr03', 860), ('skr04', 2970), ('skr03', 970), ('skr04', 3070), ('skr03', 980), ('skr04', 1900), ('skr03', 990), ('skr04', 3900)))
union all
select 'Funktionen', (select count(*)::text || ' von 12' from unnest(array['fin_abschluss_konto(text,text)', 'fin_abschlussposten_buchen(integer,text,integer,numeric,text)',
         'fin_abschlussposten_aufloesen(uuid)', 'fin_abschlussposten_zuruecknehmen(uuid,text)', 'fin_vortrag_zeilen(integer)', 'fin_vortrag_buchung(integer)',
         'fin_vortrag_vorschau(integer)', 'fin_vortrag_buchen(integer,text)', 'fin_vortrag_zuruecknehmen(integer,text)', 'fin_euer(integer)',
         'fin_kassensturz(date,numeric,text,boolean)', 'fin_stornieren(uuid,text)']) x where to_regprocedure('public.' || x) is not null);
