-- =====================================================================
-- Migration 91 – Finance, Phase F4: Bankkonten, Kontoauszug-Import, Abgleich (13.10.2026, v149).
--
-- docs/finance.md Abschnitt 4.3, schlank:
--
--   1. BANKKONTEN `fin_bankkonten`: Name, IBAN, Sachkonto (1200/1800 oder ein anderes Geldkonto).
--   2. UMSÄTZE `fin_bankumsaetze` aus dem Kontoauszug (CAMT.053 oder CSV – gelesen im Browser,
--      lib/finance/bank.ts). `fin_bank_einlesen()` erkennt Umsätze, die schon da sind (Prüfsumme je Konto,
--      gleiche Umsätze im selben Auszug werden mitgezählt), und merkt sich den Import (`fin_bankimporte`,
--      mit Endsaldo laut Bank, wenn die Datei ihn nennt).
--   3. ABGLEICH: Umsatz → Rechnung (Bank an Forderung, Rechnung bezahlt), → Beleg (Verbindlichkeit an
--      Bank, Beleg bezahlt), → Konto (Miete, Gebühren, Privat … – mit Steuerschlüssel über
--      `fin_posten_schreiben()`), oder ignorieren. Aufheben bucht gegen und setzt den Umsatz zurück.
--   4. Wird eine Zahlungs- oder Bankbuchung anderswo storniert (Zahlung zurücknehmen an Rechnung/Beleg),
--      setzt ein Trigger den Umsatz wieder auf „offen“.
--   5. Ein Import lässt sich zurücknehmen, solange keiner seiner Umsätze zugeordnet ist (Recht „löschen“).
--
-- Kontoauszüge enthalten Namen und IBANs der Zahlenden – nötig für den Abgleich, sichtbar nur mit
-- „Finance › Bank“. PILOT wie alles in Finance. Reihenfolge: nach 90, SQL zuerst, dann v149. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_belege') is null then
    raise exception 'Zuerst Migration 90 (Finance: Belege) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
alter table public.fin_buchungen add constraint fin_buchung_quelle check (quelle in ('manuell', 'rechnung', 'zahlung', 'beleg', 'bank'));

-- ---------------------------------------------------------------------
-- 1. Bankkonten
-- ---------------------------------------------------------------------
create table if not exists public.fin_bankkonten (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  iban        text,
  konto       integer not null,
  aktiv       boolean not null default true,
  erstellt_am timestamptz not null default now(),
  constraint fin_bk_name  check (length(btrim(name)) between 1 and 80),
  constraint fin_bk_iban  check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  constraint fin_bk_konto check (konto between 1 and 9999)
);
create unique index if not exists fin_bankkonten_iban on public.fin_bankkonten (iban) where iban is not null;
alter table public.fin_bankkonten enable row level security;
drop policy if exists "Finance-Bankkonten lesen" on public.fin_bankkonten;
create policy "Finance-Bankkonten lesen" on public.fin_bankkonten for select to authenticated using (public.darf('finance.bank', 'lesen'));
drop policy if exists "Finance-Bankkonten anlegen" on public.fin_bankkonten;
create policy "Finance-Bankkonten anlegen" on public.fin_bankkonten for insert to authenticated with check (public.darf('finance.bank', 'schreiben'));
drop policy if exists "Finance-Bankkonten ändern" on public.fin_bankkonten;
create policy "Finance-Bankkonten ändern" on public.fin_bankkonten for update to authenticated
  using (public.darf('finance.bank', 'schreiben')) with check (public.darf('finance.bank', 'schreiben'));
revoke all on public.fin_bankkonten from anon, authenticated;
grant select on public.fin_bankkonten to authenticated;
grant insert (id, name, iban, konto) on public.fin_bankkonten to authenticated;
grant update (name, iban, konto, aktiv) on public.fin_bankkonten to authenticated;

-- ---------------------------------------------------------------------
-- 2. Importe und Umsätze
-- ---------------------------------------------------------------------
create table if not exists public.fin_bankimporte (
  id           uuid primary key default gen_random_uuid(),
  bankkonto_id uuid not null references public.fin_bankkonten (id),
  dateiname    text,
  format       text not null,
  anzahl       integer not null default 0,
  neu          integer not null default 0,
  von          date,
  bis          date,
  endsaldo     numeric(14,2),
  endsaldo_am  date,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  constraint fin_bi_format check (format in ('camt', 'csv'))
);

