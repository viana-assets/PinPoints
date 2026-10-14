-- =====================================================================
-- Migration 95 – Finance, Phase F7: Anlagen und Abschreibungen (14.10.2026, v153).
--
-- docs/finance.md Abschnitt 4.5, schlank:
--
--   1. ANLAGENVERZEICHNIS `fin_anlagen`: Bezeichnung, Anlagekonto, Anschaffung, Anschaffungskosten (netto; beim
--      Kleinunternehmer brutto), Art der Abschreibung, Nutzungsdauer; auf Wunsch der Beleg und das Firmenfahrzeug
--      aus FSM. Geschrieben nur über `fin_anlage_speichern()` – die Datenbank prüft die Regeln (Stand Oktober 2026):
--        linear            Nutzungsdauer in Monaten, monatsgenau ab dem Anschaffungsmonat;
--        degressiv         bewegliche Güter, Anschaffung 01.07.2025–31.12.2027, dreifach linear, höchstens 30 %,
--                          Wechsel zur linearen AfA, sobald die höher ist (§ 7 Abs. 2 und 3 EStG);
--        gwg               bis 800 € netto, ganz im Anschaffungsmonat (§ 6 Abs. 2 EStG);
--        sammelposten      250,01–1.000 €, je 20 % in fünf Jahren, ohne Monatsanteil (§ 6 Abs. 2a EStG) – nur wenn
--                          in den Einstellungen des Jahres gewählt; dann gehört jedes Gut in diesem Rahmen hinein;
--        e_fahrzeug        reine E-Fahrzeuge, Anschaffung 01.07.2025–31.12.2027: 75/10/5/5/3/2 % (§ 7 Abs. 2a EStG).
--   2. ABSCHREIBUNGEN BUCHEN `fin_afa_buchen(jahr, bis_monat)`: je Anlage, was bis Monatsende fällig und noch nicht
--      gebucht ist – eine Buchung, ein Posten je Anlage (AfA-Konto an Anlagekonto), Quelle `afa`.
--   3. ABGANG `fin_anlage_abgang()`: Abschreibung bis zum Abgangsmonat, Restbuchwert auf 2310/6895; zurücknehmen
--      mit `fin_anlage_abgang_zuruecknehmen()`. Ein Erlös aus dem Verkauf wird wie jede Einnahme gebucht.
--   4. EINSTELLUNG `fin_einstellungen.sammelposten` je Wirtschaftsjahr (gesperrt, sobald es dort GWG/Sammelposten gibt).
--
-- Rechte: lesen und schreiben mit „Finance › Auswertungen und Abschluss“. PILOT wie alles in Finance. Reihenfolge:
-- nach 94, SQL zuerst, dann v153. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.fin_euer(integer)') is null then
    raise exception 'Zuerst Migration 94 (Finance: Auswertungen) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
alter table public.fin_buchungen add constraint fin_buchung_quelle
  check (quelle in ('manuell', 'rechnung', 'zahlung', 'beleg', 'bank', 'kasse', 'afa', 'abgang'));

alter table public.fin_einstellungen add column if not exists sammelposten boolean not null default false;

insert into public.fin_konten (kontenrahmen, nummer, bezeichnung, kategorie) values
  ('skr03', 4862, 'Abschreibung auf den Sammelposten', 'aufwand'),
  ('skr04', 6264, 'Abschreibung auf den Sammelposten', 'aufwand'),
  ('skr03', 2310, 'Anlagenabgänge (Restbuchwert)', 'aufwand'),
  ('skr04', 6895, 'Anlagenabgänge (Restbuchwert)', 'aufwand')
on conflict (kontenrahmen, nummer) do nothing;

