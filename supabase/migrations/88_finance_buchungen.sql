-- =====================================================================
-- Migration 88 – Finance, Phase F1: Konten, Steuerschlüssel, Journal (13.10.2026, v146).
--
-- docs/finance.md Abschnitt 7 (F1), schlank gehalten, damit F3 (Rechnungen) bald folgt:
--
--   1. KONTEN `fin_konten` je Kontenrahmen (SKR03, SKR04) – die Konten, die ein Reifenservice braucht.
--      Nummern nach dem DATEV-Standard, Bezeichnungen eigene Formulierung. VOR DEM ECHTBETRIEB MIT DEM
--      STEUERBERATER ABGLEICHEN. Eigene Konten anlegen und Konten ausblenden mit „Finance-Einstellungen“.
--   2. STEUERSCHLÜSSEL `fin_steuerschluessel` je Kontenrahmen: USt 19/7, Vorsteuer 19/7, § 13b, ig. Erwerb,
--      steuerfrei, ig. Lieferung, Kleinunternehmer – mit den Steuerkonten.
--   3. JOURNAL `fin_buchungen` (Kopf, Nummer lückenlos je Jahr) und `fin_buchungszeilen` (Soll/Haben).
--      Gebucht wird NUR über `fin_buchen()`: Die Datenbank rechnet die Steuer heraus, schreibt die Zeilen
--      und prüft Soll = Haben. Ändern und Löschen gibt es nicht (GoBD) – korrigiert wird mit
--      `fin_stornieren()` (Gegenbuchung, Grund Pflicht).
--   4. FESTSCHREIBUNG `fin_festschreibungen` je Monat mit `fin_monat_festschreiben()` (Recht
--      „Finance › Abschluss“ schreiben). Endgültig: In einem festgeschriebenen Monat wird nicht mehr gebucht.
--   5. Der Kontenrahmen eines Jahres mit Buchungen lässt sich nicht mehr umstellen.
--   6. „Alle Daten löschen“ leert Journal und Festschreibungen; Konten und Steuerschlüssel bleiben
--      (`alle_daten_behalten()`), sonst wäre Finance danach leer.
--
-- PILOT: Finance ist ein Probelauf neben der bisherigen Buchhaltung (docs/finance.md).
-- Reihenfolge: nach 87, SQL zuerst, dann die Dateien von v146. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_einstellungen') is null then
    raise exception 'Zuerst Migration 87 (Finance: Rechte und Einstellungen) ausführen. Es wurde nichts geändert.';
  end if;
  if to_regprocedure('public.alle_daten_behalten()') is null then
    raise exception 'Zuerst Migration 72 und 86 (Alle Daten löschen) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Konten
-- ---------------------------------------------------------------------
create table if not exists public.fin_konten (
  kontenrahmen text not null,
  nummer       integer not null,
  bezeichnung  text not null,
  kategorie    text not null,
  eigen        boolean not null default false,
  aktiv        boolean not null default true,
  primary key (kontenrahmen, nummer),
  constraint fin_konto_rahmen    check (kontenrahmen in ('skr03', 'skr04')),
  constraint fin_konto_nummer    check (nummer between 1 and 9999),
  constraint fin_konto_text      check (length(btrim(bezeichnung)) between 1 and 120),
  constraint fin_konto_kategorie check (kategorie in ('anlage', 'geld', 'forderung', 'verbindlichkeit', 'steuer', 'kapital', 'privat', 'erloes', 'aufwand', 'vortrag'))
);
comment on table public.fin_konten is
  'Migration 88: Sachkonten je Kontenrahmen. Lesen: finance; eigene anlegen/ausblenden: finance.einstellungen. Übersteht „Alle Daten löschen“.';

alter table public.fin_konten enable row level security;
drop policy if exists "Finance-Konten lesen" on public.fin_konten;
create policy "Finance-Konten lesen" on public.fin_konten
  for select to authenticated using (public.darf('finance', 'lesen'));
drop policy if exists "Finance-Konten anlegen" on public.fin_konten;
create policy "Finance-Konten anlegen" on public.fin_konten
  for insert to authenticated with check (public.darf('finance.einstellungen', 'schreiben') and eigen);
drop policy if exists "Finance-Konten ändern" on public.fin_konten;
create policy "Finance-Konten ändern" on public.fin_konten
  for update to authenticated
  using (public.darf('finance.einstellungen', 'schreiben'))
  with check (public.darf('finance.einstellungen', 'schreiben'));
-- Kein Löschen: Ein Konto, auf dem gebucht wurde, muss bleiben – ausblenden statt löschen.
revoke all on public.fin_konten from anon, authenticated;
grant select on public.fin_konten to authenticated;
grant insert (kontenrahmen, nummer, bezeichnung, kategorie, eigen) on public.fin_konten to authenticated;
-- Ändern nur Bezeichnung und „aktiv“: Nummer und Art eines bebuchten Kontos stehen fest.
grant update (bezeichnung, aktiv) on public.fin_konten to authenticated;

