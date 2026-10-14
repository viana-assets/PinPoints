-- =====================================================================
-- Migration 99 – Finance: Mahnwesen (14.10.2026, v157).
--
-- docs/finance.md „später“ – Mahnwesen, schlank:
--
--   1. `fin_mahnungen`: Zahlungserinnerung (Stufe 1), Mahnung (2), letzte Mahnung (3) zu einer Rechnung, die in Finance
--      gebucht und noch offen ist. Snapshot wie bei der Rechnung: Absender, Empfänger, Rechnungsnummer, Beträge und der
--      Brieftext stehen als Kopie in der Zeile – eine spätere Änderung an Kunde oder Betrieb ändert keine Mahnung.
--   2. `fin_mahnung_erstellen()`: Stufe für Stufe (keine überspringen, höchstens drei), nach der Fälligkeit, mit Frist;
--      offener Betrag aus der Datenbank (Brutto minus Zahlungen und Skonto); Mahngebühr und Verzugszinsen wie in der
--      App gerechnet (lib/finance/mahnung.ts), nur ausgewiesen – gebucht wird erst, was gezahlt wird.
--   3. `fin_mahnung_zurueckziehen()`: die letzte Mahnung mit Grund zurückziehen (sie bleibt stehen, als zurückgezogen –
--      eine verschickte Mahnung ist ein Geschäftsbrief).
--
-- Verschickt wird nichts automatisch: Die App erzeugt das Schreiben zum Drucken bzw. als PDF und bereitet eine E-Mail vor.
-- Rechte: lesen/schreiben mit „Finance › Rechnungen“. PILOT wie alles in Finance. Reihenfolge: nach 98, SQL zuerst, dann
-- v157. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regprocedure('public.fin_skonto_buchen(text,uuid,date,numeric)') is null then
    raise exception 'Zuerst Migration 98 (Finance: Skonto) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

create table if not exists public.fin_mahnungen (
  id               uuid primary key default gen_random_uuid(),
  rechnung_id      uuid not null references public.rechnungen (id),
  stufe            integer not null,
  datum            date not null,
  frist            date not null,
  nummer_text      text not null,
  rechnung_datum   date not null,
  faellig_am       date not null,
  brutto           numeric(14,2) not null,
  bezahlt          numeric(14,2) not null,
  offen            numeric(14,2) not null,
  gebuehr          numeric(10,2) not null default 0,
  zinsen           numeric(10,2) not null default 0,
  zinssatz         numeric(6,3),
  text             text not null,
  absender         jsonb not null,
  empfaenger       jsonb not null,
  zurueckgezogen_am timestamptz,
  zurueck_grund    text,
  erstellt_am      timestamptz not null default now(),
  erstellt_von     uuid default auth.uid(),
  constraint fin_ma_stufe check (stufe between 1 and 3),
  constraint fin_ma_frist check (frist > datum),
  constraint fin_ma_betraege check (offen > 0 and gebuehr >= 0 and gebuehr <= 100 and zinsen >= 0),
  constraint fin_ma_text check (length(btrim(text)) between 1 and 2000)
);
create index if not exists fin_mahnungen_rechnung on public.fin_mahnungen (rechnung_id, stufe);
create unique index if not exists fin_mahnungen_stufe on public.fin_mahnungen (rechnung_id, stufe) where zurueckgezogen_am is null;
alter table public.fin_mahnungen enable row level security;
drop policy if exists "Finance-Mahnungen lesen" on public.fin_mahnungen;
create policy "Finance-Mahnungen lesen" on public.fin_mahnungen for select to authenticated using (public.darf('finance.rechnungen', 'lesen'));
revoke all on public.fin_mahnungen from anon, authenticated;
grant select on public.fin_mahnungen to authenticated;
comment on table public.fin_mahnungen is
  'Migration 99: Zahlungserinnerungen und Mahnungen mit Snapshot (Absender, Empfänger, Beträge, Text). Geschrieben nur über fin_mahnung_erstellen()/_zurueckziehen(). docs/finance.md „Mahnwesen“.';

