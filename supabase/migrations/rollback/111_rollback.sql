-- =====================================================================
-- Rücknahme Migration 111 – alle Rechnungen, Leistungsart aus dem Artikel (v184).
--
-- Stellt die Rechnungsbuchung wieder her wie vor 111 (`fin_rechnung_buchen_kern()`, `fin_rechnung_erfassen()`,
-- `fin_rechnung_nachbuchen()` aus Migration 89, `fin_rechnungen_stand()` aus Migration 93): wieder nur Aufträge mit
-- „Rechnung nötig“, Erlöse je Steuersatz ohne Leistungsart. Entfernt `fin_artikel_kost` (die abweichenden
-- Leistungsarten gehen verloren), die neuen Funktionen und die Spalten `rechnungen_umfang`/`ohne_ausweis`.
-- Schon gebuchte Rechnungen bleiben gebucht (mit ihren Kostenstellen). Zweimal lauffähig. Danach die App auf v183.
-- =====================================================================

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
               'teilbezahlt', public.fin_teilbezahlt('rechnung', r.id),
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

drop function if exists public.fin_rechnungen_nachbuchen_alle(integer);
drop function if exists public.fin_artikel_kost_setzen(uuid, text);
drop function if exists public.fin_artikel_leistungsarten();
drop function if exists public.fin_auftrag_transporter(uuid);
drop function if exists public.fin_artikel_leistungsart(integer);
drop function if exists public.fin_leistungsart_vorgabe(text);
drop function if exists public.fin_umfang(date);
drop table if exists public.fin_artikel_kost;
alter table public.fin_einstellungen drop constraint if exists fin_einst_umfang;
alter table public.fin_einstellungen drop constraint if exists fin_einst_ohne_ausweis;
alter table public.fin_einstellungen drop column if exists rechnungen_umfang;
alter table public.fin_einstellungen drop column if exists ohne_ausweis;

select 'Spalten rechnungen_umfang/ohne_ausweis' as pruefung,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fin_einstellungen'
                          and column_name in ('rechnungen_umfang', 'ohne_ausweis')) then 'noch da' else 'weg' end as ergebnis
union all
select 'Tabelle fin_artikel_kost', case when to_regclass('public.fin_artikel_kost') is null then 'weg' else 'noch da' end
union all
select 'Rechnungsbuchung ohne Leistungsart', case when position('fin_artikel_leistungsart' in pg_get_functiondef('public.fin_rechnung_buchen_kern(uuid)'::regprocedure)) = 0 then 'ja' else 'nein' end;