-- ---------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------
create table if not exists public.fin_anlagen (
  id           uuid primary key default gen_random_uuid(),
  bezeichnung  text not null,
  konto        integer not null,
  art          text not null,
  anschaffung  date not null,
  ak           numeric(14,2) not null,
  monate       integer,
  satz         numeric(5,2),
  afa_konto    integer not null,
  beleg_id     uuid references public.fin_belege (id) on delete set null,
  fahrzeug_id  uuid references public.firmenfahrzeuge (id) on delete set null,
  abgang       date,
  abgang_buchung_id uuid references public.fin_buchungen (id),
  notiz        text,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  constraint fin_an_art check (art in ('linear', 'degressiv', 'gwg', 'sammelposten', 'e_fahrzeug')),
  constraint fin_an_ak check (ak > 0),
  constraint fin_an_bez check (length(btrim(bezeichnung)) between 1 and 120),
  constraint fin_an_monate check (monate is null or monate between 12 and 600)
);
alter table public.fin_anlagen enable row level security;
drop policy if exists "Finance-Anlagen lesen" on public.fin_anlagen;
create policy "Finance-Anlagen lesen" on public.fin_anlagen for select to authenticated using (public.darf('finance.abschluss', 'lesen'));
revoke all on public.fin_anlagen from anon, authenticated;
grant select on public.fin_anlagen to authenticated;

create table if not exists public.fin_afa_posten (
  id          uuid primary key default gen_random_uuid(),
  anlage_id   uuid not null references public.fin_anlagen (id),
  jahr        integer not null,
  bis_monat   integer not null,
  betrag      numeric(14,2) not null,
  buchung_id  uuid not null references public.fin_buchungen (id),
  erstellt_am timestamptz not null default now()
);
create index if not exists fin_afa_posten_anlage on public.fin_afa_posten (anlage_id, jahr);
alter table public.fin_afa_posten enable row level security;
drop policy if exists "Finance-AfA lesen" on public.fin_afa_posten;
create policy "Finance-AfA lesen" on public.fin_afa_posten for select to authenticated using (public.darf('finance.abschluss', 'lesen'));
revoke all on public.fin_afa_posten from anon, authenticated;
grant select on public.fin_afa_posten to authenticated;

-- ---------------------------------------------------------------------
-- 2. Die Rechnung: Abschreibung bis einschließlich Monat t (t = Jahr * 12 + Monat - 1). Spiegel in
--    lib/finance/anlagen.ts (`afaBis`) – tests/financeAnlagen.test.ts vergleicht mit denselben Zahlen.
-- ---------------------------------------------------------------------
create or replace function public.fin_afa_bis(p_art text, p_ak numeric, p_monate integer, p_satz numeric, p_anschaffung date, p_abgang date, p_t integer)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  a integer := extract(year from p_anschaffung)::integer * 12 + extract(month from p_anschaffung)::integer - 1;
  ja integer := extract(year from p_anschaffung)::integer;
  t integer := p_t;
  summe numeric := 0;
  buchwert numeric := p_ak;
  y integer; m_y integer; rest integer; deg numeric; lin numeric; afa numeric; anteil integer; erste integer;
  saetze numeric[] := array[75, 10, 5, 5, 3, 2];
