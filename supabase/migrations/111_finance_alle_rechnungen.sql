-- =====================================================================
-- Migration 111 – Finance, Stufe D (Teil 2): alle Rechnungen, Leistungsart aus dem Artikel, Transporter aus dem
-- Auftrag (30.10.2026, v184).
--
-- docs/finance.md Abschnitt 16, Entscheidungen 1, 2 und 4 vom 30.10.2026:
--
--   1. Pilot beenden: `fin_einstellungen.rechnungen_umfang` je Wirtschaftsjahr – 'pilot' (nur Aufträge mit „Rechnung
--      nötig“, wie bisher) oder 'alle' (jede Rechnung aus FSM). Bestehende Jahre vor 2027 bleiben 'pilot', ab 2027
--      (vollständig ab 01.01.2027) ist 'alle' die Vorgabe. In FSM ändert sich nichts.
--   2. Rechnungen „ohne Umsatzsteuerausweis“ (Auftrag ohne „Rechnung nötig“): `fin_einstellungen.ohne_ausweis` –
--      'herausrechnen' (Vorgabe: bei Regelbesteuerung steckt die Umsatzsteuer im Betrag und wird herausgerechnet) oder
--      'steuerfrei' (wie bisher auf 8200/4200 ohne Steuer). MIT DEM STEUERBERATER KLÄREN. Kleinunternehmer: wie bisher.
--   3. Leistungsart (KOST2) je Rechnungsposition aus dem Artikel, ohne Handarbeit: Vorgabe aus der Abrechnungsart
--      (Lagergebühr → 200 Einlagerung, Reifenverkauf neu/gebraucht → 300 Reifenverkauf, sonst 100 Montage), je Artikel
--      änderbar (`fin_artikel_kost`, Finance › Buchungen › Kostenstellen). Eine Nachlasszeile folgt ihrer Position.
--      Transporter (KOST1) aus dem Firmenfahrzeug des Auftrags. Ohne passende aktive Kostenstelle bleibt es leer.
--   4. `fin_rechnung_buchen_kern()` neu: Erlöse je Steuersatz UND Leistungsart als eigener Posten (die Steuer je Satz
--      bleibt wie auf dem Beleg, auf die Posten verteilt), mit KOST1/KOST2 an der Erlöszeile.
--   5. `fin_rechnungen_nachbuchen_alle(jahr)`: bucht alle noch nicht gebuchten Rechnungen des Jahres (und ihre
--      Stornos) – für den Start am 01.01.2027 oder nach dem Umstellen auf 'alle'.
--
-- Reihenfolge: nach 110, SQL zuerst, dann v184. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_personenkonten') is null then
    raise exception 'Zuerst Migration 110 (Finance: Personenkonten) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Einstellungen je Jahr
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fin_einstellungen' and column_name = 'rechnungen_umfang') then
    alter table public.fin_einstellungen add column rechnungen_umfang text not null default 'alle';
    -- Nur beim ersten Lauf: die Jahre vor dem Echtbetrieb bleiben im Pilot.
    update public.fin_einstellungen set rechnungen_umfang = 'pilot' where wirtschaftsjahr < 2027;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fin_einst_umfang') then
    alter table public.fin_einstellungen add constraint fin_einst_umfang check (rechnungen_umfang in ('pilot', 'alle'));
  end if;
end $$;
alter table public.fin_einstellungen add column if not exists ohne_ausweis text not null default 'herausrechnen';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_einst_ohne_ausweis') then
    alter table public.fin_einstellungen add constraint fin_einst_ohne_ausweis check (ohne_ausweis in ('herausrechnen', 'steuerfrei'));
  end if;
end $$;
comment on column public.fin_einstellungen.rechnungen_umfang is
  'Migration 111: pilot = nur Aufträge mit „Rechnung nötig“, alle = jede Rechnung aus FSM wird gebucht.';
comment on column public.fin_einstellungen.ohne_ausweis is
  'Migration 111: Rechnung ohne Umsatzsteuerausweis bei Regelbesteuerung – herausrechnen (Steuer im Betrag) oder steuerfrei (8200/4200). Mit dem Steuerberater klären.';

-- Der Umfang für ein Rechnungsdatum (ohne Einstellungen: pilot).
create or replace function public.fin_umfang(p_datum date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select e.rechnungen_umfang from public.fin_einstellungen e where e.wirtschaftsjahr = extract(year from p_datum)::integer), 'pilot')
$$;