-- ---------------------------------------------------------------------
-- 2. Steuerschlüssel
-- ---------------------------------------------------------------------
create table if not exists public.fin_steuerschluessel (
  kontenrahmen text not null,
  schluessel   text not null,
  bezeichnung  text not null,
  satz         numeric(5,2) not null,
  art          text not null,
  ust_konto    integer,
  vst_konto    integer,
  primary key (kontenrahmen, schluessel),
  constraint fin_st_rahmen check (kontenrahmen in ('skr03', 'skr04')),
  constraint fin_st_art    check (art in ('ust', 'vst', 'r13b', 'ige', 'ohne')),
  constraint fin_st_konten check (
    (art = 'ust' and ust_konto is not null and vst_konto is null) or
    (art = 'vst' and vst_konto is not null and ust_konto is null) or
    (art in ('r13b', 'ige') and ust_konto is not null and vst_konto is not null) or
    (art = 'ohne' and ust_konto is null and vst_konto is null))
);
comment on table public.fin_steuerschluessel is
  'Migration 88: Steuerschlüssel je Kontenrahmen mit Satz und Steuerkonten. Nur lesen (finance). Übersteht „Alle Daten löschen“.';
alter table public.fin_steuerschluessel enable row level security;
drop policy if exists "Finance-Steuerschlüssel lesen" on public.fin_steuerschluessel;
create policy "Finance-Steuerschlüssel lesen" on public.fin_steuerschluessel
  for select to authenticated using (public.darf('finance', 'lesen'));
revoke all on public.fin_steuerschluessel from anon, authenticated;
grant select on public.fin_steuerschluessel to authenticated;

-- ---------------------------------------------------------------------
-- 3. Journal
-- ---------------------------------------------------------------------
create table if not exists public.fin_buchungen (
  id              uuid primary key default gen_random_uuid(),
  jahr            integer not null,
  nr              integer not null,
  datum           date not null,
  text            text not null,
  beleg           text,
  -- Woher die Buchung kommt: von Hand oder (ab F3) aus einer Rechnung.
  quelle          text not null default 'manuell',
  quelle_id       uuid,
  storno_von      uuid references public.fin_buchungen (id),
  storniert_durch uuid references public.fin_buchungen (id),
  grund           text,
  erstellt_am     timestamptz not null default now(),
  erstellt_von    uuid default auth.uid(),
  unique (jahr, nr),
  constraint fin_buchung_text   check (length(btrim(text)) between 1 and 200),
  constraint fin_buchung_beleg  check (beleg is null or length(beleg) <= 60),
  constraint fin_buchung_quelle check (quelle in ('manuell', 'rechnung')),
  constraint fin_buchung_jahr   check (jahr = extract(year from datum)::integer)
);
create index if not exists fin_buchungen_datum on public.fin_buchungen (jahr, datum);
comment on table public.fin_buchungen is
  'Migration 88: Journal (Buchungskopf). Schreiben nur über fin_buchen()/fin_stornieren(); kein Ändern, kein Löschen.';

create table if not exists public.fin_buchungszeilen (
  id               bigint generated always as identity primary key,
  buchung_id       uuid not null references public.fin_buchungen (id) on delete cascade,
  posten           integer not null,
  seite            text not null,
  konto            integer not null,
  betrag           numeric(14,2) not null,
  steuerschluessel text,
  ist_steuer       boolean not null default false,
  constraint fin_zeile_seite  check (seite in ('S', 'H')),
  constraint fin_zeile_betrag check (betrag > 0)
);
create index if not exists fin_zeilen_buchung on public.fin_buchungszeilen (buchung_id);
comment on table public.fin_buchungszeilen is
  'Migration 88: Soll- und Habenzeilen einer Buchung, erzeugt von fin_buchen(). Je Buchung Soll = Haben.';

create table if not exists public.fin_nummern (
  jahr     integer primary key,
  naechste integer not null default 1
);

create table if not exists public.fin_festschreibungen (
  jahr  integer not null,
  monat integer not null,
  am    timestamptz not null default now(),
  von   uuid default auth.uid(),
  primary key (jahr, monat),
  constraint fin_fest_monat check (monat between 1 and 12)
);

alter table public.fin_buchungen enable row level security;
alter table public.fin_buchungszeilen enable row level security;
alter table public.fin_nummern enable row level security;
alter table public.fin_festschreibungen enable row level security;
drop policy if exists "Finance-Buchungen lesen" on public.fin_buchungen;
create policy "Finance-Buchungen lesen" on public.fin_buchungen
  for select to authenticated using (public.darf('finance.buchen', 'lesen'));
drop policy if exists "Finance-Buchungszeilen lesen" on public.fin_buchungszeilen;
create policy "Finance-Buchungszeilen lesen" on public.fin_buchungszeilen
  for select to authenticated using (public.darf('finance.buchen', 'lesen'));
drop policy if exists "Finance-Festschreibungen lesen" on public.fin_festschreibungen;
create policy "Finance-Festschreibungen lesen" on public.fin_festschreibungen
  for select to authenticated using (public.darf('finance', 'lesen'));
-- fin_nummern: keine Richtlinie – nur die Funktionen zählen.
revoke all on public.fin_buchungen, public.fin_buchungszeilen, public.fin_nummern, public.fin_festschreibungen from anon, authenticated;
grant select on public.fin_buchungen, public.fin_buchungszeilen, public.fin_festschreibungen to authenticated;

