-- =====================================================================
-- Rücknahme von Migration 117 (Ansprechpartner je Kunde, Wechselort am Auftrag, v189).
--
-- Weigert sich, solange etwas eingetragen ist, das nur Migration 117 kennt: ein Wechselort an einem Auftrag, ein
-- Fahrzeug bei einem Ansprechpartner, ein Ansprechpartner mit Adresse, Funktion, Notiz oder Nadel, mehr als einer je
-- Kunde – oder eine Firma, die von der Karte genommen ist. Sonst gingen diese Angaben verloren.
-- Holt Name und Anrede aus Ansprechpartner 1 an den Kunden zurück (Bestand aus Schritt 5 der Migration) und stellt
-- Zusammenführen, Auskunft und Schwärzen wie nach Migration 105 bzw. 57 her.
-- Alles steht in EINEM Block: Bricht die Prüfung ab, läuft auch kein Löschen weiter (CLAUDE.md, Abschnitt 2).
-- Vorher die App auf v188 zurücksetzen. Zweiter Lauf folgenlos.
-- =====================================================================

do $rueck$
declare
  gruende text := '';
  n integer;
begin
  if to_regclass('public.kunden_ansprechpartner') is not null then
    -- Getrennt geprüft: Spalten, die es im zweiten Lauf nicht mehr gibt, scheitern schon beim Planen.
    execute 'select count(*) from public.orders where wechselort is not null' into n;
    if n > 0 then gruende := gruende || format(' %s Auftrag/Aufträge mit Wechselort.', n); end if;
    execute 'select count(*) from public.vehicles where ansprechpartner_id is not null' into n;
    if n > 0 then gruende := gruende || format(' %s Fahrzeug(e) bei einem Ansprechpartner.', n); end if;
    select count(*) into n from public.kunden_ansprechpartner
     where coalesce(btrim(address), '') <> '' or coalesce(btrim(funktion), '') <> '' or coalesce(btrim(notiz), '') <> '' or auf_karte;
    if n > 0 then gruende := gruende || format(' %s Ansprechpartner mit Adresse, Funktion, Notiz oder Nadel.', n); end if;
    select count(*) into n from (select customer_id from public.kunden_ansprechpartner group by customer_id having count(*) > 1) x;
    if n > 0 then gruende := gruende || format(' %s Kunde(n) mit mehreren Ansprechpartnern.', n); end if;
    execute 'select count(*) from public.customers where not auf_karte' into n;
    if n > 0 then gruende := gruende || format(' %s Kunde(n) von der Karte genommen.', n); end if;
    if gruende <> '' then
      raise exception 'Rücknahme abgebrochen – diese Angaben gingen verloren:%  Es wurde nichts geändert.', gruende;
    end if;

    -- Name und Anrede zurück an den Kunden.
    update public.customers c
       set name = k.name, anrede = coalesce(c.anrede, k.anrede)
      from public.kunden_ansprechpartner k
     where k.customer_id = c.id and coalesce(btrim(c.name), '') = '';
  end if;

  -- Zusammenführen, Auskunft, Schwärzen wie vorher.
  execute $f$
    create or replace function public.kunden_zusammenfuehren(p_behalten uuid, p_weg uuid)
    returns table (kundennummer_weg integer, auftraege integer, fahrzeuge integer, fahrzeuge_vereint integer, reifensaetze integer, kontakte integer, rechnungen integer)
    language plpgsql security definer set search_path = ''
    as $b$
    begin
      return query select * from public.kunden_zusammenfuehren_grund(p_behalten, p_weg);
      update public.bestellwuensche w set kunde_id = p_behalten where w.kunde_id = p_weg;
    end;
    $b$
  $f$;
  execute $f$
    create or replace function public.kunde_auskunft(p_kunde uuid)
    returns jsonb language plpgsql stable security definer set search_path = ''
    as $b$
    declare
      ergebnis jsonb;
    begin
      ergebnis := public.kunde_auskunft_grund(p_kunde);
      return ergebnis
        || jsonb_build_object('belege', coalesce((
             select jsonb_agg(jsonb_build_object('auftrag', o.order_number, 'art', b.art, 'beschriftung', b.beschriftung,
                                                 'aufgenommen', b.created_at) order by b.created_at, b.id)
               from public.auftrag_belege b join public.orders o on o.id = b.order_id
              where o.customer_id = p_kunde), '[]'::jsonb))
        || jsonb_build_object('reifen_notizen', coalesce((
             select jsonb_agg(jsonb_build_object('eingelagert', t.created_at, 'platz', s.code, 'position', n.pos, 'notiz', n.txt)
                              order by t.created_at, t.id, n.ord)
               from public.tire_storage t
               left join public.storage_slots s on s.id = t.storage_slot_id
               cross join lateral (values (1, 'VL', t.notiz_vl), (2, 'VR', t.notiz_vr), (3, 'HL', t.notiz_hl), (4, 'HR', t.notiz_hr)) as n(ord, pos, txt)
              where t.customer_id = p_kunde and coalesce(btrim(n.txt), '') <> ''), '[]'::jsonb))
        || jsonb_build_object('bestellungen', coalesce((
             select jsonb_agg(jsonb_build_object('eingetragen', w.created_at, 'text', w.text, 'menge', w.menge, 'status', w.status,
                                                 'notiz', w.notiz, 'grund', w.grund, 'foto', w.foto_pfad is not null)
                              order by w.created_at, w.id)
               from public.bestellwuensche w
              where w.kunde_id = p_kunde
                 or w.auftrag_id in (select o.id from public.orders o where o.customer_id = p_kunde)), '[]'::jsonb));
    end;
    $b$
  $f$;
  execute $f$
    create or replace function public.protokoll_schwaerzen(frist interval default interval '36 months')
    returns integer language plpgsql security definer set search_path = ''
    as $b$
    declare
      felder constant text[] := array[
        'name', 'company', 'anrede', 'address', 'email', 'phone_mobile', 'phone_landline',
        'lat', 'lng', 'license_plate', 'kennzeichen',
        'note', 'notiz', 'bemerkung', 'description', 'techniker_notiz',
        'cancel_reason', 'reopen_reason', 'kontakt_notiz',
        'laufkunde_name', 'laufkunde_telefon', 'laufkunde_ort'
      ];
      tabellen constant text[] := array[
        'customers', 'vehicles', 'contact_history', 'orders', 'order_articles',
        'tire_storage', 'eingelagerte_raeder', 'auftrag_fahrzeuge', 'employees', 'profiles'
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
    $b$
  $f$;
  revoke all on function public.protokoll_schwaerzen(interval) from public, anon, authenticated;

  drop trigger if exists trg_auftrag_wechselort on public.orders;
  drop trigger if exists trg_fahrzeug_ansprechpartner on public.vehicles;
  drop function if exists public.auftrag_wechselort();
  drop function if exists public.fahrzeug_ansprechpartner_pruefen();
  alter table public.orders drop constraint if exists orders_wechselort_werte;
  alter table public.orders drop constraint if exists orders_einsatz_laengen;
  alter table public.orders
    drop column if exists wechselort, drop column if exists ansprechpartner_id, drop column if exists einsatz_name,
    drop column if exists einsatz_adresse, drop column if exists einsatz_lat, drop column if exists einsatz_lng,
    drop column if exists einsatz_geo_genauigkeit;
  alter table public.vehicles drop column if exists ansprechpartner_id;
  drop table if exists public.kunden_ansprechpartner;
  drop function if exists public.ansprechpartner_nachziehen();
  drop function if exists public.ansprechpartner_daten(uuid);
  alter table public.customers drop column if exists auf_karte;
end $rueck$;

select 'Migration 117 zurückgenommen' as pruefung,
       case when to_regclass('public.kunden_ansprechpartner') is null
             and not exists (select 1 from information_schema.columns where table_schema = 'public'
                              and ((table_name = 'orders' and column_name = 'wechselort') or (table_name = 'customers' and column_name = 'auf_karte')))
            then 'ja' else 'NEIN' end as ergebnis;