-- ---------------------------------------------------------------------
-- 2. Leistungsart je Artikel, Transporter je Auftrag
-- ---------------------------------------------------------------------
create table if not exists public.fin_artikel_kost (
  article_id uuid primary key references public.articles (id) on delete cascade,
  kost2      text not null,
  geaendert_am timestamptz not null default now(),
  constraint fin_ak_nummer check (kost2 ~ '^[A-Za-z0-9]{1,8}$')
);
alter table public.fin_artikel_kost enable row level security;
drop policy if exists "Finance-Artikel-Leistungsart lesen" on public.fin_artikel_kost;
create policy "Finance-Artikel-Leistungsart lesen" on public.fin_artikel_kost for select to authenticated using (public.darf('finance', 'lesen'));
revoke all on public.fin_artikel_kost from anon, authenticated;
grant select on public.fin_artikel_kost to authenticated;
comment on table public.fin_artikel_kost is
  'Migration 111: abweichende Leistungsart (KOST2) je Artikel. Ohne Zeile gilt die Vorgabe aus der Abrechnungsart (fin_leistungsart_vorgabe). docs/finance.md Abschnitt 16.';

-- Vorgabe aus der Abrechnungsart. Dieselbe Zuordnung steht in lib/finance/kostenstellen.ts (FIN_LEISTUNGSART_VORGABE).
create or replace function public.fin_leistungsart_vorgabe(p_abrechnungsart text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_abrechnungsart when 'lagergebuehr' then '200' when 'reifenverkauf_neu' then '300' when 'reifenverkauf_gebraucht' then '300' else '100' end
$$;

-- Die Leistungsart einer Rechnungsposition (über die Artikelnummer) – nur, wenn es sie aktiv gibt.
create or replace function public.fin_artikel_leistungsart(p_artikelnummer integer)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select k.nummer
    from public.articles a
    left join public.fin_artikel_kost ak on ak.article_id = a.id
    join public.fin_kostenstellen k on k.art = 'kost2' and k.aktiv
                                   and k.nummer = coalesce(ak.kost2, public.fin_leistungsart_vorgabe(a.abrechnungsart))
   where p_artikelnummer is not null and a.article_number = p_artikelnummer
   limit 1
$$;

-- Der Transporter (KOST1) eines Auftrags: die aktive Kostenstelle seines Firmenfahrzeugs.
create or replace function public.fin_auftrag_transporter(p_order uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select k.nummer from public.orders o join public.fin_kostenstellen k on k.art = 'kost1' and k.aktiv and k.firmenfahrzeug_id = o.firmenfahrzeug_id
   where o.id = p_order limit 1
$$;

-- Für Finance › Buchungen › Kostenstellen: alle Artikel mit Vorgabe und abweichender Wahl.
create or replace function public.fin_artikel_leistungsarten()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance', 'lesen') then raise exception 'Finance ist für deine Rolle nicht freigeschaltet.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'artikelnummer', a.article_number, 'name', coalesce(nullif(btrim(a.short_name), ''), a.long_name),
             'abrechnungsart', a.abrechnungsart, 'aktiv', a.active, 'vorgabe', public.fin_leistungsart_vorgabe(a.abrechnungsart), 'kost2', ak.kost2)
             order by a.article_number)
      from public.articles a left join public.fin_artikel_kost ak on ak.article_id = a.id), '[]'::jsonb);
end;
$$;

