-- =====================================================================
-- Migration 89 – Finance, Phase F3: Rechnungen mit „Rechnung nötig“ buchen, offene Posten (13.10.2026, v147).
--
-- docs/finance.md Abschnitt 4.2. PILOT, additiv: In FSM ändert sich NICHTS – Rechnungen entstehen wie
-- bisher (Tabelle `rechnungen`, Nummernkreis, Druck). Neu ist nur, was danach in Finance passiert:
--
--   1. Wird eine Rechnung zu einem Auftrag mit „Rechnung nötig“ ausgestellt (in FSM oder aus Finance
--      heraus – es ist dieselbe Rechnung), bucht ein Trigger sie: Forderung an Erlöse je Steuersatz und
--      Umsatzsteuer, Beleg = Rechnungsnummer, Fälligkeit = Datum + 14 Tage (FIN_ZAHLUNGSZIEL_TAGE).
--   2. Eine Stornorechnung storniert diese Buchung (Gegenbuchung).
--   3. Scheitert die Buchung (Einstellungen fehlen, Monat festgeschrieben, Konto ausgeblendet …), wird die
--      Rechnung TROTZDEM ausgestellt – Finance merkt sich „nicht gebucht“ mit dem Grund und bietet
--      „Jetzt buchen“ an. Der Pilot darf FSM nie aufhalten (entschieden 13.10.2026: FSM bleibt unverändert).
--   4. „Bar bezahlt“ / „Überweisung eingegangen“: Kasse bzw. Bank an Forderung, der offene Posten ist weg.
--      Zurücknehmen mit Storno.
--   5. Aufträge OHNE „Rechnung nötig“ kommen nicht nach Finance – auch nicht ihre Rechnungen.
--   6. `fin_rechnungen_stand()` liefert Finance › Rechnungen: vorgemerkt, zu erstellen, ausgestellt.
--
-- Testrechnungen (Nummer < 0) und Testaufträge bleiben draußen. Reihenfolge: nach 88, SQL zuerst, dann
-- die Dateien von v147. Zweiter Lauf folgenlos. Bestehende Rechnungen werden NICHT nachgebucht – das
-- geht je Rechnung mit „Jetzt buchen“ in Finance.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.fin_buchen(date,text,text,jsonb)') is null then
    raise exception 'Zuerst Migration 88 (Finance: Konten, Journal) ausführen. Es wurde nichts geändert.';
  end if;
  if to_regclass('public.rechnungen') is null then
    raise exception 'Zuerst Migration 48 (Rechnungen) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Buchungen dürfen aus Zahlungen kommen.
-- ---------------------------------------------------------------------
alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
alter table public.fin_buchungen add constraint fin_buchung_quelle check (quelle in ('manuell', 'rechnung', 'zahlung'));

-- ---------------------------------------------------------------------
-- 2. Was Finance zu einer Rechnung weiß. Eine Zeile je Rechnung, die Finance gesehen hat.
-- ---------------------------------------------------------------------
create table if not exists public.fin_rechnungen (
  rechnung_id        uuid primary key references public.rechnungen (id) on delete cascade,
  order_id           uuid,
  status             text not null,
  fehler             text,
  buchung_id         uuid references public.fin_buchungen (id),
  storno_buchung_id  uuid references public.fin_buchungen (id),
  faellig_am         date,
  bezahlt_am         date,
  bezahlt_art        text,
  zahlung_buchung_id uuid references public.fin_buchungen (id),
  aktualisiert_am    timestamptz not null default now(),
  constraint fin_re_status check (status in ('gebucht', 'fehler', 'storniert')),
  constraint fin_re_art    check (bezahlt_art is null or bezahlt_art in ('bar', 'bank')),
  constraint fin_re_bezahlt check ((bezahlt_am is null) = (bezahlt_art is null) and (bezahlt_am is null) = (zahlung_buchung_id is null))
);
comment on table public.fin_rechnungen is
  'Migration 89: Finance-Stand je Rechnung (gebucht / nicht gebucht mit Grund / storniert, Fälligkeit, Zahlung). Nur über Funktionen geschrieben.';