-- ---------------------------------------------------------------------
-- 4. Buchen. Die Regeln stehen auch in lib/finance/buchung.ts (Vorschau) – wer eine Stelle ändert,
--    ändert beide; die Datenbank entscheidet.
--
--    Ein Posten: Soll-Konto, Haben-Konto, Betrag, Steuerschlüssel (oder keiner).
--    - USt/Vorsteuer: Betrag ist BRUTTO; die Steuer wird herausgerechnet und auf der Seite des Erlös-,
--      Aufwands- oder Anlagekontos abgespalten (Rechnung: Forderung an Erlöse + USt; Gutschrift umgekehrt).
--    - § 13b / ig. Erwerb: Betrag ist NETTO (Rechnung ohne Steuer); die Steuer kommt dazu, als
--      Umsatzsteuer UND Vorsteuer – unterm Strich null. Kleinunternehmer: ohne Vorsteuer, die Steuer
--      wird Aufwand.
-- ---------------------------------------------------------------------
create or replace function public.fin_naechste_nr(p_jahr integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.fin_nummern (jahr, naechste) values (p_jahr, 1) on conflict (jahr) do nothing;
  -- Gesperrt bis zum Ende der Transaktion: lückenlos, auch wenn zwei gleichzeitig buchen.
  -- Kein Sequence (CLAUDE.md, Fallstricke): Ein Abbruch reißt dann keine Lücke.
  select naechste into n from public.fin_nummern where jahr = p_jahr for update;
  update public.fin_nummern set naechste = n + 1 where jahr = p_jahr;
  return n;
end;
$$;

create or replace function public.fin_posten_schreiben(p_buchung uuid, p_rahmen text, p_besteuerung text,
  p_r13b boolean, p_ig boolean, p_posten jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p jsonb;
  i integer := 0;
  s_k integer; h_k integer; v_betrag numeric; schl text;  -- v_: nicht wie die Spalte `betrag` (CLAUDE.md, PL/pgSQL)
  s_kat text; h_kat text;
  st public.fin_steuerschluessel%rowtype;
  steuer numeric; netto numeric; links boolean;
  erfolg text[] := array['erloes', 'aufwand', 'anlage'];
  summe_s numeric; summe_h numeric;
begin
  if jsonb_typeof(p_posten) is distinct from 'array' or jsonb_array_length(p_posten) = 0 then
    raise exception 'Die Buchung braucht mindestens einen Posten.';
  end if;
  if jsonb_array_length(p_posten) > 50 then
    raise exception 'Höchstens 50 Posten je Buchung.';
  end if;
  for p in select value from jsonb_array_elements(p_posten) loop
    i := i + 1;
    begin
      s_k := (p ->> 'soll')::integer; h_k := (p ->> 'haben')::integer; v_betrag := round((p ->> 'betrag')::numeric, 2);
    exception when others then
      raise exception 'Posten %: Konto oder Betrag ist keine Zahl.', i;
    end;
    schl := nullif(btrim(coalesce(p ->> 'steuer', '')), '');
    if s_k is null or h_k is null then raise exception 'Posten %: Soll- und Haben-Konto angeben.', i; end if;
    if s_k = h_k then raise exception 'Posten %: Soll und Haben sind dasselbe Konto.', i; end if;
    if v_betrag is null or v_betrag <= 0 then raise exception 'Posten %: Der Betrag muss größer als 0 sein.', i; end if;
    if v_betrag > 99999999 then raise exception 'Posten %: Der Betrag ist zu groß.', i; end if;
    select kategorie into s_kat from public.fin_konten where kontenrahmen = p_rahmen and nummer = s_k and aktiv;
    if s_kat is null then raise exception 'Posten %: Konto % gibt es im % nicht oder es ist ausgeblendet.', i, lpad(s_k::text, 4, '0'), upper(p_rahmen); end if;
    select kategorie into h_kat from public.fin_konten where kontenrahmen = p_rahmen and nummer = h_k and aktiv;
    if h_kat is null then raise exception 'Posten %: Konto % gibt es im % nicht oder es ist ausgeblendet.', i, lpad(h_k::text, 4, '0'), upper(p_rahmen); end if;

    if schl is null then
      insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
        (p_buchung, i, 'S', s_k, v_betrag), (p_buchung, i, 'H', h_k, v_betrag);
      continue;
    end if;

    select * into st from public.fin_steuerschluessel where kontenrahmen = p_rahmen and schluessel = schl;
    if st.schluessel is null then raise exception 'Posten %: Steuerschlüssel „%“ gibt es nicht.', i, schl; end if;
    if s_kat = 'steuer' or h_kat = 'steuer' then
      raise exception 'Posten %: Auf ein Steuerkonto wird ohne Steuerschlüssel gebucht.', i;
    end if;
    if p_besteuerung = 'klein' and st.art in ('ust', 'vst') then
      raise exception 'Posten %: Als Kleinunternehmer gibt es keine Umsatzsteuer und keinen Vorsteuerabzug – Schlüssel „%“ passt nicht (Finance › Einstellungen).', i, st.bezeichnung;
    end if;
    if p_besteuerung = 'regel' and schl = 'ku' then
      raise exception 'Posten %: „Kleinunternehmer“ gilt nur bei der Besteuerung als Kleinunternehmer (Finance › Einstellungen).', i;
    end if;
    if st.art = 'r13b' and not p_r13b then
      raise exception 'Posten %: § 13b ist in Finance › Einstellungen ausgeschaltet.', i;
    end if;
    if (st.art = 'ige' or schl = 'igl') and not p_ig then
      raise exception 'Posten %: Innergemeinschaftliche Geschäfte sind in Finance › Einstellungen ausgeschaltet.', i;
    end if;

    if st.art = 'ohne' then
      insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel) values
        (p_buchung, i, 'S', s_k, v_betrag, schl), (p_buchung, i, 'H', h_k, v_betrag, schl);
      continue;
    end if;

    -- Die Steuer gehört zur Seite des Erlös-, Aufwands- oder Anlagekontos – genau eine Seite muss eins haben.
    if (s_kat = any(erfolg)) = (h_kat = any(erfolg)) then
      raise exception 'Posten %: Mit Steuerschlüssel braucht der Posten genau ein Erlös-, Aufwands- oder Anlagekonto.', i;
    end if;
    links := s_kat = any(erfolg);

    if st.art in ('ust', 'vst') then
      steuer := round(v_betrag * st.satz / (100 + st.satz), 2);
      netto := v_betrag - steuer;
      insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel) values
        (p_buchung, i, 'S', s_k, case when links then netto else v_betrag end, schl),
        (p_buchung, i, 'H', h_k, case when links then v_betrag else netto end, schl);
      if steuer > 0 then
        insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel, ist_steuer) values
          (p_buchung, i, case when links then 'S' else 'H' end,
           case when st.art = 'ust' then st.ust_konto else st.vst_konto end, steuer, schl, true);
      end if;
    else
      -- § 13b / ig. Erwerb: Betrag netto, Steuer obendrauf.
      steuer := round(v_betrag * st.satz / 100, 2);
      insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel) values
        (p_buchung, i, 'S', s_k, case when links and p_besteuerung = 'klein' then v_betrag + steuer else v_betrag end, schl),
        (p_buchung, i, 'H', h_k, case when not links and p_besteuerung = 'klein' then v_betrag + steuer else v_betrag end, schl);
      if steuer > 0 then
        -- Umsatzsteuer auf der Gegenseite des Aufwands, Vorsteuer auf seiner Seite.
        insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel, ist_steuer) values
          (p_buchung, i, case when links then 'H' else 'S' end, st.ust_konto, steuer, schl, true);
        if p_besteuerung <> 'klein' then
          insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel, ist_steuer) values
            (p_buchung, i, case when links then 'S' else 'H' end, st.vst_konto, steuer, schl, true);
        end if;
      end if;
    end if;
  end loop;

  select coalesce(sum(z.betrag) filter (where z.seite = 'S'), 0), coalesce(sum(z.betrag) filter (where z.seite = 'H'), 0)
    into summe_s, summe_h from public.fin_buchungszeilen z where z.buchung_id = p_buchung;
  if summe_s <> summe_h then
    raise exception 'Soll (%) und Haben (%) sind nicht gleich – es wurde nichts gebucht.', summe_s, summe_h;
  end if;
