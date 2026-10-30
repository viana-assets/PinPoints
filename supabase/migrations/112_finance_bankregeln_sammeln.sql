-- =====================================================================
-- Migration 112 – Finance, Stufe E (Teil 1): Bankregeln, Sammelzuordnung mit Differenz, Kostenstellen im Bankabgleich
-- (30.10.2026, v185).
--
-- docs/finance.md Abschnitt 17.
--
--   1. Bankregeln (`fin_bankregeln`): Wenn Name, Verwendungszweck oder IBAN eines Umsatzes passen, schlägt Finance Konto,
--      Steuer, Text und Kostenstellen vor. Gebucht wird NIE von selbst – auch „Nach Regeln buchen“ bucht nur, was man in
--      der Liste davor bestätigt. Pflege mit „Finance › Bank“ schreiben.
--   2. `fin_bank_zu_konto()` nimmt Kostenstellen (KOST1/KOST2) an; die alte Fassung ohne wird entfernt, nachdem die neue
--      steht (die App bis v184 ruft sie mit vier Angaben – das geht mit der neuen weiter).
--   3. Sammelzuordnung (`fin_bank_sammeln()`): EIN Umsatz auf mehrere Rechnungen bzw. Belege, je mit eigenem Betrag (auch
--      Teilzahlung), je auf Wunsch mit Skonto, und ein Rest auf ein Konto (Gebühr abgezogen, Überzahlung, Kleindifferenz).
--      Jede Rechnung bekommt ihre eigene Zahlungsbuchung (wie bisher, mit Debitor), der Rest eine Bankbuchung; alles hängt in
--      `fin_bank_teile` am Umsatz. Aufheben bucht alle Teile gegen; einzeln an der Rechnung zurücknehmen geht dann nicht.
--
-- Reihenfolge: nach 111, SQL zuerst, dann v185. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_artikel_kost') is null or to_regclass('public.fin_teilzahlungen') is null then
    raise exception 'Zuerst Migration 111 (Finance: alle Rechnungen) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Bankregeln
-- ---------------------------------------------------------------------
create table if not exists public.fin_bankregeln (
  id             uuid primary key default gen_random_uuid(),
  bezeichnung    text not null,
  richtung       text not null default 'beide',
  name_enthaelt  text,
  zweck_enthaelt text,
  iban           text,
  konto          integer not null,
  steuer         text,
  text           text,
  kost1          text,
  kost2          text,
  aktiv          boolean not null default true,
  erstellt_am    timestamptz not null default now(),
  geaendert_am   timestamptz,
  constraint fin_br_bez check (length(btrim(bezeichnung)) between 1 and 80),
  constraint fin_br_richtung check (richtung in ('ein', 'aus', 'beide')),
  constraint fin_br_bedingung check (coalesce(btrim(name_enthaelt), '') <> '' or coalesce(btrim(zweck_enthaelt), '') <> '' or coalesce(btrim(iban), '') <> ''),
  constraint fin_br_konto check (konto between 1 and 9999),
  constraint fin_br_text check (text is null or length(text) <= 200)
);
alter table public.fin_bankregeln enable row level security;
drop policy if exists "Finance-Bankregeln lesen" on public.fin_bankregeln;
create policy "Finance-Bankregeln lesen" on public.fin_bankregeln for select to authenticated using (public.darf('finance.bank', 'lesen'));
revoke all on public.fin_bankregeln from anon, authenticated;
grant select on public.fin_bankregeln to authenticated;
comment on table public.fin_bankregeln is
  'Migration 112: Regeln für den Bankabgleich (Name/Zweck/IBAN → Konto, Steuer, Text, Kostenstellen). Nur Vorschlag, gebucht wird nach Bestätigung. docs/finance.md Abschnitt 17.';