-- Abweichende Leistungsart setzen (null = zurück zur Vorgabe). Recht wie die Kostenstellen.
create or replace function public.fin_artikel_kost_setzen(p_article uuid, p_kost2 text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.einstellungen', 'schreiben') then
    raise exception 'Kostenstellen pflegen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Einstellungen“ schreiben).';
  end if;
  if not exists (select 1 from public.articles where id = p_article) then raise exception 'Diesen Artikel gibt es nicht.'; end if;
  if nullif(btrim(coalesce(p_kost2, '')), '') is null then
    delete from public.fin_artikel_kost where article_id = p_article;
    return;
  end if;
  perform public.fin_kost('kost2', btrim(p_kost2));
  insert into public.fin_artikel_kost (article_id, kost2) values (p_article, btrim(p_kost2))
  on conflict (article_id) do update set kost2 = excluded.kost2, geaendert_am = now();
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Rechnung buchen: Erlöse je Steuersatz und Leistungsart, mit Kostenstellen
-- ---------------------------------------------------------------------
-- Die Steuer je Satz bleibt die des Belegs (wie rechnungSummen() in lib/rechnung.ts, je Satz auf Cent gerundet) und
-- wird auf die Leistungsarten verteilt (die letzte nimmt den Rundungsrest). Ohne Steuerausweis bei Regelbesteuerung
-- und 'herausrechnen': Steuer = Betrag × Satz / (100 + Satz), ebenso je Satz gerundet.
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
  summe_brutto numeric := 0;
  mit_steuer boolean;
  heraus boolean;
  kunde text;
  k1 text;
  schl text;
begin
  select * into r from public.rechnungen where id = p_rechnung;
  if r.id is null then raise exception 'Diese Rechnung gibt es nicht.'; end if;
  d := public.fin_offenes_datum(r.datum);
  e := public.fin_buchbar(d);
  mit_steuer := coalesce((r.texte ->> 'mit_steuer')::boolean, true);
  heraus := not mit_steuer and e.besteuerung <> 'klein' and coalesce(e.ohne_ausweis, 'herausrechnen') = 'herausrechnen';
  forderung := public.fin_rechnung_konto(e.kontenrahmen, 'forderung');
  if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = forderung and k.aktiv) then
    raise exception 'Das Forderungskonto % ist ausgeblendet.', lpad(forderung::text, 4, '0');
  end if;
  if r.brutto <= 0 then raise exception 'Eine Rechnung über 0 € oder weniger wird nicht gebucht.'; end if;
  k1 := public.fin_auftrag_transporter(r.order_id);
  n := public.fin_naechste_nr(e.wirtschaftsjahr);
  kunde := case when r.kundennummer is not null then ' · Kd. ' || r.kundennummer else '' end;
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values (e.wirtschaftsjahr, n, d, left('Rechnung ' || r.nummer_text || kunde, 200), r.nummer_text, 'rechnung', r.id)
  returning id into neu;
  insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag)
  values (neu, 0, 'S', forderung, r.brutto);

  for g in
    with p as (
      select t.ord, (t.x ->> 'steuersatz')::numeric as satz, round((t.x ->> 'netto')::numeric, 2) as betrag,
             (t.x ->> 'artikelnummer')::integer as art
        from jsonb_array_elements(r.positionen) with ordinality as t(x, ord)
    ), k as (
      select p.*, public.fin_artikel_leistungsart(p.art) as k2 from p
    ), f as (
      -- Eine Position ohne Artikelnummer (Nachlass) gehört zur Position davor.
      select k.satz, k.betrag,
             (select k3.k2 from k k3 where k3.ord <= k.ord and k3.art is not null order by k3.ord desc limit 1) as kost2
        from k
    ), grp as (
      select satz, kost2, sum(betrag) as betrag from f group by satz, kost2
    ), st as (
      select grp.*,
             case when mit_steuer then round(betrag * satz / 100, 2) when heraus then round(betrag * satz / (100 + satz), 2) else 0 end as roh,
             case when mit_steuer then round(sum(betrag) over (partition by satz) * satz / 100, 2)
                  when heraus then round(sum(betrag) over (partition by satz) * satz / (100 + satz), 2) else 0 end as je_satz,
             row_number() over (partition by satz order by kost2 nulls last) as rn,
             count(*) over (partition by satz) as anz
        from grp
    )
    select st.satz, st.kost2, st.betrag,
           case when st.rn = st.anz
                then st.je_satz - coalesce((select sum(s2.roh) from st s2 where s2.satz = st.satz and s2.rn < st.rn), 0)
                else st.roh end as steuer
      from st order by st.satz desc, st.kost2 nulls last
  loop
    i := i + 1;
    if g.betrag = 0 then continue; end if;
    erloes := public.fin_rechnung_konto(e.kontenrahmen,
      case when (not mit_steuer and not heraus) or g.satz = 0 then case when e.besteuerung = 'klein' then 'erloes_klein' else 'erloes0' end
           when g.satz = 19 then 'erloes19' when g.satz = 7 then 'erloes7' end);
    if erloes is null then raise exception 'Für den Steuersatz % %% gibt es kein Erlöskonto.', g.satz; end if;
    if not exists (select 1 from public.fin_konten k where k.kontenrahmen = e.kontenrahmen and k.nummer = erloes and k.aktiv) then
      raise exception 'Das Erlöskonto % ist ausgeblendet.', lpad(erloes::text, 4, '0');
    end if;
    if (mit_steuer or heraus) and g.satz > 0 then
      schl := 'ust' || trim(to_char(g.satz, 'FM999'));
      select s.ust_konto into ust_k from public.fin_steuerschluessel s where s.kontenrahmen = e.kontenrahmen and s.schluessel = schl;
      if ust_k is null then raise exception 'Für den Steuersatz % %% gibt es keinen Steuerschlüssel.', g.satz; end if;
      -- Netto: mit Ausweis der Positionsbetrag, beim Herausrechnen Betrag minus Steuer.
      insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel, kost1, kost2)
      values (neu, i, case when g.betrag > 0 then 'H' else 'S' end, erloes,
              abs(case when heraus then g.betrag - g.steuer else g.betrag end), schl, k1, g.kost2);
      if g.steuer <> 0 then
        insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel, ist_steuer)
        values (neu, i, case when g.steuer > 0 then 'H' else 'S' end, ust_k, abs(g.steuer), schl, true);
      end if;
      summe_netto := summe_netto + case when heraus then g.betrag - g.steuer else g.betrag end;
      summe_steuer := summe_steuer + g.steuer;
    else
      insert into public.fin_buchungszeilen (buchung_id, posten, seite, konto, betrag, steuerschluessel, kost1, kost2)
      values (neu, i, case when g.betrag > 0 then 'H' else 'S' end, erloes, abs(g.betrag), case when e.besteuerung = 'klein' then 'ku' else null end, k1, g.kost2);
      summe_netto := summe_netto + g.betrag;
    end if;
    summe_brutto := summe_brutto + g.betrag + case when mit_steuer then g.steuer else 0 end;
  end loop;

  if heraus then
    if summe_brutto <> r.brutto then
      raise exception 'Die Summen der Rechnung gehen nicht auf (Betrag %) – bitte prüfen.', r.brutto;
    end if;
  elsif summe_netto <> r.netto or summe_steuer <> r.steuer or summe_netto + summe_steuer <> r.brutto then
    raise exception 'Die Summen der Rechnung gehen nicht auf (netto %, Steuer %) – bitte prüfen.', r.netto, r.steuer;
  end if;
  if (select coalesce(sum(case z.seite when 'S' then z.betrag else -z.betrag end), 0) from public.fin_buchungszeilen z where z.buchung_id = neu) <> 0 then
    raise exception 'Soll und Haben der Rechnungsbuchung sind nicht gleich – es wurde nichts gebucht.';
  end if;
  return neu;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Welche Rechnungen nach Finance gehören