end;
$$;

-- Prüft Recht, Einstellungen und Festschreibung für ein Buchungsdatum und liefert die Einstellungen.
create or replace function public.fin_buchbar(p_datum date)
returns public.fin_einstellungen
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.fin_einstellungen%rowtype;
  j integer := extract(year from p_datum)::integer;
begin
  if p_datum is null then raise exception 'Das Datum fehlt.'; end if;
  select * into e from public.fin_einstellungen where wirtschaftsjahr = j;
  if e.wirtschaftsjahr is null then
    raise exception 'Für % sind die Finance-Einstellungen noch nicht gespeichert – zuerst Finance › Einstellungen.', j;
  end if;
  if e.wj_beginn_monat <> 1 then
    raise exception 'Ein vom Kalenderjahr abweichendes Wirtschaftsjahr kann Finance noch nicht buchen.';
  end if;
  if exists (select 1 from public.fin_festschreibungen f where f.jahr = j and f.monat = extract(month from p_datum)::integer) then
    raise exception 'Der % ist festgeschrieben – dort wird nicht mehr gebucht.', to_char(p_datum, 'MM/YYYY');
  end if;
  return e;
end;
$$;

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
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;

-- Storno: dieselben Zeilen mit getauschten Seiten. Datum: das der Buchung, ist deren Monat schon
-- festgeschrieben, heute.
create or replace function public.fin_stornieren(p_id uuid, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.fin_buchungen%rowtype;
  e public.fin_einstellungen%rowtype;
  d date;
  neu uuid;
  n integer;
begin
  if not public.darf('finance.buchen', 'schreiben') then
    raise exception 'Stornieren ist für deine Rolle nicht freigeschaltet (Recht „Finance › Buchungen“ schreiben).';
  end if;
  if coalesce(btrim(p_grund), '') = '' then raise exception 'Bitte einen Grund für das Storno angeben.'; end if;
  select * into b from public.fin_buchungen where id = p_id for update;
  if b.id is null then raise exception 'Diese Buchung gibt es nicht.'; end if;
  if b.storno_von is not null then raise exception 'Eine Stornobuchung wird nicht storniert – stattdessen neu buchen.'; end if;
  if b.storniert_durch is not null then raise exception 'Diese Buchung ist schon storniert.'; end if;
  d := b.datum;
  if exists (select 1 from public.fin_festschreibungen f where f.jahr = b.jahr and f.monat = extract(month from b.datum)::integer) then
    d := (now() at time zone 'Europe/Berlin')::date;
  end if;
  e := public.fin_buchbar(d);
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id, storno_von, grund)
  values (e.wirtschaftsjahr, n, d, left('Storno ' || b.jahr || '-' || b.nr || ': ' || b.text, 200), b.beleg, b.quelle, b.quelle_id, b.id, btrim(p_grund))
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel, ist_steuer)
  select neu, z.posten, case z.seite when 'S' then 'H' else 'S' end, z.konto, z.betrag, z.steuerschluessel, z.ist_steuer
    from public.fin_buchungszeilen z where z.buchung_id = b.id order by z.id;
  update public.fin_buchungen set storniert_durch = neu where id = b.id;
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;