alter table public.fin_rechnungen enable row level security;
drop policy if exists "Finance-Rechnungen lesen" on public.fin_rechnungen;
create policy "Finance-Rechnungen lesen" on public.fin_rechnungen
  for select to authenticated using (public.darf('finance.rechnungen', 'lesen'));
revoke all on public.fin_rechnungen from anon, authenticated;
grant select on public.fin_rechnungen to authenticated;

-- ---------------------------------------------------------------------
-- 3. Bausteine
-- ---------------------------------------------------------------------

-- Konten, auf die eine Rechnung gebucht wird (Kontenrahmen aus den Finance-Einstellungen). Dieselben
-- Nummern stehen in lib/finance/rechnungen.ts (FIN_RECHNUNG_KONTEN) – wer eine ändert, ändert beide.
create or replace function public.fin_rechnung_konto(p_rahmen text, p_zweck text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_rahmen
    when 'skr03' then case p_zweck when 'forderung' then 1400 when 'kasse' then 1000 when 'bank' then 1200
      when 'erloes19' then 8400 when 'erloes7' then 8300 when 'erloes0' then 8200 when 'erloes_klein' then 8195 end
    when 'skr04' then case p_zweck when 'forderung' then 1200 when 'kasse' then 1600 when 'bank' then 1800
      when 'erloes19' then 4400 when 'erloes7' then 4300 when 'erloes0' then 4200 when 'erloes_klein' then 4185 end
  end
$$;

-- Ein Buchungsdatum: das gewünschte, ist dessen Monat festgeschrieben, heute.
create or replace function public.fin_offenes_datum(p_datum date)
returns date
language sql
stable
set search_path = ''
as $$
  select case when exists (select 1 from public.fin_festschreibungen f
                            where f.jahr = extract(year from p_datum)::integer and f.monat = extract(month from p_datum)::integer)
              then (now() at time zone 'Europe/Berlin')::date else p_datum end
$$;

-- Gegenbuchung zu einer Buchung, OHNE Rechteprüfung (die prüft der Aufrufer). Aus fin_stornieren()
-- (Migration 88) herausgelöst, damit Rechnungsstorno und Zahlung zurücknehmen denselben Weg gehen.
create or replace function public.fin_gegenbuchung(p_id uuid, p_grund text, p_text text, p_quelle_id uuid)
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
  if coalesce(btrim(p_grund), '') = '' then raise exception 'Bitte einen Grund für das Storno angeben.'; end if;
  select * into b from public.fin_buchungen where id = p_id for update;
  if b.id is null then raise exception 'Diese Buchung gibt es nicht.'; end if;
  if b.storno_von is not null then raise exception 'Eine Stornobuchung wird nicht storniert – stattdessen neu buchen.'; end if;
  if b.storniert_durch is not null then raise exception 'Diese Buchung ist schon storniert.'; end if;
  d := public.fin_offenes_datum(b.datum);
  e := public.fin_buchbar(d);
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id, storno_von, grund)
  values (e.wirtschaftsjahr, n, d, left(coalesce(p_text, 'Storno ' || b.jahr || '-' || b.nr || ': ' || b.text), 200), b.beleg, b.quelle,
          coalesce(p_quelle_id, b.quelle_id), b.id, btrim(p_grund))
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel, ist_steuer)
  select neu, z.posten, case z.seite when 'S' then 'H' else 'S' end, z.konto, z.betrag, z.steuerschluessel, z.ist_steuer
    from public.fin_buchungszeilen z where z.buchung_id = b.id order by z.id;
  update public.fin_buchungen set storniert_durch = neu where id = b.id;
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;