-- ---------------------------------------------------------------------
-- Wie Migration 89, aber mit dem Umfang des Jahres: 'alle' bucht jede Rechnung (keine Testrechnung, kein Testauftrag).
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
  if coalesce(o_nr, 0) < 0 then return 'nicht_finance'; end if;
  if not coalesce(o_noetig, false) and public.fin_umfang(r.datum) <> 'alle' then return 'nicht_finance'; end if;
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
    raise exception 'Diese Rechnung gehört nicht nach Finance – ihr Auftrag trägt kein „Rechnung nötig“, und das Jahr steht auf „Pilot“ (Finance › Einstellungen).';
  end if;
  if ergebnis = 'fehler' then
    select fehler into grund from public.fin_rechnungen where rechnung_id = p_rechnung;
    raise exception '%', coalesce(grund, 'Die Rechnung konnte nicht gebucht werden.');
  end if;
  return ergebnis;
end;
$$;

-- Alle noch nicht gebuchten Rechnungen eines Jahres nachbuchen, ihre Stornos gleich mit. Gibt die Anzahl je Ergebnis.
create or replace function public.fin_rechnungen_nachbuchen_alle(p_jahr integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record;
  erg text;
  gebucht integer := 0;
  fehler integer := 0;
  stornos integer := 0;
begin
  if not public.darf('finance.rechnungen', 'schreiben') then
    raise exception 'Rechnungen buchen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Rechnungen“ schreiben).';
  end if;
  for x in
    select r.id, r.storniert_durch from public.rechnungen r
      left join public.fin_rechnungen f on f.rechnung_id = r.id
     where r.art = 'rechnung' and r.nummer > 0 and extract(year from r.datum)::integer = p_jahr
       and (f.rechnung_id is null or f.status = 'fehler')
     order by r.nummer
  loop
    erg := public.fin_rechnung_erfassen(x.id);
    if erg = 'gebucht' then
      gebucht := gebucht + 1;
      if x.storniert_durch is not null and public.fin_rechnung_storno_erfassen(x.storniert_durch) = 'storniert' then stornos := stornos + 1; end if;
    elsif erg = 'fehler' then
      fehler := fehler + 1;
    end if;
  end loop;
  return jsonb_build_object('gebucht', gebucht, 'fehler', fehler, 'stornos', stornos);
end;
$$;

-- Finance › Rechnungen: wie Migration 93, die Liste mit dem Umfang des Jahres; dazu `umfang`.
create or replace function public.fin_rechnungen_stand(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  umfang text := public.fin_umfang(make_date(p_jahr, 6, 30));
begin
  if not public.darf('finance.rechnungen', 'lesen') then
    raise exception 'Finance › Rechnungen ist für deine Rolle nicht freigeschaltet.';
  end if;
  return jsonb_build_object(
    'umfang', umfang,
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
               'teilbezahlt', public.fin_teilbezahlt('rechnung', r.id),
               'buchung_nr', (select b.nr from public.fin_buchungen b where b.id = f.buchung_id))
               order by r.nummer desc)
        from public.rechnungen r
        left join public.orders o on o.id = r.order_id
        left join public.fin_rechnungen f on f.rechnung_id = r.id
       where r.art = 'rechnung' and r.nummer > 0 and extract(year from r.datum)::integer = p_jahr
         and coalesce(o.order_number, 1) > 0
         and (f.rechnung_id is not null or coalesce(o.rechnung_noetig, false) or umfang = 'alle')), '[]'::jsonb),
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