create or replace function public.fin_bankregel_speichern(p_id uuid, p_bezeichnung text, p_richtung text, p_name text, p_zweck text, p_iban text,
  p_konto integer, p_steuer text, p_text text, p_kost1 text, p_kost2 text, p_aktiv boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  neu uuid;
  k1 text := public.fin_kost('kost1', p_kost1);
  k2 text := public.fin_kost('kost2', p_kost2);
  v_iban text := nullif(upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g')), '');
begin
  if not public.darf('finance.bank', 'schreiben') then
    raise exception 'Bankregeln pflegen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Bank“ schreiben).';
  end if;
  if coalesce(btrim(p_bezeichnung), '') = '' or length(btrim(p_bezeichnung)) > 80 then raise exception 'Die Bezeichnung fehlt (höchstens 80 Zeichen).'; end if;
  if coalesce(p_richtung, '') not in ('ein', 'aus', 'beide') then raise exception 'Eingang, Abbuchung oder beides wählen.'; end if;
  if coalesce(btrim(p_name), '') = '' and coalesce(btrim(p_zweck), '') = '' and v_iban is null then
    raise exception 'Mindestens eine Bedingung: Name, Verwendungszweck oder IBAN.';
  end if;
  if p_konto is null or p_konto not between 1 and 9999 then raise exception 'Das Konto fehlt.'; end if;
  if p_id is null then
    insert into public.fin_bankregeln (bezeichnung, richtung, name_enthaelt, zweck_enthaelt, iban, konto, steuer, text, kost1, kost2, aktiv)
    values (btrim(p_bezeichnung), p_richtung, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_zweck, '')), ''), v_iban, p_konto,
            nullif(btrim(coalesce(p_steuer, '')), ''), nullif(left(btrim(coalesce(p_text, '')), 200), ''), k1, k2, coalesce(p_aktiv, true))
    returning id into neu;
    return neu;
  end if;
  update public.fin_bankregeln
     set bezeichnung = btrim(p_bezeichnung), richtung = p_richtung, name_enthaelt = nullif(btrim(coalesce(p_name, '')), ''),
         zweck_enthaelt = nullif(btrim(coalesce(p_zweck, '')), ''), iban = v_iban, konto = p_konto, steuer = nullif(btrim(coalesce(p_steuer, '')), ''),
         text = nullif(left(btrim(coalesce(p_text, '')), 200), ''), kost1 = k1, kost2 = k2, aktiv = coalesce(p_aktiv, true), geaendert_am = now()
   where id = p_id;
  if not found then raise exception 'Diese Regel gibt es nicht (mehr).'; end if;
  return p_id;
end;
$$;

create or replace function public.fin_bankregel_loeschen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.bank', 'schreiben') then
    raise exception 'Bankregeln pflegen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Bank“ schreiben).';
  end if;
  delete from public.fin_bankregeln where id = p_id;
  if not found then raise exception 'Diese Regel gibt es nicht (mehr).'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Auf ein Konto – jetzt mit Kostenstellen