begin
  -- Nach dem Abgang nichts mehr (Sammelposten laufen weiter, § 6 Abs. 2a Satz 3 EStG).
  if p_abgang is not null and p_art <> 'sammelposten' then
    t := least(t, extract(year from p_abgang)::integer * 12 + extract(month from p_abgang)::integer - 1);
  end if;
  if t < a then return 0; end if;
  if p_art = 'gwg' then return p_ak; end if;
  if p_art = 'linear' then
    return round(p_ak * least(t - a + 1, p_monate) / p_monate, 2);
  end if;
  if p_art = 'sammelposten' or p_art = 'e_fahrzeug' then
    for i in 0 .. (case when p_art = 'sammelposten' then 4 else 5 end) loop
      y := ja + i;
      afa := case when (p_art = 'sammelposten' and i = 4) or (p_art = 'e_fahrzeug' and i = 5) then p_ak - summe
                  when p_art = 'sammelposten' then round(p_ak * 0.2, 2) else round(p_ak * saetze[i + 1] / 100, 2) end;
      -- Monate dieses Jahres, über die verteilt wird (nur für die Monatsansicht; der Jahresbetrag steht fest).
      erste := case when i = 0 and p_art = 'e_fahrzeug' then a else y * 12 end;
      m_y := y * 12 + 11 - erste + 1;
      if t < erste then exit; end if;
      if t >= y * 12 + 11 then summe := summe + afa;
      else return round(summe + afa * (t - erste + 1) / m_y, 2);
      end if;
    end loop;
    return round(summe, 2);
  end if;
  -- degressiv, mit Wechsel zur linearen AfA
  y := ja;
  while buchwert > 0 loop
    erste := greatest(a, y * 12);
    rest := p_monate - (erste - a);
    if rest <= 0 then exit; end if;
    m_y := least(y * 12 + 11 - erste + 1, rest);
    deg := buchwert * p_satz / 100 * m_y / 12;
    lin := buchwert * m_y / rest;
    afa := case when m_y = rest then buchwert else round(greatest(deg, lin), 2) end;
    if t < erste then exit; end if;
    if t >= erste + m_y - 1 then
      summe := summe + afa; buchwert := buchwert - afa;
    else
      return round(summe + afa * (t - erste + 1) / m_y, 2);
    end if;
    y := y + 1;
  end loop;
  return round(summe, 2);
end;
$$;