create table if not exists public.fin_bankumsaetze (
  id               uuid primary key default gen_random_uuid(),
  bankkonto_id     uuid not null references public.fin_bankkonten (id),
  import_id        uuid references public.fin_bankimporte (id) on delete cascade,
  datum            date not null,
  valuta           date,
  betrag           numeric(14,2) not null,
  zweck            text,
  name             text,
  iban             text,
  referenz         text,
  pruefsumme       text not null,
  status           text not null default 'offen',
  zuordnung        text,
  zuordnung_id     uuid,
  buchung_id       uuid references public.fin_buchungen (id),
  notiz            text,
  constraint fin_bu_status    check (status in ('offen', 'zugeordnet', 'ignoriert')),
  constraint fin_bu_zuordnung check (zuordnung is null or zuordnung in ('rechnung', 'beleg', 'konto')),
  constraint fin_bu_betrag    check (betrag <> 0),
  constraint fin_bu_zweck     check (zweck is null or length(zweck) <= 500)
);
create unique index if not exists fin_bankumsaetze_einmal on public.fin_bankumsaetze (bankkonto_id, pruefsumme);
create index if not exists fin_bankumsaetze_datum on public.fin_bankumsaetze (bankkonto_id, datum);
create index if not exists fin_bankumsaetze_buchung on public.fin_bankumsaetze (buchung_id);
comment on table public.fin_bankumsaetze is
  'Migration 91: Umsätze aus Kontoauszügen. Schreiben nur über Funktionen. Enthält Namen/IBANs der Zahlenden – nur mit finance.bank.';

alter table public.fin_bankimporte enable row level security;
alter table public.fin_bankumsaetze enable row level security;
drop policy if exists "Finance-Bankimporte lesen" on public.fin_bankimporte;
create policy "Finance-Bankimporte lesen" on public.fin_bankimporte for select to authenticated using (public.darf('finance.bank', 'lesen'));
drop policy if exists "Finance-Bankumsätze lesen" on public.fin_bankumsaetze;
create policy "Finance-Bankumsätze lesen" on public.fin_bankumsaetze for select to authenticated using (public.darf('finance.bank', 'lesen'));
revoke all on public.fin_bankimporte, public.fin_bankumsaetze from anon, authenticated;
grant select on public.fin_bankimporte, public.fin_bankumsaetze to authenticated;