-- ---------------------------------------------------------------------
-- Setzt KOST1/KOST2 an die Erlös-, Aufwands- oder Anlagezeilen einer Buchung (wie fin_buchen() in Migration 108).
create or replace function public.fin_kost_an_buchung(p_buchung uuid, p_rahmen text, p_kost1 text, p_kost2 text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k1 text := public.fin_kost('kost1', p_kost1);
  k2 text := public.fin_kost('kost2', p_kost2);
begin
  if k1 is null and k2 is null then return; end if;
  update public.fin_buchungszeilen z set kost1 = k1, kost2 = k2
   where z.buchung_id = p_buchung and not z.ist_steuer
     and exists (select 1 from public.fin_konten k where k.kontenrahmen = p_rahmen and k.nummer = z.konto and k.kategorie in ('erloes', 'aufwand', 'anlage'));
  if not found then
    raise exception 'Eine Kostenstelle gehört an ein Erlös-, Aufwands- oder Anlagekonto – hier ist keins.';
  end if;
end;
$$;

create or replace function public.fin_bank_zu_konto(p_umsatz uuid, p_konto integer, p_steuer text, p_text text,
  p_kost1 text default null, p_kost2 text default null)
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
  perform public.fin_kost_an_buchung(neu, (h.e).kontenrahmen, p_kost1, p_kost2);
  update public.fin_bankumsaetze set status = 'zugeordnet', zuordnung = 'konto', zuordnung_id = null, buchung_id = neu where id = p_umsatz;
  return jsonb_build_object('id', neu, 'nr', n);
end;
$$;
revoke all on function public.fin_bank_zu_konto(uuid, integer, text, text, text, text) from public, anon;
grant execute on function public.fin_bank_zu_konto(uuid, integer, text, text, text, text) to authenticated;
drop function if exists public.fin_bank_zu_konto(uuid, integer, text, text);

-- ---------------------------------------------------------------------
-- 3. Sammelzuordnung
-- ---------------------------------------------------------------------
alter table public.fin_bankumsaetze drop constraint if exists fin_bu_zuordnung;
alter table public.fin_bankumsaetze add constraint fin_bu_zuordnung check (zuordnung is null or zuordnung in ('rechnung', 'beleg', 'konto', 'mehrere'));

create table if not exists public.fin_bank_teile (
  id         uuid primary key default gen_random_uuid(),
  umsatz_id  uuid not null references public.fin_bankumsaetze (id) on delete cascade,
  buchung_id uuid not null references public.fin_buchungen (id),
  art        text not null,
  ziel_id    uuid,
  betrag     numeric(14,2) not null,
  constraint fin_bt_art check (art in ('rechnung', 'beleg', 'skonto', 'konto')),
  constraint fin_bt_betrag check (betrag > 0)
);
create index if not exists fin_bank_teile_umsatz on public.fin_bank_teile (umsatz_id);
create unique index if not exists fin_bank_teile_buchung on public.fin_bank_teile (buchung_id);
alter table public.fin_bank_teile enable row level security;
drop policy if exists "Finance-Bankteile lesen" on public.fin_bank_teile;
create policy "Finance-Bankteile lesen" on public.fin_bank_teile for select to authenticated using (public.darf('finance.bank', 'lesen'));
revoke all on public.fin_bank_teile from anon, authenticated;
grant select on public.fin_bank_teile to authenticated;
comment on table public.fin_bank_teile is
  'Migration 112: Teile einer Sammelzuordnung – je Rechnung/Beleg die Zahlungsbuchung, Skonto, Rest auf ein Konto. docs/finance.md Abschnitt 17.';

-- p_ziele: [{ "art": "rechnung"|"beleg", "id": "<uuid>", "betrag": 119.00, "skonto": 2.38 }]; Summe der Beträge + Rest = Umsatz.
-- Der Rest (Umsatz minus Summe) kommt auf p_rest_konto (mit Steuer und Text); ohne Konto muss er null sein.
create or replace function public.fin_bank_sammeln(p_umsatz uuid, p_ziele jsonb, p_rest_konto integer, p_rest_steuer text, p_rest_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  z jsonb;
  ein boolean;
  gesamt numeric;
  summe numeric := 0;
  rest_betrag numeric;
  betrag numeric;
  skonto numeric;
  offen numeric;
  r public.rechnungen%rowtype;
  fr public.fin_rechnungen%rowtype;
  b public.fin_belege%rowtype;
  zid uuid;
  neu uuid; n integer;
  sk jsonb;
  anzahl integer := 0;
  erste integer;
begin
  h := public.fin_bank_umsatz_holen(p_umsatz);
  ein := (h.u).betrag > 0;
  gesamt := abs((h.u).betrag);
  if p_ziele is null or jsonb_typeof(p_ziele) <> 'array' or jsonb_array_length(p_ziele) = 0 then
    raise exception 'Mindestens eine Rechnung bzw. einen Beleg wählen.';
  end if;
  if jsonb_array_length(p_ziele) > 50 then raise exception 'Höchstens 50 Posten auf einmal.'; end if;
  if (select count(distinct x ->> 'id') from jsonb_array_elements(p_ziele) x) <> jsonb_array_length(p_ziele) then
    raise exception 'Jede Rechnung bzw. jeder Beleg nur einmal.';
  end if;
  for z in select value from jsonb_array_elements(p_ziele) loop
    betrag := round(coalesce((z ->> 'betrag')::numeric, 0), 2);
    if betrag <= 0 then raise exception 'Jeder Posten braucht einen Betrag größer 0.'; end if;
    summe := summe + betrag;
  end loop;
  if summe > gesamt then
    raise exception 'Die Posten (% €) sind mehr als der Umsatz (% €).', summe, gesamt;
  end if;
  rest_betrag := gesamt - summe;
  if rest_betrag > 0 and p_rest_konto is null then
    raise exception 'Es bleiben % € – ein Konto für den Rest wählen (Gebühr, Überzahlung, Differenz) oder die Beträge anpassen.', rest_betrag;
  end if;

  for z in select value from jsonb_array_elements(p_ziele) loop
    zid := (z ->> 'id')::uuid;
    betrag := round((z ->> 'betrag')::numeric, 2);
    skonto := round(coalesce((z ->> 'skonto')::numeric, 0), 2);
    n := public.fin_naechste_nr((h.e).wirtschaftsjahr);
    if ein then
      if z ->> 'art' <> 'rechnung' then raise exception 'Ein Zahlungseingang gleicht Rechnungen aus, keine Belege.'; end if;
      select * into fr from public.fin_rechnungen where rechnung_id = zid for update;
      if fr.rechnung_id is null or fr.status <> 'gebucht' then raise exception 'Eine der Rechnungen ist in Finance nicht gebucht.'; end if;
      if fr.bezahlt_am is not null then raise exception 'Eine der Rechnungen ist schon bezahlt.'; end if;
      select * into r from public.rechnungen where id = zid;
      offen := r.brutto - public.fin_teilbezahlt('rechnung', zid);
      if betrag + skonto > offen then
        raise exception 'Rechnung %: offen sind % €, gewählt sind % € (mit Skonto).', r.nummer_text, offen, betrag + skonto;
      end if;
      insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
      values ((h.e).wirtschaftsjahr, n, (h.u).datum, left(case when betrag + skonto < offen then 'Teilzahlung ' else 'Zahlungseingang ' end || r.nummer_text, 200),
              r.nummer_text, 'zahlung', r.id)
      returning id into neu;
      insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
        (neu, 1, 'S', h.sachkonto, betrag), (neu, 1, 'H', public.fin_rechnung_konto((h.e).kontenrahmen, 'forderung'), betrag);
      insert into public.fin_teilzahlungen (art, ziel_id, datum, betrag, buchung_id, umsatz_id) values ('rechnung', zid, (h.u).datum, betrag, neu, p_umsatz);
      if betrag = offen then
        update public.fin_rechnungen set bezahlt_am = (h.u).datum, bezahlt_art = 'bank', zahlung_buchung_id = neu, aktualisiert_am = now() where rechnung_id = zid;
      end if;
      insert into public.fin_bank_teile (umsatz_id, buchung_id, art, ziel_id, betrag) values (p_umsatz, neu, 'rechnung', zid, betrag);
    else
      if z ->> 'art' <> 'beleg' then raise exception 'Eine Abbuchung bezahlt Belege, keine Rechnungen.'; end if;
      select * into b from public.fin_belege where id = zid for update;
      if b.id is null or b.status <> 'gebucht' then raise exception 'Einer der Belege ist nicht gebucht.'; end if;
      if b.bezahlt_am is not null then raise exception 'Einer der Belege ist schon bezahlt.'; end if;
      offen := b.brutto - public.fin_teilbezahlt('beleg', zid);
      if betrag + skonto > offen then
        raise exception 'Beleg %: offen sind % €, gewählt sind % € (mit Skonto).', coalesce(nullif(b.belegnummer, ''), 'ohne Nummer'), offen, betrag + skonto;
      end if;
      insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
      values ((h.e).wirtschaftsjahr, n, (h.u).datum,
              left(case when betrag + skonto < offen then 'Teilzahlung: ' else 'Überweisung: ' end || coalesce(nullif(b.belegnummer, ''), 'Beleg')
                   || coalesce(' · ' || (select l.name from public.fin_lieferanten l where l.id = b.lieferant_id), ''), 200),
              b.belegnummer, 'zahlung', b.id)
      returning id into neu;
      insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
        (neu, 1, 'S', public.fin_rechnung_konto((h.e).kontenrahmen, 'verbindlichkeit'), betrag), (neu, 1, 'H', h.sachkonto, betrag);
      insert into public.fin_teilzahlungen (art, ziel_id, datum, betrag, buchung_id, umsatz_id) values ('beleg', zid, (h.u).datum, betrag, neu, p_umsatz);
      if betrag = offen then
        update public.fin_belege set bezahlt_am = (h.u).datum, bezahlt_art = 'bank', zahlung_buchung_id = neu where id = b.id;
      end if;
      insert into public.fin_bank_teile (umsatz_id, buchung_id, art, ziel_id, betrag) values (p_umsatz, neu, 'beleg', zid, betrag);
    end if;
    erste := coalesce(erste, n);
    anzahl := anzahl + 1;
    if skonto > 0 then
      sk := public.fin_skonto_buchen(case when ein then 'rechnung' else 'beleg' end, zid, (h.u).datum, skonto);
      insert into public.fin_bank_teile (umsatz_id, buchung_id, art, ziel_id, betrag) values (p_umsatz, (sk ->> 'id')::uuid, 'skonto', zid, skonto);
    end if;
  end loop;

  if rest_betrag > 0 then
    if p_rest_konto = h.sachkonto then raise exception 'Der Rest gehört auf ein anderes Konto als das Bankkonto.'; end if;
    n := public.fin_naechste_nr((h.e).wirtschaftsjahr);
    insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
    values ((h.e).wirtschaftsjahr, n, (h.u).datum,
            left(coalesce(nullif(btrim(p_rest_text), ''), 'Differenz: ' || coalesce((h.u).name, 'Bank')), 200), null, 'bank', (h.u).id)
    returning id into neu;
    perform public.fin_posten_schreiben(neu, (h.e).kontenrahmen, (h.e).besteuerung, (h.e).r13b_empfaenger, (h.e).innergemeinschaftlich,
      jsonb_build_array(jsonb_build_object(
        'soll', case when ein then h.sachkonto else p_rest_konto end,
        'haben', case when ein then p_rest_konto else h.sachkonto end,
        'betrag', rest_betrag, 'steuer', nullif(btrim(coalesce(p_rest_steuer, '')), ''))));
    insert into public.fin_bank_teile (umsatz_id, buchung_id, art, betrag) values (p_umsatz, neu, 'konto', rest_betrag);
  end if;

  update public.fin_bankumsaetze set status = 'zugeordnet', zuordnung = 'mehrere', zuordnung_id = null, buchung_id = null where id = p_umsatz;
  return jsonb_build_object('posten', anzahl, 'rest', rest_betrag, 'von', erste);
end;
$$;

-- Aufheben: wie Migration 91, dazu die Sammelzuordnung – erst den Umsatz öffnen, dann jeden Teil gegenbuchen.
create or replace function public.fin_bank_aufheben(p_umsatz uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.fin_bankumsaetze%rowtype;
  t record;
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
  if u.zuordnung = 'mehrere' then
    if coalesce(btrim(p_grund), '') = '' then raise exception 'Bitte einen Grund für das Storno angeben.'; end if;
    update public.fin_bankumsaetze set status = 'offen', zuordnung = null, zuordnung_id = null, buchung_id = null where id = u.id;
    -- Skonto zuletzt gebucht, zuerst zurück; dann die Zahlungen und der Rest.
    for t in select bt.buchung_id from public.fin_bank_teile bt join public.fin_buchungen b on b.id = bt.buchung_id
              where bt.umsatz_id = u.id and b.storniert_durch is null
              order by case bt.art when 'skonto' then 0 else 1 end, b.nr desc loop
      perform public.fin_gegenbuchung(t.buchung_id, p_grund, null, null);
    end loop;
    delete from public.fin_bank_teile where umsatz_id = u.id;
    return;
  end if;
  perform public.fin_gegenbuchung(u.buchung_id, p_grund, null, null);
  if u.zuordnung = 'rechnung' then
    update public.fin_rechnungen set bezahlt_am = null, bezahlt_art = null, zahlung_buchung_id = null, aktualisiert_am = now()
     where rechnung_id = u.zuordnung_id and zahlung_buchung_id = u.buchung_id;
  elsif u.zuordnung = 'beleg' then
    update public.fin_belege set bezahlt_am = null, bezahlt_art = null, zahlung_buchung_id = null
     where id = u.zuordnung_id and zahlung_buchung_id = u.buchung_id;
  end if;
end;
$$;

-- Ein Teil einer Sammelzuordnung lässt sich nicht einzeln stornieren (Zahlung zurücknehmen, Skonto zurücknehmen) –
-- sonst stünde der Umsatz halb zugeordnet da. Aufheben unter Bank & Kasse öffnet den Umsatz zuerst und darf deshalb.
create or replace function public.fin_bank_teile_schutz()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.storniert_durch is not null and old.storniert_durch is null
     and exists (select 1 from public.fin_bank_teile bt join public.fin_bankumsaetze u on u.id = bt.umsatz_id
                  where bt.buchung_id = new.id and u.status = 'zugeordnet') then
    raise exception 'Diese Buchung gehört zu einer Sammelzuordnung im Bankabgleich – unter Bank & Kasse am Umsatz „Zuordnung aufheben“.';
  end if;
  return null;
end;
$$;
drop trigger if exists fin_bank_teile_schutz on public.fin_buchungen;
create trigger fin_bank_teile_schutz after update of storniert_durch on public.fin_buchungen
  for each row execute function public.fin_bank_teile_schutz();

revoke all on function public.fin_bankregel_speichern(uuid, text, text, text, text, text, integer, text, text, text, text, boolean) from public, anon;
revoke all on function public.fin_bankregel_loeschen(uuid) from public, anon;
revoke all on function public.fin_kost_an_buchung(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.fin_bank_sammeln(uuid, jsonb, integer, text, text) from public, anon;
revoke all on function public.fin_bank_teile_schutz() from public, anon, authenticated;
grant execute on function public.fin_bankregel_speichern(uuid, text, text, text, text, text, integer, text, text, text, text, boolean) to authenticated;
grant execute on function public.fin_bankregel_loeschen(uuid) to authenticated;
grant execute on function public.fin_bank_sammeln(uuid, jsonb, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Ergebnis
-- ---------------------------------------------------------------------
select 'Tabellen fin_bankregeln / fin_bank_teile (RLS)' as pruefung,
       (select string_agg(c.relname || case when c.relrowsecurity then ' RLS an' else ' RLS AUS' end, ', ' order by c.relname)
          from pg_class c where c.oid in (to_regclass('public.fin_bankregeln'), to_regclass('public.fin_bank_teile'))) as ergebnis
union all
select 'Funktionen', (select count(*)::text || ' von 4' from unnest(array['fin_bankregel_speichern(uuid,text,text,text,text,text,integer,text,text,text,text,boolean)',
         'fin_bankregel_loeschen(uuid)', 'fin_bank_sammeln(uuid,jsonb,integer,text,text)', 'fin_bank_zu_konto(uuid,integer,text,text,text,text)']) x
         where to_regprocedure('public.' || x) is not null)
union all
select 'Alte Fassung fin_bank_zu_konto ohne Kostenstellen entfernt',
       case when to_regprocedure('public.fin_bank_zu_konto(uuid,integer,text,text)') is null then 'ja' else 'nein' end
union all
select 'Schutz für Sammelzuordnungen', case when exists (select 1 from pg_trigger where tgname = 'fin_bank_teile_schutz') then 'ja' else 'nein' end;