create or replace function public.fin_monat_festschreiben(p_jahr integer, p_monat integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Berlin')::date;
  anzahl integer;
begin
  if not public.darf('finance.abschluss', 'schreiben') then
    raise exception 'Festschreiben ist für deine Rolle nicht freigeschaltet (Recht „Finance › Abschluss“ schreiben).';
  end if;
  if p_monat is null or p_monat < 1 or p_monat > 12 or p_jahr is null then raise exception 'Monat und Jahr angeben.'; end if;
  if make_date(p_jahr, p_monat, 1) > date_trunc('month', heute)::date then
    raise exception 'Ein Monat in der Zukunft wird nicht festgeschrieben.';
  end if;
  insert into public.fin_festschreibungen (jahr, monat) values (p_jahr, p_monat) on conflict do nothing;
  if not found then raise exception '%/% ist schon festgeschrieben.', lpad(p_monat::text, 2, '0'), p_jahr; end if;
  select count(*) into anzahl from public.fin_buchungen b where b.jahr = p_jahr and extract(month from b.datum)::integer = p_monat;
  return anzahl;
end;
$$;

-- Nur die drei Einstiege dürfen aufgerufen werden; die Bausteine nicht.
revoke all on function public.fin_naechste_nr(integer) from public, anon, authenticated;
revoke all on function public.fin_posten_schreiben(uuid, text, text, boolean, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.fin_buchbar(date) from public, anon, authenticated;
revoke all on function public.fin_buchen(date, text, text, jsonb) from public, anon;
revoke all on function public.fin_stornieren(uuid, text) from public, anon;
revoke all on function public.fin_monat_festschreiben(integer, integer) from public, anon;
grant execute on function public.fin_buchen(date, text, text, jsonb) to authenticated;
grant execute on function public.fin_stornieren(uuid, text) to authenticated;
grant execute on function public.fin_monat_festschreiben(integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Kontenrahmen eines bebuchten Jahres steht fest. `security definer`: Die Prüfung muss die
--    Buchungen sehen, auch wenn die ändernde Person „Buchungen lesen“ nicht hat.
-- ---------------------------------------------------------------------
create or replace function public.fin_einstellungen_sperre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.kontenrahmen is distinct from old.kontenrahmen or new.wj_beginn_monat is distinct from old.wj_beginn_monat)
     and exists (select 1 from public.fin_buchungen b where b.jahr = old.wirtschaftsjahr) then
    raise exception 'Für % gibt es schon Buchungen – Kontenrahmen und Beginn des Wirtschaftsjahres lassen sich nicht mehr ändern.', old.wirtschaftsjahr;
  end if;
  return new;
end;
$$;
drop trigger if exists fin_einstellungen_sperre on public.fin_einstellungen;
create trigger fin_einstellungen_sperre before update on public.fin_einstellungen
  for each row execute function public.fin_einstellungen_sperre();

-- ---------------------------------------------------------------------
-- 6. „Alle Daten löschen“: Konten und Steuerschlüssel bleiben (Stammdaten wie die Rechte).
-- ---------------------------------------------------------------------
create or replace function public.alle_daten_behalten()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['profiles', 'module_permissions', 'user_settings', 'push_geraete', 'app_stand', 'fin_konten', 'fin_steuerschluessel']::text[] $$;

-- ---------------------------------------------------------------------
-- 7. Konten und Steuerschlüssel. `on conflict do nothing`: Was schon da ist (auch ausgeblendet oder
--    umbenannt), bleibt beim zweiten Lauf, wie es ist.
-- ---------------------------------------------------------------------
insert into public.fin_konten (kontenrahmen, nummer, bezeichnung, kategorie) values
  ('skr03', 27, 'EDV-Software', 'anlage'),
  ('skr03', 210, 'Maschinen (Montier-, Wuchtmaschine)', 'anlage'),
  ('skr03', 320, 'Pkw', 'anlage'),
  ('skr03', 350, 'Lkw und Transporter', 'anlage'),
  ('skr03', 400, 'Betriebsausstattung', 'anlage'),
  ('skr03', 420, 'Büroeinrichtung', 'anlage'),
  ('skr03', 480, 'Geringwertige Wirtschaftsgüter', 'anlage'),
  ('skr03', 485, 'Wirtschaftsgüter im Sammelposten', 'anlage'),
  ('skr03', 800, 'Gezeichnetes Kapital (UG/GmbH)', 'kapital'),
  ('skr03', 880, 'Kapital (Einzelunternehmen)', 'kapital'),
  ('skr03', 1000, 'Kasse', 'geld'),
  ('skr03', 1200, 'Bank', 'geld'),
  ('skr03', 1360, 'Geldtransit', 'geld'),
  ('skr03', 1400, 'Forderungen aus Lieferungen und Leistungen', 'forderung'),
  ('skr03', 1571, 'Vorsteuer 7 %', 'steuer'),
  ('skr03', 1574, 'Vorsteuer innergemeinschaftlicher Erwerb 19 %', 'steuer'),
  ('skr03', 1576, 'Vorsteuer 19 %', 'steuer'),
  ('skr03', 1577, 'Vorsteuer § 13b 19 %', 'steuer'),
  ('skr03', 1590, 'Durchlaufende Posten', 'verbindlichkeit'),
  ('skr03', 1600, 'Verbindlichkeiten aus Lieferungen und Leistungen', 'verbindlichkeit'),
  ('skr03', 1740, 'Verbindlichkeiten aus Lohn und Gehalt', 'verbindlichkeit'),
  ('skr03', 1771, 'Umsatzsteuer 7 %', 'steuer'),
  ('skr03', 1774, 'Umsatzsteuer innergemeinschaftlicher Erwerb 19 %', 'steuer'),
  ('skr03', 1776, 'Umsatzsteuer 19 %', 'steuer'),
  ('skr03', 1780, 'Umsatzsteuer-Vorauszahlungen', 'steuer'),
  ('skr03', 1781, 'Umsatzsteuer-Sondervorauszahlung 1/11', 'steuer'),
  ('skr03', 1787, 'Umsatzsteuer § 13b 19 %', 'steuer'),
  ('skr03', 1790, 'Umsatzsteuer Vorjahr', 'steuer'),
  ('skr03', 1800, 'Privatentnahmen', 'privat'),
  ('skr03', 1890, 'Privateinlagen', 'privat'),
  ('skr03', 3123, 'Leistungen von EU-Unternehmern (§ 13b) 19 %', 'aufwand'),
  ('skr03', 3200, 'Wareneingang ohne Vorsteuer', 'aufwand'),
  ('skr03', 3300, 'Wareneingang 7 % Vorsteuer', 'aufwand'),
  ('skr03', 3400, 'Wareneingang 19 % Vorsteuer (Reifen, Ventile, Material)', 'aufwand'),
  ('skr03', 3425, 'Innergemeinschaftlicher Erwerb 19 %', 'aufwand'),
  ('skr03', 4110, 'Löhne', 'aufwand'),
  ('skr03', 4120, 'Gehälter', 'aufwand'),
  ('skr03', 4130, 'Gesetzliche soziale Aufwendungen', 'aufwand'),
  ('skr03', 4190, 'Aushilfslöhne', 'aufwand'),
  ('skr03', 4210, 'Miete', 'aufwand'),
  ('skr03', 4240, 'Gas, Strom, Wasser', 'aufwand'),
  ('skr03', 4360, 'Versicherungen', 'aufwand'),
  ('skr03', 4380, 'Beiträge', 'aufwand'),
  ('skr03', 4510, 'Kfz-Steuer', 'aufwand'),
  ('skr03', 4520, 'Kfz-Versicherungen', 'aufwand'),
  ('skr03', 4530, 'Laufende Kfz-Kosten (Kraftstoff)', 'aufwand'),
  ('skr03', 4540, 'Kfz-Reparaturen', 'aufwand'),
  ('skr03', 4580, 'Sonstige Kfz-Kosten', 'aufwand'),
  ('skr03', 4600, 'Werbekosten', 'aufwand'),
  ('skr03', 4650, 'Bewirtungskosten', 'aufwand'),
  ('skr03', 4670, 'Reisekosten Unternehmer', 'aufwand'),
  ('skr03', 4805, 'Reparaturen an Betriebs- und Geschäftsausstattung', 'aufwand'),
  ('skr03', 4806, 'Wartung Hard- und Software', 'aufwand'),
  ('skr03', 4830, 'Abschreibungen auf Sachanlagen', 'aufwand'),
  ('skr03', 4855, 'Sofortabschreibung geringwertiger Wirtschaftsgüter', 'aufwand'),
  ('skr03', 4900, 'Sonstige betriebliche Aufwendungen', 'aufwand'),
  ('skr03', 4910, 'Porto', 'aufwand'),
  ('skr03', 4920, 'Telefon', 'aufwand'),
  ('skr03', 4925, 'Internet', 'aufwand'),
  ('skr03', 4930, 'Bürobedarf', 'aufwand'),
  ('skr03', 4950, 'Rechts- und Beratungskosten', 'aufwand'),
  ('skr03', 4955, 'Buchführungskosten', 'aufwand'),
  ('skr03', 4970, 'Kosten des Geldverkehrs', 'aufwand'),
  ('skr03', 4980, 'Betriebsbedarf', 'aufwand'),
  ('skr03', 4985, 'Werkzeuge und Kleingeräte', 'aufwand'),
  ('skr03', 8125, 'Steuerfreie innergemeinschaftliche Lieferungen', 'erloes'),
  ('skr03', 8195, 'Erlöse als Kleinunternehmer (§ 19 UStG)', 'erloes'),
  ('skr03', 8200, 'Erlöse ohne Umsatzsteuer', 'erloes'),
  ('skr03', 8300, 'Erlöse 7 % USt', 'erloes'),
  ('skr03', 8337, 'Erlöse aus Leistungen nach § 13b (Empfänger schuldet die Steuer)', 'erloes'),
  ('skr03', 8400, 'Erlöse 19 % USt', 'erloes'),
  ('skr03', 9000, 'Saldenvorträge (Anfangsbestände)', 'vortrag')
on conflict (kontenrahmen, nummer) do nothing;

insert into public.fin_konten (kontenrahmen, nummer, bezeichnung, kategorie) values
  ('skr04', 135, 'EDV-Software', 'anlage'),
  ('skr04', 440, 'Maschinen (Montier-, Wuchtmaschine)', 'anlage'),
  ('skr04', 500, 'Betriebsausstattung', 'anlage'),
  ('skr04', 520, 'Pkw', 'anlage'),
  ('skr04', 540, 'Lkw und Transporter', 'anlage'),
  ('skr04', 650, 'Büroeinrichtung', 'anlage'),
  ('skr04', 670, 'Geringwertige Wirtschaftsgüter', 'anlage'),
  ('skr04', 675, 'Wirtschaftsgüter im Sammelposten', 'anlage'),
  ('skr04', 1200, 'Forderungen aus Lieferungen und Leistungen', 'forderung'),
  ('skr04', 1370, 'Durchlaufende Posten', 'verbindlichkeit'),
  ('skr04', 1401, 'Vorsteuer 7 %', 'steuer'),
  ('skr04', 1404, 'Vorsteuer innergemeinschaftlicher Erwerb 19 %', 'steuer'),
  ('skr04', 1406, 'Vorsteuer 19 %', 'steuer'),
  ('skr04', 1407, 'Vorsteuer § 13b 19 %', 'steuer'),
  ('skr04', 1460, 'Geldtransit', 'geld'),
  ('skr04', 1600, 'Kasse', 'geld'),
  ('skr04', 1800, 'Bank', 'geld'),
  ('skr04', 2010, 'Kapital (Einzelunternehmen)', 'kapital'),
  ('skr04', 2100, 'Privatentnahmen', 'privat'),
  ('skr04', 2180, 'Privateinlagen', 'privat'),
  ('skr04', 2900, 'Gezeichnetes Kapital (UG/GmbH)', 'kapital'),
  ('skr04', 3300, 'Verbindlichkeiten aus Lieferungen und Leistungen', 'verbindlichkeit'),
  ('skr04', 3720, 'Verbindlichkeiten aus Lohn und Gehalt', 'verbindlichkeit'),
  ('skr04', 3801, 'Umsatzsteuer 7 %', 'steuer'),
  ('skr04', 3804, 'Umsatzsteuer innergemeinschaftlicher Erwerb 19 %', 'steuer'),
  ('skr04', 3806, 'Umsatzsteuer 19 %', 'steuer'),
  ('skr04', 3820, 'Umsatzsteuer-Vorauszahlungen', 'steuer'),
  ('skr04', 3830, 'Umsatzsteuer-Sondervorauszahlung 1/11', 'steuer'),
  ('skr04', 3837, 'Umsatzsteuer § 13b 19 %', 'steuer'),
  ('skr04', 3840, 'Umsatzsteuer Vorjahr', 'steuer'),
  ('skr04', 4125, 'Steuerfreie innergemeinschaftliche Lieferungen', 'erloes'),
  ('skr04', 4185, 'Erlöse als Kleinunternehmer (§ 19 UStG)', 'erloes'),
  ('skr04', 4200, 'Erlöse ohne Umsatzsteuer', 'erloes'),
  ('skr04', 4300, 'Erlöse 7 % USt', 'erloes'),
  ('skr04', 4337, 'Erlöse aus Leistungen nach § 13b (Empfänger schuldet die Steuer)', 'erloes'),
  ('skr04', 4400, 'Erlöse 19 % USt', 'erloes'),
  ('skr04', 5200, 'Wareneingang ohne Vorsteuer', 'aufwand'),
  ('skr04', 5300, 'Wareneingang 7 % Vorsteuer', 'aufwand'),
  ('skr04', 5400, 'Wareneingang 19 % Vorsteuer (Reifen, Ventile, Material)', 'aufwand'),
  ('skr04', 5425, 'Innergemeinschaftlicher Erwerb 19 %', 'aufwand'),
  ('skr04', 5923, 'Leistungen von EU-Unternehmern (§ 13b) 19 %', 'aufwand'),
  ('skr04', 6010, 'Löhne', 'aufwand'),
  ('skr04', 6020, 'Gehälter', 'aufwand'),
  ('skr04', 6030, 'Aushilfslöhne', 'aufwand'),
  ('skr04', 6110, 'Gesetzliche soziale Aufwendungen', 'aufwand'),
  ('skr04', 6220, 'Abschreibungen auf Sachanlagen', 'aufwand'),
  ('skr04', 6260, 'Sofortabschreibung geringwertiger Wirtschaftsgüter', 'aufwand'),
  ('skr04', 6300, 'Sonstige betriebliche Aufwendungen', 'aufwand'),
  ('skr04', 6310, 'Miete', 'aufwand'),
  ('skr04', 6325, 'Gas, Strom, Wasser', 'aufwand'),
  ('skr04', 6400, 'Versicherungen', 'aufwand'),
  ('skr04', 6420, 'Beiträge', 'aufwand'),
  ('skr04', 6470, 'Reparaturen an Betriebs- und Geschäftsausstattung', 'aufwand'),
  ('skr04', 6495, 'Wartung Hard- und Software', 'aufwand'),
  ('skr04', 6520, 'Kfz-Versicherungen', 'aufwand'),
  ('skr04', 6530, 'Laufende Kfz-Kosten (Kraftstoff)', 'aufwand'),
  ('skr04', 6540, 'Kfz-Reparaturen', 'aufwand'),
  ('skr04', 6570, 'Sonstige Kfz-Kosten', 'aufwand'),
  ('skr04', 6600, 'Werbekosten', 'aufwand'),
  ('skr04', 6640, 'Bewirtungskosten', 'aufwand'),
  ('skr04', 6670, 'Reisekosten Unternehmer', 'aufwand'),
  ('skr04', 6800, 'Porto', 'aufwand'),
  ('skr04', 6805, 'Telefon', 'aufwand'),
  ('skr04', 6810, 'Internet', 'aufwand'),
  ('skr04', 6815, 'Bürobedarf', 'aufwand'),
  ('skr04', 6825, 'Rechts- und Beratungskosten', 'aufwand'),
  ('skr04', 6830, 'Buchführungskosten', 'aufwand'),
  ('skr04', 6845, 'Werkzeuge und Kleingeräte', 'aufwand'),
  ('skr04', 6850, 'Betriebsbedarf', 'aufwand'),
  ('skr04', 6855, 'Kosten des Geldverkehrs', 'aufwand'),
  ('skr04', 7685, 'Kfz-Steuer', 'aufwand'),
  ('skr04', 9000, 'Saldenvorträge (Anfangsbestände)', 'vortrag')
on conflict (kontenrahmen, nummer) do nothing;

insert into public.fin_steuerschluessel (kontenrahmen, schluessel, bezeichnung, satz, art, ust_konto, vst_konto) values
  ('skr03', 'ust19', 'Umsatzsteuer 19 %', 19, 'ust', 1776, null),
  ('skr04', 'ust19', 'Umsatzsteuer 19 %', 19, 'ust', 3806, null),
  ('skr03', 'ust7', 'Umsatzsteuer 7 %', 7, 'ust', 1771, null),
  ('skr04', 'ust7', 'Umsatzsteuer 7 %', 7, 'ust', 3801, null),
  ('skr03', 'vst19', 'Vorsteuer 19 %', 19, 'vst', null, 1576),
  ('skr04', 'vst19', 'Vorsteuer 19 %', 19, 'vst', null, 1406),
  ('skr03', 'vst7', 'Vorsteuer 7 %', 7, 'vst', null, 1571),
  ('skr04', 'vst7', 'Vorsteuer 7 %', 7, 'vst', null, 1401),
  ('skr03', 'r13b19', '§ 13b – Steuer schuldet der Empfänger, 19 %', 19, 'r13b', 1787, 1577),
  ('skr04', 'r13b19', '§ 13b – Steuer schuldet der Empfänger, 19 %', 19, 'r13b', 3837, 1407),
  ('skr03', 'ige19', 'Innergemeinschaftlicher Erwerb 19 %', 19, 'ige', 1774, 1574),
  ('skr04', 'ige19', 'Innergemeinschaftlicher Erwerb 19 %', 19, 'ige', 3804, 1404),
  ('skr03', 'igl', 'Innergemeinschaftliche Lieferung, steuerfrei', 0, 'ohne', null, null),
  ('skr04', 'igl', 'Innergemeinschaftliche Lieferung, steuerfrei', 0, 'ohne', null, null),
  ('skr03', 'frei', 'Steuerfrei', 0, 'ohne', null, null),
  ('skr04', 'frei', 'Steuerfrei', 0, 'ohne', null, null),
  ('skr03', 'ku', 'Kleinunternehmer § 19 – ohne Umsatzsteuer', 0, 'ohne', null, null),
  ('skr04', 'ku', 'Kleinunternehmer § 19 – ohne Umsatzsteuer', 0, 'ohne', null, null)
on conflict (kontenrahmen, schluessel) do nothing;

-- ---------------------------------------------------------------------
-- 8. Kontrolle – eine Ergebnistabelle.
-- ---------------------------------------------------------------------
select 'Konten SKR03 / SKR04' as pruefung,
       (select count(*) from public.fin_konten where kontenrahmen = 'skr03')::text || ' / ' ||
       (select count(*) from public.fin_konten where kontenrahmen = 'skr04')::text as ergebnis
union all
select 'Steuerschlüssel je Kontenrahmen',
       (select count(*) from public.fin_steuerschluessel where kontenrahmen = 'skr03')::text || ' / ' ||
       (select count(*) from public.fin_steuerschluessel where kontenrahmen = 'skr04')::text
union all
select 'Journal (RLS)',
       coalesce((select string_agg(c.relname || case when c.relrowsecurity then ' an' else ' AUS' end, ', ' order by c.relname)
                   from pg_class c join pg_namespace s on s.oid = c.relnamespace
                  where s.nspname = 'public' and c.relname in ('fin_buchungen', 'fin_buchungszeilen', 'fin_nummern', 'fin_festschreibungen', 'fin_konten', 'fin_steuerschluessel')), 'fehlt')
union all
select 'Richtlinien Finance',
       coalesce((select string_agg(p.tablename || ': ' || p.cmd, ', ' order by p.tablename, p.cmd) from pg_policies p
                  where p.schemaname = 'public' and p.tablename like 'fin\_%' and p.tablename <> 'fin_einstellungen'), 'keine')
union all
select 'Funktionen', (select string_agg(x, ', ') from unnest(array['fin_buchen(date,text,text,jsonb)', 'fin_stornieren(uuid,text)', 'fin_monat_festschreiben(integer,integer)']) x
                       where to_regprocedure('public.' || x) is not null)
union all
select 'Bleibt bei „Alle Daten löschen“', array_to_string(public.alle_daten_behalten(), ', ');
