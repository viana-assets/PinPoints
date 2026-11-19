-- =====================================================================
-- Rücknahme von Migration 118 (Kundenpreise, v191).
--
-- Weigert sich, solange Kundenpreise eingetragen sind oder eine Position einen Kundenpreis trägt
-- (`order_articles.listenpreis_netto`) – sonst ginge verloren, wer welchen Preis bekommt und woher ein Preis kam.
-- Die Preise an den Positionen selbst bleiben in jedem Fall, wie sie sind.
-- Stellt Zusammenführen, Auskunft und Schwärzen wie nach Migration 117 her.
-- Alles steht in EINEM Block: Bricht die Prüfung ab, läuft auch kein Löschen weiter (CLAUDE.md, Abschnitt 2).
-- Vorher die App auf v190 zurücksetzen. Zweiter Lauf folgenlos.
-- =====================================================================

do $rueck$
declare
  gruende text := '';
  n integer;
begin
  if to_regclass('public.kunden_preise') is not null then
    select count(*) into n from public.kunden_preise;
    if n > 0 then gruende := gruende || format(' %s Kundenpreis(e) eingetragen.', n); end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_articles'
              and column_name = 'listenpreis_netto') then
    execute 'select count(*) from public.order_articles where listenpreis_netto is not null' into n;
    if n > 0 then gruende := gruende || format(' %s Position(en) mit Kundenpreis.', n); end if;
  end if;
  if gruende <> '' then
    raise exception 'Rücknahme abgebrochen – diese Angaben gingen verloren:%  Es wurde nichts geändert.', gruende;
  end if;

  execute $f1$