-- Die Buchung einer Rechnung. Wirft bei jedem Problem – der Aufrufer fängt und merkt sich den Grund.
-- Die Steuer je Satz rechnet sie wie rechnungSummen() in lib/rechnung.ts (je Satz auf Cent gerundet)
-- und vergleicht mit den Summen auf dem Beleg: Was nicht aufgeht, wird nicht gebucht.
create or replace function public.fin_rechnung_buchen_kern(p_rechnung uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rechnungen%rowtype;
  e public.fin_einstellungen%rowtype;
  d date;
  neu uuid;
  n integer;
  g record;
  i integer := 0;
  forderung integer;
  erloes integer;
  ust_k integer;
  summe_netto numeric := 0;
  summe_steuer numeric := 0;
  mit_steuer boolean;
  kunde text;
begin
  select * into r from public.rechnungen where id = p_rechnung;
  if r.id is null then raise exception 'Diese Rechnung gibt es nicht.'; end if;
  d := public.fin_offenes_datum(r.datum);
  e := public.fin_buchbar(d);
  mit_steuer := coalesce((r.texte ->> 'mit_steuer')::boolean, true);
  forderung := public.fin_rechnung_konto(e.kontenrahmen, 'forderung');
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = forderung and k.aktiv) then
    raise exception 'Das Forderungskonto % ist ausgeblendet.', lpad(forderung::text, 4, '0');
  end if;
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  kunde := case when r.kundennummer is not null then ' · Kd. ' || r.kundennummer else '' end;
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, d, left('Rechnung ' || r.nummer_text || kunde, 200), r.nummer_text, 'rechnung', r.id)
  returning id into neu;
  if r.brutto <= 0 then raise exception 'Eine Rechnung über 0 € oder weniger wird nicht gebucht.'; end if;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag)
  values (neu, 0, 'S', forderung, r.brutto);

  for g in
    select (p ->> 'steuersatz')::numeric as satz, sum(round((p ->> 'netto')::numeric, 2)) as netto
      from jsonb_array_elements(r.positionen) p
     group by 1 order by 1 desc
  loop
    i := i + 1;
    if g.netto = 0 then continue; end if;
    erloes := public.fin_rechnung_konto(e.kontenrahmen,
      case when not mit_steuer or g.satz = 0 then case when e.besteuerung = 'klein' then 'erloes_klein' else 'erloes0' end
           when g.satz = 19 then 'erloes19' when g.satz = 7 then 'erloes7' end);
    if erloes is null then raise exception 'Für den Steuersatz % %% gibt es kein Erlöskonto.', g.satz; end if;
    if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = erloes and k.aktiv) then
      raise exception 'Das Erlöskonto % ist ausgeblendet.', lpad(erloes::text, 4, '0');
    end if;
    summe_netto := summe_netto + g.netto;
    if mit_steuer and g.satz > 0 then
      select s.ust_konto into ust_k from public.fin_steuerschluessel s
       where s.kontenrahmen = e.kontenrahmen and s.schluessel = 'ust' || trim(to_char(g.satz, 'FM999'));
      if ust_k is null then raise exception 'Für den Steuersatz % %% gibt es keinen Steuerschlüssel.', g.satz; end if;
      insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel)
      values (neu, i, case when g.netto > 0 then 'H' else 'S' end, erloes, abs(g.netto), 'ust' || trim(to_char(g.satz, 'FM999')));
      if round(g.netto * g.satz / 100, 2) <> 0 then
        insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel, ist_steuer)
        values (neu, i, case when g.netto > 0 then 'H' else 'S' end, ust_k, abs(round(g.netto * g.satz / 100, 2)), 'ust' || trim(to_char(g.satz, 'FM999')), true);
      end if;
      summe_steuer := summe_steuer + round(g.netto * g.satz / 100, 2);
    else
      insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel)
      values (neu, i, case when g.netto > 0 then 'H' else 'S' end, erloes, abs(g.netto), case when e.besteuerung = 'klein' then 'ku' else null end);
    end if;
  end loop;

  if summe_netto <> r.netto or summe_steuer <> r.steuer or summe_netto + summe_steuer <> r.brutto then
    raise exception 'Die Summen der Rechnung gehen nicht auf (netto %, Steuer %) – bitte prüfen.', r.netto, r.steuer;
  end if;
  if (select coalesce(sum(case z.seite when 'S' then z.betrag else -z.betrag end), 0) from public.fin_buchungszeilen z where z.buchung_id = neu) <> 0 then
    raise exception 'Soll und Haben der Rechnungsbuchung sind nicht gleich – es wurde nichts gebucht.';
  end if;
  return neu;