revoke all on function public.fin_umfang(date) from public, anon, authenticated;
revoke all on function public.fin_leistungsart_vorgabe(text) from public, anon;
revoke all on function public.fin_artikel_leistungsart(integer) from public, anon, authenticated;
revoke all on function public.fin_auftrag_transporter(uuid) from public, anon, authenticated;
revoke all on function public.fin_artikel_leistungsarten() from public, anon;
revoke all on function public.fin_artikel_kost_setzen(uuid, text) from public, anon;
revoke all on function public.fin_rechnungen_nachbuchen_alle(integer) from public, anon;
grant execute on function public.fin_artikel_leistungsarten() to authenticated;
grant execute on function public.fin_artikel_kost_setzen(uuid, text) to authenticated;
grant execute on function public.fin_rechnungen_nachbuchen_alle(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Ergebnis
-- ---------------------------------------------------------------------
select 'Umfang je Jahr' as pruefung,
       coalesce((select string_agg(wirtschaftsjahr || ': ' || rechnungen_umfang, ', ' order by wirtschaftsjahr) from public.fin_einstellungen), 'noch kein Jahr') as ergebnis
union all
select 'Ohne Steuerausweis', coalesce((select string_agg(wirtschaftsjahr || ': ' || ohne_ausweis, ', ' order by wirtschaftsjahr) from public.fin_einstellungen), 'noch kein Jahr')
union all
select 'Tabelle fin_artikel_kost (RLS)',
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_artikel_kost')), 'fehlt')
union all
select 'Leistungsart der Artikel (Vorgabe)',
       coalesce((select string_agg(v || ': ' || n, ', ' order by v) from (select public.fin_leistungsart_vorgabe(a.abrechnungsart) as v, count(*) as n
                   from public.articles a group by 1) t), 'keine Artikel')
union all
select 'Funktionen', (select count(*)::text || ' von 6' from unnest(array['fin_umfang(date)', 'fin_artikel_leistungsart(integer)', 'fin_auftrag_transporter(uuid)',
         'fin_artikel_leistungsarten()', 'fin_artikel_kost_setzen(uuid,text)', 'fin_rechnungen_nachbuchen_alle(integer)']) x where to_regprocedure('public.' || x) is not null)
union all
select 'Rechnungsbuchung mit Leistungsart', case when position('fin_artikel_leistungsart' in pg_get_functiondef('public.fin_rechnung_buchen_kern(uuid)'::regprocedure)) > 0 then 'ja' else 'nein' end;
