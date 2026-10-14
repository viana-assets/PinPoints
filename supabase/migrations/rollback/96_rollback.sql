-- =====================================================================
-- Rücknahme Migration 96 – Finance F8 (Jahresabschluss) wieder entfernen.
--
-- ACHTUNG: Löscht die Liste der Abschlussbuchungen (Rückstellungen, Abgrenzungen). Die Buchungen selbst und ein
-- gebuchter Saldenvortrag bleiben im Journal (es wird nie gelöscht) – vorher unter Jahresabschluss zurücknehmen, wenn
-- sie nicht bleiben sollen. Die neuen Konten gehen nur, wenn nichts darauf gebucht ist; die Quellen `abschluss`/`vortrag`
-- bleiben erlaubt, solange es solche Buchungen gibt. `fin_euer()`, `fin_kassensturz()` und `fin_stornieren()` werden
-- die Fassungen aus 94, 93 und 95. Vorher ggf. „Alle Daten sichern“. Zweiter Lauf folgenlos.
-- =====================================================================

-- wie Migration 94
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

-- wie Migration 93
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
   where z.konto = kasse and b.datum <= p_datum;
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

-- wie Migration 95
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

drop function if exists public.fin_vortrag_zuruecknehmen(integer, text);
drop function if exists public.fin_vortrag_buchen(integer, text);
drop function if exists public.fin_vortrag_vorschau(integer);
drop function if exists public.fin_vortrag_buchung(integer);
drop function if exists public.fin_vortrag_zeilen(integer);
drop function if exists public.fin_abschlussposten_zuruecknehmen(uuid, text);
drop function if exists public.fin_abschlussposten_aufloesen(uuid);
drop function if exists public.fin_abschlussposten_buchen(integer, text, integer, numeric, text);
drop function if exists public.fin_abschluss_konto(text, text);
drop table if exists public.fin_abschlussposten;

delete from public.fin_konten k where (k.kontenrahmen, k.nummer) in (('skr03', 860), ('skr04', 2970), ('skr03', 970), ('skr04', 3070), ('skr03', 980), ('skr04', 1900), ('skr03', 990), ('skr04', 3900))
   and not exists (select 1 from public.fin_buchungszeilen z where z.konto = k.nummer);

do $$
begin
  if not exists (select 1 from public.fin_buchungen where quelle in ('abschluss', 'vortrag')) then
    alter table public.fin_buchungen drop constraint if exists fin_buchung_quelle;
    alter table public.fin_buchungen add constraint fin_buchung_quelle check (quelle in ('manuell', 'rechnung', 'zahlung', 'beleg', 'bank', 'kasse', 'afa', 'abgang'));
  end if;
end $$;

select 'Rücknahme 96' as pruefung,
       case when to_regclass('public.fin_abschlussposten') is null and to_regprocedure('public.fin_vortrag_buchen(integer,text)') is null
            then 'entfernt' else 'NICHT vollständig' end as ergebnis;