create or replace function public.fin_anlage_afa_bis(p_id uuid, p_t integer)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select public.fin_afa_bis(x.art, x.ak, x.monate, x.satz, x.anschaffung, x.abgang, p_t) from public.fin_anlagen x where x.id = p_id;
$$;
revoke all on function public.fin_anlage_afa_bis(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Anlage speichern (anlegen oder ändern – ändern nur, solange keine Abschreibung gebucht ist)
-- ---------------------------------------------------------------------
create or replace function public.fin_anlage_speichern(p_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  v_art text := p ->> 'art';
  v_ak numeric;
  v_anschaffung date;
  v_konto integer;
  v_monate integer;
  v_satz numeric;
  v_afa integer;
  v_beleg uuid := nullif(p ->> 'beleg_id', '')::uuid;
  v_fahrzeug uuid := nullif(p ->> 'fahrzeug_id', '')::uuid;
  neu uuid;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Anlagen pflegen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  begin
    v_ak := round((p ->> 'ak')::numeric, 2);
    v_anschaffung := (p ->> 'anschaffung')::date;
    v_konto := (p ->> 'konto')::integer;
    v_monate := nullif(p ->> 'monate', '')::integer;
  exception when others then
    raise exception 'Anschaffungsdatum, Betrag, Konto oder Nutzungsdauer ist nicht lesbar.';
  end;
  if coalesce(btrim(p ->> 'bezeichnung'), '') = '' then raise exception 'Die Bezeichnung fehlt.'; end if;
  if v_ak is null or v_ak <= 0 then raise exception 'Die Anschaffungskosten müssen größer als 0 sein.'; end if;
  if v_anschaffung is null then raise exception 'Das Anschaffungsdatum fehlt.'; end if;
  if v_anschaffung > (now() at time zone 'Europe/Berlin')::date then raise exception 'Das Anschaffungsdatum liegt in der Zukunft.'; end if;
  select * into e from public.fin_einstellungen where wirtschaftsjahr = extract(year from v_anschaffung)::integer;
  if e.wirtschaftsjahr is null then raise exception 'Für % sind die Finance-Einstellungen noch nicht gespeichert.', extract(year from v_anschaffung)::integer; end if;
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = v_konto and k.kategorie = 'anlage' and k.aktiv) then
    raise exception 'Konto % ist kein Anlagekonto im %.', lpad(coalesce(v_konto, 0)::text, 4, '0'), upper(e.kontenrahmen);
  end if;
  if v_art is null or v_art not in ('linear', 'degressiv', 'gwg', 'sammelposten', 'e_fahrzeug') then raise exception 'Die Art der Abschreibung fehlt.'; end if;

  -- Sammelposten gewählt: jedes Gut über 250 € bis 1.000 € gehört hinein (§ 6 Abs. 2a Satz 5 EStG: einheitlich).
  if e.sammelposten and v_ak > 250 and v_ak <= 1000 and v_art <> 'sammelposten' then
    raise exception 'Für % ist der Sammelposten gewählt – Güter über 250 € bis 1.000 € kommen dort hinein.', e.wirtschaftsjahr;
  end if;
  if v_art = 'sammelposten' then
    if not e.sammelposten then raise exception 'Der Sammelposten ist für % nicht gewählt (Finance › Einstellungen).', e.wirtschaftsjahr; end if;
    if v_ak <= 250 or v_ak > 1000 then raise exception 'In den Sammelposten gehören Güter über 250 € bis 1.000 € (netto).'; end if;
  elsif v_art = 'gwg' then
    if v_ak > 800 then raise exception 'Sofort abschreiben lassen sich Güter bis 800 € (netto).'; end if;
  elsif v_art in ('degressiv', 'e_fahrzeug') then
    if v_anschaffung < date '2025-07-01' or v_anschaffung > date '2027-12-31' then
      raise exception '% gibt es für Anschaffungen vom 01.07.2025 bis 31.12.2027.', case v_art when 'degressiv' then 'Die degressive Abschreibung' else 'Die Sonderabschreibung für E-Fahrzeuge' end;
    end if;
  end if;
  if v_art in ('linear', 'degressiv') and (v_monate is null or v_monate < 12 or v_monate > 600) then
    raise exception 'Die Nutzungsdauer fehlt (1 bis 50 Jahre).';
  end if;
  if v_art not in ('linear', 'degressiv') then v_monate := null; end if;
  v_satz := case when v_art = 'degressiv' then least(round(3 * 1200.0 / v_monate, 2), 30) end;
  v_afa := case v_art when 'gwg' then case e.kontenrahmen when 'skr03' then 4855 else 6260 end
                      when 'sammelposten' then case e.kontenrahmen when 'skr03' then 4862 else 6264 end
                      else case e.kontenrahmen when 'skr03' then 4830 else 6220 end end;

  if p_id is null then
    insert into public.fin_anlagen (bezeichnung, konto, art, anschaffung, ak, monate, satz, afa_konto, beleg_id, fahrzeug_id, notiz)
    values (left(btrim(p ->> 'bezeichnung'), 120), v_konto, v_art, v_anschaffung, v_ak, v_monate, v_satz, v_afa, v_beleg, v_fahrzeug,
            left(nullif(btrim(coalesce(p ->> 'notiz', '')), ''), 300))
    returning id into neu;
    return neu;
  end if;
  if not exists (select 1 from public.fin_anlagen where id = p_id) then raise exception 'Diese Anlage gibt es nicht.'; end if;
  if exists (select 1 from public.fin_afa_posten x join public.fin_buchungen b on b.id = x.buchung_id
              where x.anlage_id = p_id and b.storniert_durch is null) then
    -- Schon abgeschrieben: nur noch Bezeichnung, Notiz, Beleg und Fahrzeug.
    update public.fin_anlagen set bezeichnung = left(btrim(p ->> 'bezeichnung'), 120), notiz = left(nullif(btrim(coalesce(p ->> 'notiz', '')), ''), 300),
           beleg_id = v_beleg, fahrzeug_id = v_fahrzeug
     where id = p_id
       and (konto, art, anschaffung, ak, coalesce(monate, 0)) = (v_konto, v_art, v_anschaffung, v_ak, coalesce(v_monate, 0));
    if not found then
      raise exception 'Für diese Anlage ist schon abgeschrieben – Konto, Art, Datum, Betrag und Nutzungsdauer bleiben. Erst die Abschreibungen stornieren.';
    end if;
    return p_id;
  end if;
  update public.fin_anlagen set bezeichnung = left(btrim(p ->> 'bezeichnung'), 120), konto = v_konto, art = v_art, anschaffung = v_anschaffung, ak = v_ak,
         monate = v_monate, satz = v_satz, afa_konto = v_afa, beleg_id = v_beleg, fahrzeug_id = v_fahrzeug,
         notiz = left(nullif(btrim(coalesce(p ->> 'notiz', '')), ''), 300)
   where id = p_id;
  return p_id;
end;
$$;

create or replace function public.fin_anlage_loeschen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Anlagen pflegen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  if exists (select 1 from public.fin_afa_posten where anlage_id = p_id) or exists (select 1 from public.fin_anlagen where id = p_id and abgang is not null) then
    raise exception 'Zu dieser Anlage gibt es schon Buchungen – sie bleibt im Verzeichnis (Abgang statt Löschen).';
  end if;
  delete from public.fin_anlagen where id = p_id;
  if not found then raise exception 'Diese Anlage gibt es nicht.'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Abschreibungen buchen
-- ---------------------------------------------------------------------
-- Kern: alle Anlagen oder nur eine (`p_nur`, beim Abgang).
create or replace function public.fin_afa_buchen_kern(p_jahr integer, p_bis_monat integer, p_nur uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  d date;
  t integer;
  x record;
  ziel numeric; gebucht numeric; delta numeric;
  neu uuid; n integer; i integer := 0; summe numeric := 0;
begin
  if p_bis_monat is null or p_bis_monat not between 1 and 12 then raise exception 'Den Monat angeben (1 bis 12).'; end if;
  d := (make_date(p_jahr, p_bis_monat, 1) + interval '1 month' - interval '1 day')::date;
  if make_date(p_jahr, p_bis_monat, 1) > (now() at time zone 'Europe/Berlin')::date then raise exception 'Abgeschrieben wird nicht im Voraus.'; end if;
  e := public.fin_buchbar(d);
  t := p_jahr * 12 + p_bis_monat - 1;
  for x in select a.* from public.fin_anlagen a where a.anschaffung <= d and (p_nur is null or a.id = p_nur) order by a.anschaffung, a.erstellt_am loop
    ziel := public.fin_afa_bis(x.art, x.ak, x.monate, x.satz, x.anschaffung, x.abgang, t) - public.fin_afa_bis(x.art, x.ak, x.monate, x.satz, x.anschaffung, x.abgang, p_jahr * 12 - 1);
    select coalesce(sum(p.betrag), 0) into gebucht from public.fin_afa_posten p join public.fin_buchungen b on b.id = p.buchung_id
     where p.anlage_id = x.id and p.jahr = p_jahr and b.storniert_durch is null;
    delta := round(ziel - gebucht, 2);
    if delta = 0 then continue; end if;
    if neu is null then
      n := public.fin_naechste_nr(e.wirtschaftsjahr);
      insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle)
      values (e.wirtschaftsjahr, n, d, 'Abschreibungen bis ' || to_char(d, 'MM/YYYY'), null, 'afa') returning id into neu;
    end if;
    i := i + 1;
    if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = x.afa_konto and k.aktiv) then
      raise exception 'Das Abschreibungskonto % ist ausgeblendet.', x.afa_konto;
    end if;
    insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
      (neu, i, case when delta > 0 then 'S' else 'H' end, x.afa_konto, abs(delta)),
      (neu, i, case when delta > 0 then 'H' else 'S' end, x.konto, abs(delta));
    insert into public.fin_afa_posten (anlage_id, jahr, bis_monat, betrag, buchung_id) values (x.id, p_jahr, p_bis_monat, delta, neu);
    summe := summe + delta;
  end loop;
  return jsonb_build_object('nr', n, 'anlagen', i, 'summe', summe);