-- ---------------------------------------------------------------------
-- 3. Einlesen
--    p_umsaetze: [{ "datum": "2026-10-01", "valuta": "2026-10-01", "betrag": -59.5, "zweck": "…", "name": "…",
--                   "iban": "DE…", "referenz": "…" }] – Vorzeichen: + Eingang, − Ausgang.
-- ---------------------------------------------------------------------
create or replace function public.fin_bank_einlesen(p_bankkonto uuid, p_dateiname text, p_format text, p_umsaetze jsonb,
  p_endsaldo numeric default null, p_endsaldo_am date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  imp uuid;
  n_gesamt integer;
  n_neu integer;
  d_von date; d_bis date;
begin
  if not public.darf('finance.bank', 'schreiben') then
    raise exception 'Kontoauszüge einlesen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Bank“ schreiben).';
  end if;
  if not exists (select 1 from public.fin_bankkonten where id = p_bankkonto and aktiv) then
    raise exception 'Dieses Bankkonto gibt es nicht oder es ist ausgeblendet.';
  end if;
  if p_format is null or p_format not in ('camt', 'csv') then raise exception 'Unbekanntes Dateiformat.'; end if;
  if jsonb_typeof(p_umsaetze) is distinct from 'array' or jsonb_array_length(p_umsaetze) = 0 then
    raise exception 'In der Datei steht kein Umsatz.';
  end if;
  if jsonb_array_length(p_umsaetze) > 5000 then raise exception 'Höchstens 5.000 Umsätze je Datei.'; end if;
  if exists (select 1 from jsonb_array_elements(p_umsaetze) u
              where (u ->> 'datum') is null or (u ->> 'betrag') is null or (u ->> 'betrag')::numeric = 0) then
    raise exception 'Mindestens ein Umsatz hat kein Datum oder keinen Betrag.';
  end if;

  insert into public.fin_bankimporte (bankkonto_id, dateiname, format, endsaldo, endsaldo_am)
  values (p_bankkonto, left(p_dateiname, 200), p_format, p_endsaldo, p_endsaldo_am) returning id into imp;

  with roh as (
    select (u ->> 'datum')::date as datum, nullif(u ->> 'valuta', '')::date as valuta, round((u ->> 'betrag')::numeric, 2) as betrag,
           left(nullif(btrim(u ->> 'zweck'), ''), 500) as zweck, left(nullif(btrim(u ->> 'name'), ''), 140) as name,
           nullif(upper(replace(u ->> 'iban', ' ', '')), '') as iban, left(nullif(btrim(u ->> 'referenz'), ''), 140) as referenz, ord
      from jsonb_array_elements(p_umsaetze) with ordinality as x(u, ord)
  ), grund as (
    select *, md5(concat_ws('|', datum, betrag, lower(regexp_replace(coalesce(zweck, ''), '\s+', ' ', 'g')),
                            coalesce(iban, ''), coalesce(referenz, ''), lower(coalesce(name, '')))) as basis
      from roh
  ), gezaehlt as (
    -- Zwei gleiche Umsätze im selben Auszug (zweimal 4,50 € beim selben Bäcker) sind zwei Umsätze.
    select *, basis || '-' || row_number() over (partition by basis order by ord) as pruefsumme from grund
  ), rein as (
    insert into public.fin_bankumsaetze (bankkonto_id, import_id, datum, valuta, betrag, zweck, name, iban, referenz, pruefsumme)
    select p_bankkonto, imp, datum, valuta, betrag, zweck, name, iban, referenz, pruefsumme from gezaehlt
    on conflict (bankkonto_id, pruefsumme) do nothing
    returning 1
  )
  select (select count(*) from roh), (select count(*) from rein), (select min(datum) from roh), (select max(datum) from roh)
    into n_gesamt, n_neu, d_von, d_bis;

  update public.fin_bankimporte set anzahl = n_gesamt, neu = n_neu, von = d_von, bis = d_bis where id = imp;
  return jsonb_build_object('import_id', imp, 'anzahl', n_gesamt, 'neu', n_neu, 'doppelt', n_gesamt - n_neu);
end;
$$;

-- Import zurücknehmen, solange nichts davon zugeordnet ist.
create or replace function public.fin_bank_import_zuruecknehmen(p_import uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.darf('finance.bank', 'loeschen') then
    raise exception 'Einen Import zurücknehmen darf nur, wer „Finance › Bank“ löschen darf.';
  end if;
  if exists (select 1 from public.fin_bankumsaetze where import_id = p_import and status = 'zugeordnet') then
    raise exception 'Aus diesem Import ist schon etwas zugeordnet – erst die Zuordnungen aufheben.';
  end if;
  delete from public.fin_bankumsaetze where import_id = p_import;
  get diagnostics n = row_count;
  delete from public.fin_bankimporte where id = p_import;
  if not found then raise exception 'Diesen Import gibt es nicht.'; end if;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Abgleich
-- ---------------------------------------------------------------------
-- Gemeinsamer Anfang: Recht, Umsatz offen, Bankkonto, Einstellungen am Umsatzdatum.
create or replace function public.fin_bank_umsatz_holen(p_umsatz uuid, out u public.fin_bankumsaetze, out sachkonto integer, out e public.fin_einstellungen)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.bank', 'schreiben') then
    raise exception 'Zuordnen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Bank“ schreiben).';
  end if;
  select * into u from public.fin_bankumsaetze where id = p_umsatz for update;
  if u.id is null then raise exception 'Diesen Umsatz gibt es nicht.'; end if;
  if u.status <> 'offen' then raise exception 'Dieser Umsatz ist schon zugeordnet oder ignoriert.'; end if;
  select konto into sachkonto from public.fin_bankkonten where id = u.bankkonto_id;
  e := public.fin_buchbar(u.datum);
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = sachkonto and k.aktiv) then
    raise exception 'Das Sachkonto % des Bankkontos gibt es im % nicht oder es ist ausgeblendet.', lpad(sachkonto::text, 4, '0'), upper(e.kontenrahmen);
  end if;
end;
$$;

create or replace function public.fin_bank_zu_rechnung(p_umsatz uuid, p_rechnung uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  fr public.fin_rechnungen%rowtype;
  r public.rechnungen%rowtype;
  neu uuid; n integer;
begin
  h := public.fin_bank_umsatz_holen(p_umsatz);
  if (h.u).betrag <= 0 then raise exception 'Eine Rechnung wird mit einem Zahlungseingang ausgeglichen, nicht mit einer Abbuchung.'; end if;
  select * into fr from public.fin_rechnungen where rechnung_id = p_rechnung for update;
  if fr.rechnung_id is null or fr.status <> 'gebucht' then raise exception 'Die Rechnung ist in Finance nicht gebucht.'; end if;
  if fr.bezahlt_am is not null then raise exception 'Diese Rechnung ist schon als bezahlt erfasst.'; end if;
  select * into r from public.rechnungen where id = p_rechnung;
  if r.brutto <> (h.u).betrag then
    raise exception 'Betrag passt nicht: Rechnung % €, Zahlung % € – Teilzahlungen kommen später.', r.brutto, (h.u).betrag;
  end if;
  n := public.fin_naechste_nr((h.e).wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values ((h.e).wirtschaftsjahr, n, (h.u).datum, left('Zahlungseingang ' || r.nummer_text, 200), r.nummer_text, 'zahlung', r.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', h.sachkonto, r.brutto), (neu, 1, 'H', public.fin_rechnung_konto((h.e).kontenrahmen, 'forderung'), r.brutto);
  update public.fin_rechnungen set bezahlt_am = (h.u).datum, bezahlt_art = 'bank', zahlung_buchung_id = neu, aktualisiert_am = now()
   where rechnung_id = p_rechnung;
  update public.fin_bankumsaetze set status = 'zugeordnet', zuordnung = 'rechnung', zuordnung_id = p_rechnung, buchung_id = neu where id = p_umsatz;
  return jsonb_build_object('id', neu, 'nr', n);
end;
$$;

create or replace function public.fin_bank_zu_beleg(p_umsatz uuid, p_beleg uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  b public.fin_belege%rowtype;
  neu uuid; n integer;
begin
  h := public.fin_bank_umsatz_holen(p_umsatz);
  if (h.u).betrag >= 0 then raise exception 'Ein Beleg wird mit einer Abbuchung bezahlt, nicht mit einem Zahlungseingang.'; end if;
  select * into b from public.fin_belege where id = p_beleg for update;
  if b.id is null or b.status <> 'gebucht' then raise exception 'Der Beleg ist nicht gebucht.'; end if;
  if b.bezahlt_am is not null then raise exception 'Dieser Beleg ist schon als bezahlt erfasst.'; end if;
  if b.brutto <> -(h.u).betrag then
    raise exception 'Betrag passt nicht: Beleg % €, Abbuchung % € – Teilzahlungen kommen später.', b.brutto, -(h.u).betrag;
  end if;
  n := public.fin_naechste_nr((h.e).wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values ((h.e).wirtschaftsjahr, n, (h.u).datum,
          left('Überweisung: ' || coalesce(nullif(b.belegnummer, ''), 'Beleg') || coalesce(' · ' || (select l.name from public.fin_lieferanten l where l.id = b.lieferant_id), ''), 200),
          b.belegnummer, 'zahlung', b.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', public.fin_rechnung_konto((h.e).kontenrahmen, 'verbindlichkeit'), b.brutto), (neu, 1, 'H', h.sachkonto, b.brutto);
  update public.fin_belege set bezahlt_am = (h.u).datum, bezahlt_art = 'bank', zahlung_buchung_id = neu where id = b.id;
  update public.fin_bankumsaetze set status = 'zugeordnet', zuordnung = 'beleg', zuordnung_id = p_beleg, buchung_id = neu where id = p_umsatz;
  return jsonb_build_object('id', neu, 'nr', n);
end;
$$;

-- Auf ein Konto (Miete, Gebühren, Privat, Geldtransit …). Steuerschlüssel wie in fin_buchen().
create or replace function public.fin_bank_zu_konto(p_umsatz uuid, p_konto integer, p_steuer text, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  neu uuid; n integer;
  betrag numeric;
begin
  h := public.fin_bank_umsatz_holen(p_umsatz);
  if p_konto is null then raise exception 'Das Gegenkonto fehlt.'; end if;
  if p_konto = h.sachkonto then raise exception 'Gegenkonto und Bankkonto sind dasselbe.'; end if;
  betrag := abs((h.u).betrag);
  n := public.fin_naechste_nr((h.e).wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values ((h.e).wirtschaftsjahr, n, (h.u).datum,
          left(coalesce(nullif(btrim(p_text), ''), coalesce((h.u).name, 'Bank') || coalesce(': ' || (h.u).zweck, '')), 200), null, 'bank', (h.u).id)
  returning id into neu;
  perform public.fin_posten_schreiben(neu, (h.e).kontenrahmen, (h.e).besteuerung, (h.e).r13b_empfaenger, (h.e).innergemeinschaftlich,
    jsonb_build_array(jsonb_build_object(
      'soll', case when (h.u).betrag > 0 then h.sachkonto else p_konto end,
      'haben', case when (h.u).betrag > 0 then p_konto else h.sachkonto end,
      'betrag', betrag, 'steuer', nullif(btrim(coalesce(p_steuer, '')), ''))));
  update public.fin_bankumsaetze set status = 'zugeordnet', zuordnung = 'konto', zuordnung_id = null, buchung_id = neu where id = p_umsatz;
  return jsonb_build_object('id', neu, 'nr', n);
end;
$$;

create or replace function public.fin_bank_ignorieren(p_umsatz uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.bank', 'schreiben') then
    raise exception 'Zuordnen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Bank“ schreiben).';
  end if;
  if coalesce(btrim(p_grund), '') = '' then raise exception 'Bitte einen Grund angeben (z. B. „schon von Hand gebucht“).'; end if;
  update public.fin_bankumsaetze set status = 'ignoriert', notiz = left(btrim(p_grund), 200) where id = p_umsatz and status = 'offen';
  if not found then raise exception 'Nur ein offener Umsatz lässt sich ignorieren.'; end if;
end;
$$;

-- Zuordnung aufheben: gegenbuchen (bei Rechnung/Beleg wird die Zahlung zurückgenommen), Umsatz wieder offen.
create or replace function public.fin_bank_aufheben(p_umsatz uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.fin_bankumsaetze%rowtype;
begin
  if not public.darf('finance.bank', 'schreiben') then
    raise exception 'Zuordnen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Bank“ schreiben).';
  end if;
  select * into u from public.fin_bankumsaetze where id = p_umsatz for update;
  if u.id is null then raise exception 'Diesen Umsatz gibt es nicht.'; end if;
  if u.status = 'ignoriert' then
    update public.fin_bankumsaetze set status = 'offen', notiz = null where id = u.id;
    return;
  end if;
  if u.status <> 'zugeordnet' then raise exception 'Dieser Umsatz ist nicht zugeordnet.'; end if;
  perform public.fin_gegenbuchung(u.buchung_id, p_grund, null, null);
  if u.zuordnung = 'rechnung' then
    update public.fin_rechnungen set bezahlt_am = null, bezahlt_art = null, zahlung_buchung_id = null, aktualisiert_am = now()
     where rechnung_id = u.zuordnung_id and zahlung_buchung_id = u.buchung_id;
  elsif u.zuordnung = 'beleg' then
    update public.fin_belege set bezahlt_am = null, bezahlt_art = null, zahlung_buchung_id = null
     where id = u.zuordnung_id and zahlung_buchung_id = u.buchung_id;
  end if;
  -- Den Umsatz setzt der Trigger unten zurück (die Buchung ist jetzt storniert).
end;
$$;

-- Wird eine Buchung storniert, an der ein Umsatz hängt (auch über „Zahlung zurücknehmen“ an Rechnung oder
-- Beleg), ist der Umsatz wieder offen.
create or replace function public.fin_bank_nach_storno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.storniert_durch is not null and old.storniert_durch is null then
    update public.fin_bankumsaetze set status = 'offen', zuordnung = null, zuordnung_id = null, buchung_id = null where buchung_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists fin_bank_nach_storno on public.fin_buchungen;
create trigger fin_bank_nach_storno after update of storniert_durch on public.fin_buchungen
  for each row execute function public.fin_bank_nach_storno();

-- Von Hand stornieren (88–90): Bankbuchungen gehen über „Zuordnung aufheben“.
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
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;

revoke all on function public.fin_bank_umsatz_holen(uuid) from public, anon, authenticated;
revoke all on function public.fin_bank_nach_storno() from public, anon, authenticated;
revoke all on function public.fin_bank_einlesen(uuid, text, text, jsonb, numeric, date) from public, anon;
revoke all on function public.fin_bank_import_zuruecknehmen(uuid) from public, anon;
revoke all on function public.fin_bank_zu_rechnung(uuid, uuid) from public, anon;
revoke all on function public.fin_bank_zu_beleg(uuid, uuid) from public, anon;
revoke all on function public.fin_bank_zu_konto(uuid, integer, text, text) from public, anon;
revoke all on function public.fin_bank_ignorieren(uuid, text) from public, anon;
revoke all on function public.fin_bank_aufheben(uuid, text) from public, anon;
revoke all on function public.fin_stornieren(uuid, text) from public, anon;
grant execute on function public.fin_bank_einlesen(uuid, text, text, jsonb, numeric, date) to authenticated;
grant execute on function public.fin_bank_import_zuruecknehmen(uuid) to authenticated;
grant execute on function public.fin_bank_zu_rechnung(uuid, uuid) to authenticated;
grant execute on function public.fin_bank_zu_beleg(uuid, uuid) to authenticated;
grant execute on function public.fin_bank_zu_konto(uuid, integer, text, text) to authenticated;
grant execute on function public.fin_bank_ignorieren(uuid, text) to authenticated;
grant execute on function public.fin_bank_aufheben(uuid, text) to authenticated;
grant execute on function public.fin_stornieren(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Kontrolle – eine Ergebnistabelle.
-- ---------------------------------------------------------------------
select 'Tabellen (RLS)' as pruefung,
       coalesce((select string_agg(c.relname || case when c.relrowsecurity then ' an' else ' AUS' end, ', ' order by c.relname)
                   from pg_class c join pg_namespace s on s.oid = c.relnamespace
                  where s.nspname = 'public' and c.relname in ('fin_bankkonten', 'fin_bankimporte', 'fin_bankumsaetze')), 'fehlt') as ergebnis
union all
select 'Richtlinien', coalesce((select string_agg(p.tablename || ': ' || p.cmd, ', ' order by p.tablename, p.cmd) from pg_policies p
                                 where p.schemaname = 'public' and p.tablename in ('fin_bankkonten', 'fin_bankimporte', 'fin_bankumsaetze')), 'keine')
union all
select 'Trigger an fin_buchungen', coalesce((select string_agg(t.tgname, ', ' order by t.tgname) from pg_trigger t
                                              where t.tgrelid = 'public.fin_buchungen'::regclass and not t.tgisinternal), 'keine')
union all
select 'Funktionen', (select count(*)::text || ' von 7' from unnest(array['fin_bank_einlesen(uuid,text,text,jsonb,numeric,date)', 'fin_bank_import_zuruecknehmen(uuid)',
                       'fin_bank_zu_rechnung(uuid,uuid)', 'fin_bank_zu_beleg(uuid,uuid)', 'fin_bank_zu_konto(uuid,integer,text,text)',
                       'fin_bank_ignorieren(uuid,text)', 'fin_bank_aufheben(uuid,text)']) x where to_regprocedure('public.' || x) is not null);