create or replace function public.fin_mahnung_erstellen(p_rechnung uuid, p_stufe integer, p_datum date, p_frist date,
  p_gebuehr numeric, p_zinsen numeric, p_zinssatz numeric, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fr public.fin_rechnungen%rowtype;
  r public.rechnungen%rowtype;
  letzte public.fin_mahnungen%rowtype;
  bezahlt numeric; offen numeric; faellig date;
  heute date := (now() at time zone 'Europe/Berlin')::date;
  neu uuid;
begin
  if not public.darf('finance.rechnungen', 'schreiben') then
    raise exception 'Mahnen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Rechnungen“ schreiben).';
  end if;
  select * into fr from public.fin_rechnungen where rechnung_id = p_rechnung for update;
  if fr.rechnung_id is null or fr.status <> 'gebucht' then raise exception 'Die Rechnung ist in Finance nicht gebucht.'; end if;
  if fr.bezahlt_am is not null then raise exception 'Die Rechnung ist schon bezahlt.'; end if;
  select * into r from public.rechnungen where id = p_rechnung;
  if r.storniert_durch is not null then raise exception 'Die Rechnung ist storniert.'; end if;
  if r.nummer < 0 then raise exception 'Testrechnungen werden nicht gemahnt.'; end if;
  faellig := coalesce(fr.faellig_am, r.datum);
  if p_datum is null or p_datum > heute then raise exception 'Das Datum der Mahnung fehlt oder liegt in der Zukunft.'; end if;
  if p_datum <= faellig then raise exception 'Gemahnt wird erst nach der Fälligkeit (%).', to_char(faellig, 'DD.MM.YYYY'); end if;
  if p_frist is null or p_frist <= p_datum then raise exception 'Die neue Zahlungsfrist muss nach dem Datum der Mahnung liegen.'; end if;
  select * into letzte from public.fin_mahnungen where rechnung_id = p_rechnung and zurueckgezogen_am is null order by stufe desc limit 1;
  if p_stufe is distinct from coalesce(letzte.stufe, 0) + 1 then
    raise exception 'Als Nächstes kommt Stufe % – keine Stufe überspringen.', coalesce(letzte.stufe, 0) + 1;
  end if;
  if p_stufe > 3 then raise exception 'Nach der letzten Mahnung geht es nicht mit einer weiteren Mahnung weiter – Inkasso oder Mahnbescheid mit dem Steuerberater bzw. Anwalt klären.'; end if;
  if letzte.id is not null and p_datum <= letzte.frist then
    raise exception 'Die Frist der vorigen Mahnung läuft noch bis %.', to_char(letzte.frist, 'DD.MM.YYYY');
  end if;
  if p_gebuehr is null or p_gebuehr < 0 or p_gebuehr > 100 or p_gebuehr <> round(p_gebuehr, 2) then raise exception 'Die Mahngebühr liegt zwischen 0 und 100 €.'; end if;
  if p_zinsen is null or p_zinsen < 0 or p_zinsen <> round(p_zinsen, 2) then raise exception 'Die Verzugszinsen sind ungültig.'; end if;
  if coalesce(btrim(p_text), '') = '' or length(p_text) > 2000 then raise exception 'Der Text der Mahnung fehlt (höchstens 2.000 Zeichen).'; end if;
  bezahlt := public.fin_teilbezahlt('rechnung', p_rechnung);
  offen := r.brutto - bezahlt;
  if offen <= 0 then raise exception 'An dieser Rechnung ist nichts mehr offen.'; end if;
  insert into public.fin_mahnungen (rechnung_id, stufe, datum, frist, nummer_text, rechnung_datum, faellig_am, brutto, bezahlt, offen,
                                    gebuehr, zinsen, zinssatz, text, absender, empfaenger)
  values (p_rechnung, p_stufe, p_datum, p_frist, r.nummer_text, r.datum, faellig, r.brutto, bezahlt, offen,
          p_gebuehr, p_zinsen, p_zinssatz, btrim(p_text), r.absender, r.empfaenger)
  returning id into neu;
  return jsonb_build_object('id', neu, 'stufe', p_stufe, 'offen', offen);
end;
$$;

create or replace function public.fin_mahnung_zurueckziehen(p_id uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.fin_mahnungen%rowtype;
begin
  if not public.darf('finance.rechnungen', 'schreiben') then
    raise exception 'Mahnen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Rechnungen“ schreiben).';
  end if;
  if coalesce(btrim(p_grund), '') = '' then raise exception 'Bitte einen Grund angeben.'; end if;
  select * into m from public.fin_mahnungen where id = p_id for update;
  if m.id is null or m.zurueckgezogen_am is not null then raise exception 'Diese Mahnung gibt es nicht (mehr).'; end if;
  if exists (select 1 from public.fin_mahnungen x where x.rechnung_id = m.rechnung_id and x.zurueckgezogen_am is null and x.stufe > m.stufe) then
    raise exception 'Zuerst die spätere Mahnung zurückziehen.';
  end if;
  update public.fin_mahnungen set zurueckgezogen_am = now(), zurueck_grund = left(btrim(p_grund), 200) where id = p_id;
end;
$$;

revoke all on function public.fin_mahnung_erstellen(uuid, integer, date, date, numeric, numeric, numeric, text) from public, anon;
revoke all on function public.fin_mahnung_zurueckziehen(uuid, text) from public, anon;
grant execute on function public.fin_mahnung_erstellen(uuid, integer, date, date, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.fin_mahnung_zurueckziehen(uuid, text) to authenticated;

select 'Tabelle fin_mahnungen (RLS)' as pruefung,
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_mahnungen')), 'fehlt') as ergebnis
union all
select 'Richtlinien auf fin_mahnungen',
       coalesce((select string_agg(p.cmd || ' · ' || p.policyname, ', ') from pg_policies p where p.schemaname = 'public' and p.tablename = 'fin_mahnungen'), 'keine')
union all
select 'Funktionen', (select count(*)::text || ' von 2' from unnest(array['fin_mahnung_erstellen(uuid,integer,date,date,numeric,numeric,numeric,text)',
         'fin_mahnung_zurueckziehen(uuid,text)']) x where to_regprocedure('public.' || x) is not null);