create or replace function public.kunden_zusammenfuehren(p_behalten uuid, p_weg uuid)
returns table (kundennummer_weg integer, auftraege integer, fahrzeuge integer, fahrzeuge_vereint integer, reifensaetze integer, kontakte integer, rechnungen integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kunden_ansprechpartner k set customer_id = p_behalten where k.customer_id = p_weg and p_behalten <> p_weg;
  return query select * from public.kunden_zusammenfuehren_grund(p_behalten, p_weg);
  -- Sonst gingen sie beim endgültigen Löschen des zweiten Kunden mit (Migration 105).
  update public.bestellwuensche w set kunde_id = p_behalten where w.kunde_id = p_weg;
end;
$$;
  $f1$;
  execute $f2$
create or replace function public.kunde_auskunft(p_kunde uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ergebnis jsonb;
begin
  -- Prüft Rolle und Laufkundschaft selbst und bricht sonst ab.
  ergebnis := public.kunde_auskunft_grund(p_kunde);
  return ergebnis
    || jsonb_build_object('belege', coalesce((
         select jsonb_agg(jsonb_build_object('auftrag', o.order_number, 'art', b.art, 'beschriftung', b.beschriftung,
                                             'aufgenommen', b.created_at) order by b.created_at, b.id)
           from public.auftrag_belege b join public.orders o on o.id = b.order_id
          where o.customer_id = p_kunde), '[]'::jsonb))
    -- Migration 71
    || jsonb_build_object('reifen_notizen', coalesce((
         select jsonb_agg(jsonb_build_object('eingelagert', t.created_at, 'platz', s.code, 'position', n.pos, 'notiz', n.txt)
                          order by t.created_at, t.id, n.ord)
           from public.tire_storage t
           left join public.storage_slots s on s.id = t.storage_slot_id
           cross join lateral (values (1, 'VL', t.notiz_vl), (2, 'VR', t.notiz_vr), (3, 'HL', t.notiz_hl), (4, 'HR', t.notiz_hr)) as n(ord, pos, txt)
          where t.customer_id = p_kunde and coalesce(btrim(n.txt), '') <> ''), '[]'::jsonb))
    -- Migration 105
    || jsonb_build_object('bestellungen', coalesce((
         select jsonb_agg(jsonb_build_object('eingetragen', w.created_at, 'text', w.text, 'menge', w.menge, 'status', w.status,
                                             'notiz', w.notiz, 'grund', w.grund, 'foto', w.foto_pfad is not null)
                          order by w.created_at, w.id)
           from public.bestellwuensche w
          where w.kunde_id = p_kunde
             or w.auftrag_id in (select o.id from public.orders o where o.customer_id = p_kunde)), '[]'::jsonb))
    -- Migration 117
    || jsonb_build_object('ansprechpartner', coalesce((
         select jsonb_agg(jsonb_build_object('anrede', k.anrede, 'name', k.name, 'funktion', k.funktion, 'telefon', k.telefon,
                                             'email', k.email, 'adresse', k.address, 'auf_karte', k.auf_karte, 'notiz', k.notiz,
                                             'angelegt', k.created_at) order by k.sortierung, k.name, k.id)
           from public.kunden_ansprechpartner k where k.customer_id = p_kunde), '[]'::jsonb))
    || jsonb_build_object('wechselorte', coalesce((
         select jsonb_agg(jsonb_build_object('auftrag', o.order_number, 'datum', o.order_date, 'bei', o.einsatz_name, 'adresse', o.einsatz_adresse)
                          order by o.order_date, o.order_number)
           from public.orders o where o.customer_id = p_kunde and o.wechselort is not null), '[]'::jsonb));
end;
$$;
  $f2$;
  execute $f3$
create or replace function public.protokoll_schwaerzen(frist interval default interval '36 months')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  felder constant text[] := array[
    'name', 'company', 'anrede', 'address', 'email', 'phone_mobile', 'phone_landline',
    'lat', 'lng', 'license_plate', 'kennzeichen',
    'note', 'notiz', 'bemerkung', 'description', 'techniker_notiz',
    'cancel_reason', 'reopen_reason', 'kontakt_notiz',
    -- Migration 57: der Laufkunde am Auftrag
    'laufkunde_name', 'laufkunde_telefon', 'laufkunde_ort',
    -- Migration 117: Ansprechpartner und Wechselort
    'telefon', 'funktion', 'einsatz_name', 'einsatz_adresse', 'einsatz_lat', 'einsatz_lng'
  ];
  tabellen constant text[] := array[
    'customers', 'vehicles', 'contact_history', 'orders', 'order_articles',
    'tire_storage', 'eingelagerte_raeder', 'auftrag_fahrzeuge', 'employees', 'profiles',
    'kunden_ansprechpartner'
  ];
  anzahl integer;
begin
  update public.audit_log a
     set alt = case when a.alt is null then null else (
                 select coalesce(jsonb_object_agg(e.key,
                          case when e.key = any(felder) and e.value <> 'null'::jsonb
                               then to_jsonb('geschwärzt'::text) else e.value end), '{}'::jsonb)
                   from jsonb_each(a.alt) e) end,
         neu = case when a.neu is null then null else (
                 select coalesce(jsonb_object_agg(e.key,
                          case when e.key = any(felder) and e.value <> 'null'::jsonb
                               then to_jsonb('geschwärzt'::text) else e.value end), '{}'::jsonb)
                   from jsonb_each(a.neu) e) end,
         geschwaerzt_am = now()
   where a.geschwaerzt_am is null
     and a.geaendert_am < now() - frist
     and a.tabelle = any(tabellen);
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;
  $f3$;
  revoke all on function public.protokoll_schwaerzen(interval) from public, anon, authenticated;

  drop trigger if exists trg_position_kundenpreis on public.order_articles;
  drop function if exists public.position_kundenpreis();
  alter table public.order_articles drop column if exists listenpreis_netto;
  drop table if exists public.kunden_preise;
  drop function if exists public.kunden_preis_pruefen();
end $rueck$;

select 'Migration 118 zurückgenommen' as pruefung,
       case when to_regclass('public.kunden_preise') is null
             and not exists (select 1 from information_schema.columns where table_schema = 'public'
                              and table_name = 'order_articles' and column_name = 'listenpreis_netto')
            then 'ja' else 'NEIN' end as ergebnis;