end;
$$;
revoke all on function public.fin_afa_buchen_kern(integer, integer, uuid) from public, anon, authenticated;

create or replace function public.fin_afa_buchen(p_jahr integer, p_bis_monat integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Abschreibungen buchen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  return public.fin_afa_buchen_kern(p_jahr, p_bis_monat, null);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Abgang
-- ---------------------------------------------------------------------
create or replace function public.fin_anlage_abgang(p_id uuid, p_datum date, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.fin_anlagen%rowtype;
  e public.fin_einstellungen%rowtype;
  afa jsonb; restwert numeric; t integer;
  neu uuid; n integer; abgangskonto integer;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Anlagen pflegen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  select * into x from public.fin_anlagen where id = p_id for update;
  if x.id is null then raise exception 'Diese Anlage gibt es nicht.'; end if;
  if x.abgang is not null then raise exception 'Der Abgang ist schon gebucht.'; end if;
  if x.art = 'sammelposten' then raise exception 'Ein Gut im Sammelposten scheidet nicht einzeln aus – der Posten wird weiter abgeschrieben.'; end if;
  if p_datum is null or p_datum < x.anschaffung or p_datum > (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Das Abgangsdatum liegt vor der Anschaffung oder in der Zukunft.';
  end if;
  if coalesce(btrim(p_grund), '') = '' then raise exception 'Bitte einen Grund angeben (verkauft, verschrottet …).'; end if;
  update public.fin_anlagen set abgang = p_datum where id = p_id;
  -- Abschreibung dieses Jahres bis zum Abgangsmonat (nur diese Anlage; schon weiter Gebuchtes wird zurückgenommen),
  -- Restbuchwert laut Plan. Jahre vor dem Start von Finance stehen im Anfangsbestand des Anlagekontos.
  afa := public.fin_afa_buchen_kern(extract(year from p_datum)::integer, extract(month from p_datum)::integer, p_id);
  t := extract(year from p_datum)::integer * 12 + extract(month from p_datum)::integer - 1;
  restwert := x.ak - public.fin_afa_bis(x.art, x.ak, x.monate, x.satz, x.anschaffung, p_datum, t);
  e := public.fin_buchbar(p_datum);
  if restwert > 0 then
    abgangskonto := case e.kontenrahmen when 'skr03' then 2310 else 6895 end;
    n := public.fin_naechste_nr(e.wirtschaftsjahr);
    insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id, grund)
    values (e.wirtschaftsjahr, n, p_datum, left('Abgang ' || x.bezeichnung, 200), null, 'abgang', x.id, btrim(p_grund)) returning id into neu;
    insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
      (neu, 1, 'S', abgangskonto, restwert), (neu, 1, 'H', x.konto, restwert);
  end if;
  update public.fin_anlagen set abgang_buchung_id = neu, notiz = left(concat_ws(' · ', x.notiz, 'Abgang: ' || btrim(p_grund)), 300) where id = p_id;
  return jsonb_build_object('restwert', restwert, 'nr', n, 'afa_nr', afa ->> 'nr');
end;
$$;

create or replace function public.fin_anlage_abgang_zuruecknehmen(p_id uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.fin_anlagen%rowtype;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Anlagen pflegen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“ schreiben).';
  end if;
  select * into x from public.fin_anlagen where id = p_id for update;
  if x.abgang is null then raise exception 'Für diese Anlage ist kein Abgang gebucht.'; end if;
  if x.abgang_buchung_id is not null then perform public.fin_gegenbuchung(x.abgang_buchung_id, p_grund, null, null); end if;
  update public.fin_anlagen set abgang = null, abgang_buchung_id = null where id = p_id;
end;
$$;

-- Von Hand stornieren: Abschreibungsläufe ja (der nächste Lauf bucht neu), Abgänge über die Anlage.
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
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;

-- Gebuchte Abschreibung je Anlage im Jahr (ohne stornierte Läufe) – für die Seite, auch ohne Journal-Recht.
create or replace function public.fin_afa_gebucht(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.abschluss', 'lesen') then
    raise exception 'Anlagen sind für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“).';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('anlage_id', x.anlage_id, 'betrag', x.betrag, 'bis_monat', x.bis_monat))
    from (select p.anlage_id, sum(p.betrag) as betrag, max(p.bis_monat) as bis_monat
            from public.fin_afa_posten p join public.fin_buchungen b on b.id = p.buchung_id
           where p.jahr = p_jahr and b.storniert_durch is null group by p.anlage_id) x), '[]'::jsonb);