end;
$$;

-- Bucht eine Rechnung, wenn sie nach Finance gehört (Auftrag mit „Rechnung nötig“, keine Testrechnung),
-- und merkt sich das Ergebnis. Wirft NIE. Auch für „Jetzt buchen“: Hat der Auftrag den Haken erst nach
-- der Rechnung bekommen, zählt er dann.
create or replace function public.fin_rechnung_erfassen(p_rechnung uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rechnungen%rowtype;
  o_noetig boolean;
  o_nr integer;
  fr public.fin_rechnungen%rowtype;
  b uuid;
begin
  select * into r from public.rechnungen where id = p_rechnung;
  if r.id is null or r.art <> 'rechnung' or r.nummer < 0 then return 'nicht_finance'; end if;
  select o.rechnung_noetig, o.order_number into o_noetig, o_nr from public.orders o where o.id = r.order_id;
  if not coalesce(o_noetig, false) or coalesce(o_nr, 0) < 0 then return 'nicht_finance'; end if;
  select * into fr from public.fin_rechnungen where rechnung_id = r.id for update;
  if fr.status in ('gebucht', 'storniert') then return fr.status; end if;
  begin
    b := public.fin_rechnung_buchen_kern(r.id);
    insert into public.fin_rechnungen (rechnung_id, order_id, status, buchung_id, faellig_am, fehler)
    values (r.id, r.order_id, 'gebucht', b, r.datum + 14, null)
    on conflict (rechnung_id) do update set status = 'gebucht', buchung_id = excluded.buchung_id, faellig_am = excluded.faellig_am,
      fehler = null, aktualisiert_am = now();
    return 'gebucht';
  exception when others then
    -- Die Gründe stammen aus den eigenen Prüfungen (Konto, Monat, Einstellungen) – keine Kundendaten.
    insert into public.fin_rechnungen (rechnung_id, order_id, status, fehler)
    values (r.id, r.order_id, 'fehler', left(sqlerrm, 300))
    on conflict (rechnung_id) do update set status = 'fehler', fehler = excluded.fehler, aktualisiert_am = now();
    return 'fehler';
  end;
end;
$$;

-- Stornorechnung: die Buchung der aufgehobenen Rechnung gegenbuchen. Wirft NIE.
create or replace function public.fin_rechnung_storno_erfassen(p_storno uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.rechnungen%rowtype;
  fr public.fin_rechnungen%rowtype;
  g jsonb;
begin
  select * into s from public.rechnungen where id = p_storno;
  if s.id is null or s.art <> 'storno' or s.hebt_auf is null then return 'nicht_finance'; end if;
  select * into fr from public.fin_rechnungen where rechnung_id = s.hebt_auf for update;
  if fr.rechnung_id is null or fr.status = 'storniert' then return coalesce(fr.status, 'nicht_finance'); end if;
  if fr.status = 'fehler' then
    update public.fin_rechnungen set status = 'storniert', aktualisiert_am = now() where rechnung_id = fr.rechnung_id;
    return 'storniert';
  end if;
  begin
    g := public.fin_gegenbuchung(fr.buchung_id, coalesce(nullif(btrim(s.storno_grund), ''), 'Stornorechnung'),
                                 'Storno ' || s.nummer_text || ' zu ' || (select r.nummer_text from public.rechnungen r where r.id = s.hebt_auf), s.id);
    update public.fin_rechnungen set status = 'storniert', storno_buchung_id = (g ->> 'id')::uuid, fehler = null, aktualisiert_am = now()
     where rechnung_id = fr.rechnung_id;
    return 'storniert';
  exception when others then
    update public.fin_rechnungen set fehler = left('Storno nicht gebucht: ' || sqlerrm, 300), aktualisiert_am = now()
     where rechnung_id = fr.rechnung_id;
    return 'fehler';
  end;
end;
$$;

-- Der Trigger. AFTER INSERT und nach `trg_rechnung_am_auftrag` (Name sortiert dahinter). Kein Fehler
-- aus Finance erreicht FSM: Beide Funktionen fangen selbst, und zur Sicherheit noch einmal hier.
create or replace function public.fin_rechnung_nach_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.art = 'rechnung' then perform public.fin_rechnung_erfassen(new.id);
    elsif new.art = 'storno' then perform public.fin_rechnung_storno_erfassen(new.id);
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;
drop trigger if exists trg_zz_fin_rechnung on public.rechnungen;
create trigger trg_zz_fin_rechnung after insert on public.rechnungen
  for each row execute function public.fin_rechnung_nach_insert();

-- ---------------------------------------------------------------------
-- 4. Einstiege für die App
-- ---------------------------------------------------------------------
create or replace function public.fin_rechnung_nachbuchen(p_rechnung uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ergebnis text;
  grund text;
begin
  if not public.darf('finance.rechnungen', 'schreiben') then
    raise exception 'Rechnungen buchen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Rechnungen“ schreiben).';
  end if;
  ergebnis := public.fin_rechnung_erfassen(p_rechnung);
  if ergebnis = 'nicht_finance' then
    raise exception 'Diese Rechnung gehört nicht nach Finance – ihr Auftrag trägt kein „Rechnung nötig“.';
  end if;
  if ergebnis = 'fehler' then
    select fehler into grund from public.fin_rechnungen where rechnung_id = p_rechnung;
    raise exception '%', coalesce(grund, 'Die Rechnung konnte nicht gebucht werden.');
  end if;
  return ergebnis;
end;
$$;

-- Bezahlt: bar (Kasse) oder per Überweisung (Bank) an Forderung, ganzer Betrag.
create or replace function public.fin_rechnung_bezahlt(p_rechnung uuid, p_art text, p_datum date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fr public.fin_rechnungen%rowtype;
  r public.rechnungen%rowtype;
  e public.fin_einstellungen%rowtype;
  geld integer;
  forderung integer;
  neu uuid;
  n integer;
begin
  if not public.darf('finance.rechnungen', 'schreiben') then
    raise exception 'Zahlungen erfassen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Rechnungen“ schreiben).';
  end if;
  if p_art is null or p_art not in ('bar', 'bank') then raise exception 'Bar oder Überweisung angeben.'; end if;
  if p_datum is null then raise exception 'Das Datum der Zahlung fehlt.'; end if;
  if p_datum > (now() at time zone 'Europe/Berlin')::date then raise exception 'Eine Zahlung in der Zukunft wird nicht erfasst.'; end if;
  select * into fr from public.fin_rechnungen where rechnung_id = p_rechnung for update;
  if fr.rechnung_id is null or fr.status <> 'gebucht' then raise exception 'Erst die Rechnung buchen, dann die Zahlung.'; end if;
  if fr.bezahlt_am is not null then raise exception 'Diese Rechnung ist schon als bezahlt erfasst.'; end if;
  select * into r from public.rechnungen where id = p_rechnung;
  if p_datum < r.datum then raise exception 'Die Zahlung liegt vor dem Rechnungsdatum.'; end if;
  e := public.fin_buchbar(p_datum);
  geld := public.fin_rechnung_konto(e.kontenrahmen, case p_art when 'bar' then 'kasse' else 'bank' end);
  forderung := public.fin_rechnung_konto(e.kontenrahmen, 'forderung');
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = geld and k.aktiv) then
    raise exception 'Das Konto % ist ausgeblendet.', lpad(geld::text, 4, '0');
  end if;
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, p_datum, left(case p_art when 'bar' then 'Bar bezahlt ' else 'Zahlungseingang ' end || r.nummer_text, 200),
          r.nummer_text, 'zahlung', r.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag) values
    (neu, 1, 'S', geld, r.brutto), (neu, 1, 'H', forderung, r.brutto);
  update public.fin_rechnungen set bezahlt_am = p_datum, bezahlt_art = p_art, zahlung_buchung_id = neu, aktualisiert_am = now()
   where rechnung_id = p_rechnung;
  return jsonb_build_object('id', neu, 'jahr', e.wirtschaftsjahr, 'nr', n);
end;
$$;

create or replace function public.fin_zahlung_zuruecknehmen(p_rechnung uuid, p_grund text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fr public.fin_rechnungen%rowtype;
  g jsonb;
begin
  if not public.darf('finance.rechnungen', 'schreiben') then
    raise exception 'Zahlungen zurücknehmen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Rechnungen“ schreiben).';
  end if;
  select * into fr from public.fin_rechnungen where rechnung_id = p_rechnung for update;
  if fr.zahlung_buchung_id is null then raise exception 'Zu dieser Rechnung ist keine Zahlung erfasst.'; end if;
  g := public.fin_gegenbuchung(fr.zahlung_buchung_id, p_grund, null, null);
  update public.fin_rechnungen set bezahlt_am = null, bezahlt_art = null, zahlung_buchung_id = null, aktualisiert_am = now()
   where rechnung_id = p_rechnung;
  return g;
end;
$$;

-- Von Hand stornieren (Migration 88) – Buchungen aus Rechnungen und Zahlungen gehen ihren eigenen Weg.
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
  if q = 'zahlung' then
    raise exception 'Diese Buchung ist eine Zahlung – zurücknehmen unter Finance › Rechnungen an der Rechnung.';
  end if;
  return public.fin_gegenbuchung(p_id, p_grund, null, null);
end;
$$;

-- Finance › Rechnungen in einem Abruf: offene Vorgänge mit Haken (ohne Jahresgrenze – das ist die
-- Arbeitsliste), die Rechnungen des Jahres, die nach Finance gehören, und anderswo Abgerechnetes.
-- Der Betrag eines Vorgangs ist eine Schätzung aus den Leistungen, wie orderArticleTotals() (lib/helpers.ts).
create or replace function public.fin_rechnungen_stand(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.rechnungen', 'lesen') then
    raise exception 'Finance › Rechnungen ist für deine Rolle nicht freigeschaltet.';
  end if;
  return jsonb_build_object(
    'vorgaenge', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', o.id, 'order_number', o.order_number, 'datum', o.order_date, 'zeit', o.time, 'status', o.status,
               'kunde', coalesce(nullif(btrim(c.company), ''), nullif(btrim(c.name), ''), nullif(btrim(o.laufkunde_name), ''), 'ohne Kunde'),
               'kundennummer', c.kundennummer,
               'betrag', (select round(coalesce(sum(coalesce(a.endpreis_netto, a.quantity * a.net_price) * (1 + a.vat_rate / 100.0)), 0), 2)
                            from public.order_articles a where a.order_id = o.id and a.deleted_at is null))
               order by o.order_date, o.order_number)
        from public.orders o left join public.customers c on c.id = o.customer_id
       where o.rechnung_noetig and o.deleted_at is null and o.order_number > 0
         and o.rechnung_erstellt_am is null and o.status in ('offen', 'in_arbeit', 'erledigt')), '[]'::jsonb),
    'rechnungen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rechnung_id', r.id, 'nummer_text', r.nummer_text, 'datum', r.datum, 'brutto', r.brutto, 'order_id', r.order_id,
               'order_number', o.order_number,
               'kunde', coalesce(nullif(btrim(r.empfaenger ->> 'company'), ''), nullif(btrim(r.empfaenger ->> 'name'), ''), 'ohne Name'),
               'storniert', r.storniert_durch is not null,
               'storno_nummer', (select s.nummer_text from public.rechnungen s where s.id = r.storniert_durch),
               'status', coalesce(f.status, 'offen'), 'fehler', f.fehler, 'faellig_am', f.faellig_am,
               'bezahlt_am', f.bezahlt_am, 'bezahlt_art', f.bezahlt_art,
               'buchung_nr', (select b.nr from public.fin_buchungen b where b.id = f.buchung_id))
               order by r.nummer desc)
        from public.rechnungen r
        left join public.orders o on o.id = r.order_id
        left join public.fin_rechnungen f on f.rechnung_id = r.id
       where r.art = 'rechnung' and r.nummer > 0 and extract(year from r.datum)::integer = p_jahr
         and (f.rechnung_id is not null or coalesce(o.rechnung_noetig, false))), '[]'::jsonb),
    'anderswo', coalesce((
      select jsonb_agg(jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'datum', o.order_date,
               'kunde', coalesce(nullif(btrim(c.company), ''), nullif(btrim(c.name), ''), nullif(btrim(o.laufkunde_name), ''), 'ohne Kunde'),
               'rechnung_nummer', o.rechnung_nummer) order by o.order_date desc)
        from public.orders o left join public.customers c on c.id = o.customer_id
       where o.rechnung_noetig and coalesce(o.rechnung_extern, false) and o.deleted_at is null and o.order_number > 0
         and extract(year from o.order_date)::integer = p_jahr), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fin_rechnung_konto(text, text) from public, anon, authenticated;
