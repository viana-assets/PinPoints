-- =====================================================================
-- Migration 116 – Finance, Stufe H: Prüfliste für Monats- und Jahresabschluss (30.10.2026, v186).
--
-- docs/finance.md Abschnitt 21.
--
--   `fin_pruefung(jahr)`: was die GoBD-Vollständigkeit stört, in einer Antwort – nur lesend, nichts wird geändert.
--     - Lücken in der Buchungsnummer des Jahres (fin_buchungen.nr) und im Rechnungskreis (rechnungen.nummer, ohne Test).
--     - Buchungen von Hand ohne Belegnummer und ohne Belegbild (Migration 114) – die ersten 50, dazu die Zahl.
--     - Zeilen auf Forderungs- bzw. Verbindlichkeitskonten ohne Personenkonto (von Hand gebucht).
--     - Bankumsätze, die seit mehr als 14 Tagen offen sind; Belege, die seit mehr als 30 Tagen im Entwurf liegen.
--     - Vergangene Monate, die noch nicht festgeschrieben sind.
--   Keine Kundendaten: Namen und Anschriften stehen nicht darin, nur Nummern, Daten, Beträge und Buchungstexte.
--   Lesen mit „Finance › Auswertungen und Abschluss“.
--
-- Reihenfolge: nach 115, SQL zuerst, dann v186. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_plan') is null then
    raise exception 'Zuerst Migration 115 (Finance: Planwerte) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

create or replace function public.fin_pruefung(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rahmen text;
  v_bis_monat integer;
  r jsonb;
begin
  if not public.darf('finance.abschluss', 'lesen') then
    raise exception 'Die Prüfliste ist für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen und Abschluss“).';
  end if;
  select kontenrahmen into v_rahmen from public.fin_einstellungen where wirtschaftsjahr = p_jahr;
  -- Bis wohin festgeschrieben sein sollte: alle Monate vor dem laufenden (im laufenden Jahr), sonst alle zwölf.
  v_bis_monat := case when p_jahr < extract(year from current_date)::integer then 12
                      when p_jahr = extract(year from current_date)::integer then extract(month from current_date)::integer - 1
                      else 0 end;

  select jsonb_build_object(
    'eingerichtet', v_rahmen is not null,
    'luecken_buchungen', coalesce((
      select jsonb_agg(n order by n) from (
        select g.n from generate_series(1, coalesce((select max(nr) from public.fin_buchungen where jahr = p_jahr), 0)) g(n)
         where not exists (select 1 from public.fin_buchungen b where b.jahr = p_jahr and b.nr = g.n)
         limit 100) x), '[]'::jsonb),
    'luecken_rechnungen', coalesce((
      with kreis as (
        select min(nummer) as von, max(nummer) as bis from public.rechnungen where nummer > 0 and extract(year from datum)::integer = p_jahr)
      select jsonb_agg(n order by n) from (
        select g.n from kreis, generate_series(kreis.von, kreis.bis) g(n)
         where kreis.von is not null and not exists (select 1 from public.rechnungen r where r.nummer = g.n)
         limit 100) x), '[]'::jsonb),
    'ohne_beleg_zahl', (
      select count(*) from public.fin_buchungen b
       where b.jahr = p_jahr and b.quelle = 'manuell' and b.storno_von is null and b.storniert_durch is null
         and coalesce(btrim(b.beleg), '') = ''
         and not exists (select 1 from public.fin_buchung_dateien d where d.buchung_id = b.id)),
    'ohne_beleg', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nr', x.nr, 'datum', x.datum, 'text', x.text, 'betrag', x.betrag) order by x.nr) from (
        select b.id, b.nr, b.datum, b.text,
               (select sum(z.betrag) from public.fin_buchungszeilen z where z.buchung_id = b.id and z.seite = 'S') as betrag
          from public.fin_buchungen b
         where b.jahr = p_jahr and b.quelle = 'manuell' and b.storno_von is null and b.storniert_durch is null
           and coalesce(btrim(b.beleg), '') = ''
           and not exists (select 1 from public.fin_buchung_dateien d where d.buchung_id = b.id)
         order by b.nr limit 50) x), '[]'::jsonb),
    'ohne_personenkonto', (
      select count(*) from public.fin_buchungszeilen z
        join public.fin_buchungen b on b.id = z.buchung_id
        join public.fin_konten k on k.kontenrahmen = v_rahmen and k.nummer = z.konto and k.kategorie in ('forderung', 'verbindlichkeit')
       where b.jahr = p_jahr and z.personenkonto is null and not z.ist_steuer and b.quelle = 'manuell'),
    'bank_offen', (
      select jsonb_build_object('zahl', count(*), 'summe', coalesce(sum(u.betrag), 0), 'aeltester', min(u.datum))
        from public.fin_bankumsaetze u
       where u.status = 'offen' and u.datum < current_date - 14 and extract(year from u.datum)::integer <= p_jahr),
    'entwuerfe_alt', (
      select count(*) from public.fin_belege e where e.status = 'entwurf' and e.erstellt_am < now() - interval '30 days'
         and extract(year from e.belegdatum)::integer <= p_jahr),
    'monate_offen', coalesce((
      select jsonb_agg(m order by m) from generate_series(1, greatest(v_bis_monat, 0)) m
       where v_bis_monat > 0 and not exists (select 1 from public.fin_festschreibungen f where f.jahr = p_jahr and f.monat = m)), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;
revoke all on function public.fin_pruefung(integer) from public, anon;
grant execute on function public.fin_pruefung(integer) to authenticated;

select 'Funktion fin_pruefung' as pruefung,
       case when to_regprocedure('public.fin_pruefung(integer)') is not null then 'ja' else 'FEHLT' end as ergebnis;