end;
$$;

-- Sammelposten-Wahl je Jahr: fest, sobald es dort GWG oder Sammelposten gibt (einheitliche Ausübung).
create or replace function public.fin_einstellungen_sammelposten_sperre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sammelposten is distinct from old.sammelposten
     and exists (select 1 from public.fin_anlagen a where extract(year from a.anschaffung)::integer = old.wirtschaftsjahr
                  and (a.art = 'sammelposten' or (a.art = 'gwg' and a.ak > 250))) then
    raise exception 'Für % gibt es schon geringwertige Güter oder einen Sammelposten – die Wahl gilt für das ganze Jahr und bleibt.', old.wirtschaftsjahr;
  end if;
  return new;
end;
$$;
drop trigger if exists fin_einstellungen_sammelposten_sperre on public.fin_einstellungen;
create trigger fin_einstellungen_sammelposten_sperre before update on public.fin_einstellungen
  for each row execute function public.fin_einstellungen_sammelposten_sperre();

revoke all on function public.fin_afa_bis(text, numeric, integer, numeric, date, date, integer) from public, anon, authenticated;
revoke all on function public.fin_einstellungen_sammelposten_sperre() from public, anon, authenticated;
revoke all on function public.fin_anlage_speichern(uuid, jsonb) from public, anon;
revoke all on function public.fin_anlage_loeschen(uuid) from public, anon;
revoke all on function public.fin_afa_buchen(integer, integer) from public, anon;
revoke all on function public.fin_anlage_abgang(uuid, date, text) from public, anon;
revoke all on function public.fin_anlage_abgang_zuruecknehmen(uuid, text) from public, anon;
revoke all on function public.fin_afa_gebucht(integer) from public, anon;
grant execute on function public.fin_afa_gebucht(integer) to authenticated;
grant execute on function public.fin_anlage_speichern(uuid, jsonb) to authenticated;
grant execute on function public.fin_anlage_loeschen(uuid) to authenticated;
grant execute on function public.fin_afa_buchen(integer, integer) to authenticated;
grant execute on function public.fin_anlage_abgang(uuid, date, text) to authenticated;
grant execute on function public.fin_anlage_abgang_zuruecknehmen(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Kontrolle – eine Ergebnistabelle.
-- ---------------------------------------------------------------------
select 'Tabellen' as pruefung,
       (select string_agg(t, ', ') from unnest(array['fin_anlagen', 'fin_afa_posten']) t where to_regclass('public.' || t) is not null) as ergebnis
union all
select 'Funktionen', (select count(*)::text || ' von 10' from unnest(array['fin_afa_bis(text,numeric,integer,numeric,date,date,integer)', 'fin_afa_buchen_kern(integer,integer,uuid)', 'fin_afa_gebucht(integer)',
         'fin_anlage_afa_bis(uuid,integer)', 'fin_anlage_speichern(uuid,jsonb)', 'fin_anlage_loeschen(uuid)', 'fin_afa_buchen(integer,integer)',
         'fin_anlage_abgang(uuid,date,text)', 'fin_anlage_abgang_zuruecknehmen(uuid,text)', 'fin_einstellungen_sammelposten_sperre()']) x
         where to_regprocedure('public.' || x) is not null)
union all
select 'Einstellung Sammelposten, neue Konten', (select count(*)::text from information_schema.columns where table_name = 'fin_einstellungen' and column_name = 'sammelposten')
       || ' Spalte, ' || (select count(*)::text from public.fin_konten where (kontenrahmen, nummer) in (('skr03', 4862), ('skr04', 6264), ('skr03', 2310), ('skr04', 6895))) || ' Konten'
union all
select 'Richtlinien', (select count(*)::text || ' (erwartet 2)' from pg_policies where schemaname = 'public' and tablename in ('fin_anlagen', 'fin_afa_posten'));
