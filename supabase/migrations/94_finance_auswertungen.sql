-- =====================================================================
-- Migration 94 – Finance, Phase F6: Auswertungen (14.10.2026, v152).
--
-- docs/finance.md Abschnitt 4.7, schlank – nur LESENDE Funktionen, keine neue Tabelle:
--
--   1. `fin_auswertung_salden(jahr)`: Soll und Haben je Konto und Monat – daraus rechnet die App Summen- und
--      Saldenliste und BWA (lib/finance/auswertungen.ts).
--   2. `fin_kontenblatt(jahr, konto)`: alle Zeilen eines Kontos mit Gegenkonten.
--   3. `fin_euer(jahr)`: Zufluss und Abfluss je Konto für die Einnahmen-Überschuss-Rechnung. Gezählt wird jede
--      Buchung mit Kasse oder Bank: die Gegenzeilen direkt; eine Zahlung auf eine Rechnung oder einen Beleg
--      anteilig auf die Erlös-, Aufwands- und Steuerzeilen der Rechnungs- bzw. Belegbuchung (Teilzahlungen
--      ebenso). Ohne Geld: Abschreibungen (Aufwand an Anlage). Was sich nicht zuordnen lässt (Forderung von Hand),
--      steht gesondert.
--
-- Lesen mit „Finance › Auswertungen“ ODER „Finance › Buchungen“ – Summen, keine neuen Rechte. PILOT wie alles
-- in Finance. Reihenfolge: nach 93, SQL zuerst, dann v152. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_teilzahlungen') is null then
    raise exception 'Zuerst Migration 93 (Finance: Teilzahlungen, Kassensturz) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

create or replace function public.fin_auswertung_darf()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.darf('finance.abschluss', 'lesen') or public.darf('finance.buchen', 'lesen');
$$;
revoke all on function public.fin_auswertung_darf() from public, anon, authenticated;

-- 1. Salden je Konto und Monat
create or replace function public.fin_auswertung_salden(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fin_auswertung_darf() then
    raise exception 'Auswertungen sind für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen“).';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('konto', x.konto, 'monat', x.monat, 'soll', x.soll, 'haben', x.haben) order by x.konto, x.monat)
      from (select z.konto, extract(month from b.datum)::integer as monat,
                   sum(z.betrag) filter (where z.seite = 'S') as soll, sum(z.betrag) filter (where z.seite = 'H') as haben
              from public.fin_buchungszeilen z join public.fin_buchungen b on b.id = z.buchung_id
             where b.jahr = p_jahr
             group by z.konto, extract(month from b.datum)) x), '[]'::jsonb);
end;
$$;

-- 2. Kontenblatt
create or replace function public.fin_kontenblatt(p_jahr integer, p_konto integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.fin_auswertung_darf() then
    raise exception 'Auswertungen sind für deine Rolle nicht freigeschaltet (Recht „Finance › Auswertungen“).';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'datum', b.datum, 'nr', b.nr, 'text', b.text, 'beleg', b.beleg, 'seite', z.seite, 'betrag', z.betrag,
             'steuer', z.steuerschluessel, 'storno', b.storno_von is not null or b.storniert_durch is not null,
             'gegen', (select string_agg(distinct lpad(g.konto::text, 4, '0'), ', ') from public.fin_buchungszeilen g
                        where g.buchung_id = b.id and g.konto <> p_konto and g.seite <> z.seite))
             order by b.datum, b.nr, z.id)
      from public.fin_buchungszeilen z join public.fin_buchungen b on b.id = z.buchung_id
     where b.jahr = p_jahr and z.konto = p_konto), '[]'::jsonb);
end;
$$;

-- 3. Einnahmen-Überschuss-Rechnung: Wirkung je Konto (positiv = Zufluss, negativ = Abfluss)
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

revoke all on function public.fin_auswertung_salden(integer) from public, anon;
revoke all on function public.fin_kontenblatt(integer, integer) from public, anon;
revoke all on function public.fin_euer(integer) from public, anon;
grant execute on function public.fin_auswertung_salden(integer) to authenticated;
grant execute on function public.fin_kontenblatt(integer, integer) to authenticated;
grant execute on function public.fin_euer(integer) to authenticated;

select 'Funktionen' as pruefung, (select count(*)::text || ' von 4' from unnest(array['fin_auswertung_darf()', 'fin_auswertung_salden(integer)',
         'fin_kontenblatt(integer,integer)', 'fin_euer(integer)']) x where to_regprocedure('public.' || x) is not null) as ergebnis;