revoke all on function public.fin_offenes_datum(date) from public, anon, authenticated;
revoke all on function public.fin_gegenbuchung(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fin_rechnung_buchen_kern(uuid) from public, anon, authenticated;
revoke all on function public.fin_rechnung_erfassen(uuid) from public, anon, authenticated;
revoke all on function public.fin_rechnung_storno_erfassen(uuid) from public, anon, authenticated;
revoke all on function public.fin_rechnung_nach_insert() from public, anon, authenticated;
revoke all on function public.fin_rechnung_nachbuchen(uuid) from public, anon;
revoke all on function public.fin_rechnung_bezahlt(uuid, text, date) from public, anon;
revoke all on function public.fin_zahlung_zuruecknehmen(uuid, text) from public, anon;
revoke all on function public.fin_rechnungen_stand(integer) from public, anon;
revoke all on function public.fin_stornieren(uuid, text) from public, anon;
grant execute on function public.fin_rechnung_nachbuchen(uuid) to authenticated;
grant execute on function public.fin_rechnung_bezahlt(uuid, text, date) to authenticated;
grant execute on function public.fin_zahlung_zuruecknehmen(uuid, text) to authenticated;
grant execute on function public.fin_rechnungen_stand(integer) to authenticated;
grant execute on function public.fin_stornieren(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Kontrolle – eine Ergebnistabelle.
-- ---------------------------------------------------------------------
select 'Tabelle fin_rechnungen (RLS)' as pruefung,
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_rechnungen')), 'fehlt') as ergebnis
union all
select 'Richtlinien auf fin_rechnungen',
       coalesce((select string_agg(p.cmd || ' · ' || p.policyname, ', ') from pg_policies p where p.schemaname = 'public' and p.tablename = 'fin_rechnungen'), 'keine')
union all
select 'Trigger an rechnungen', coalesce((select string_agg(t.tgname, ', ' order by t.tgname) from pg_trigger t
                                           where t.tgrelid = 'public.rechnungen'::regclass and not t.tgisinternal and t.tgname like '%fin%'), 'fehlt')
union all
select 'Funktionen', (select string_agg(x, ', ') from unnest(array['fin_rechnung_nachbuchen(uuid)', 'fin_rechnung_bezahlt(uuid,text,date)',
                       'fin_zahlung_zuruecknehmen(uuid,text)', 'fin_rechnungen_stand(integer)']) x where to_regprocedure('public.' || x) is not null)
union all
select 'Schon gebuchte Rechnungen', (select count(*)::text from public.fin_rechnungen where status = 'gebucht');
