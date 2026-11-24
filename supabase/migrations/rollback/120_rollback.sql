-- =====================================================================
-- Rücknahme von Migration 120 (Reklamationsauftrag, v193).
--
-- Weigert sich, solange es Reklamationen gibt – sie würden sonst zu gewöhnlichen Aufträgen ohne Grund und Bezug.
-- Gedacht für den Fall, dass die Migration gerade erst lief und noch keine Reklamation angelegt wurde.
-- Der interne Stundensatz in den Betriebsdaten geht mit der Spalte verloren (eine Einstellung, keine Fachdaten).
-- Stellt den Auskunftsauszug von Migration 119 wieder her.
-- Alles steht in EINEM Block: Bricht die Prüfung ab, läuft auch kein Löschen weiter (CLAUDE.md, Abschnitt 2).
-- Vorher die App auf v192 zurücksetzen. Zweiter Lauf folgenlos.
-- =====================================================================

do $rueck$
declare
  n integer;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'art') then
    execute $q$select count(*) from public.orders where art = 'reklamation'$q$ into n;
    if n > 0 then
      raise exception 'Rücknahme abgebrochen – es gibt % Reklamationen; sie würden zu gewöhnlichen Aufträgen. Es wurde nichts geändert.', n;
    end if;
  end if;

  drop trigger if exists trg_auftrag_reklamation_pruefen on public.orders;
  drop function if exists public.auftrag_reklamation_pruefen();
  drop function if exists public.reklamation_bezug_schnappschuss(uuid);

  execute $f1$
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
           from public.orders o where o.customer_id = p_kunde and o.wechselort is not null), '[]'::jsonb))
    -- Migration 118
    || jsonb_build_object('kundenpreise', coalesce((
         select jsonb_agg(jsonb_build_object('artikel', a.short_name, 'preis_netto', p.net_price, 'ab', p.valid_from, 'bis', p.valid_to,
                                             'notiz', p.notiz, 'angelegt', p.created_at) order by a.short_name, p.valid_from nulls first, p.id)
           from public.kunden_preise p join public.articles a on a.id = p.article_id
          where p.customer_id = p_kunde), '[]'::jsonb))
    -- Migration 119
    || jsonb_build_object('kundenartikel', coalesce((
         select jsonb_agg(jsonb_build_object('nummer', a.article_number, 'artikel', a.short_name, 'bezeichnung', a.long_name,
                                             'aktiv', a.active, 'angelegt', a.created_at) order by a.article_number)
           from public.articles a where a.customer_id = p_kunde), '[]'::jsonb));
end;
$$;
$f1$;
  execute $f2$comment on function public.kunde_auskunft(uuid) is
  'Migration 64/65/71/105/117/118/119: Auskunftsauszug je Kunde (Art. 15 DSGVO), mit Belegen, Rad-Notizen, Bestellwünschen, Ansprechpartnern, Wechselorten, Kundenpreisen und Kundenartikeln. Admin und Superadmin.'$f2$;
  execute $f2$revoke all on function public.kunde_auskunft(uuid) from public, anon$f2$;
  execute $f2$grant execute on function public.kunde_auskunft(uuid) to authenticated$f2$;

  drop index if exists public.orders_reklamation_von_idx;
  drop index if exists public.orders_reklamation_idx;
  alter table public.orders drop constraint if exists orders_reklamation_felder;
  alter table public.orders drop constraint if exists orders_reklamation_laengen;
  alter table public.orders drop constraint if exists orders_reklamation_ergebnis_werte;
  alter table public.orders drop constraint if exists orders_reklamation_grund_werte;
  alter table public.orders drop constraint if exists orders_art_werte;
  alter table public.orders drop column if exists reklamation_bezug;
  alter table public.orders drop column if exists reklamation_ergebnis;
  alter table public.orders drop column if exists reklamation_ohne_bezug;
  alter table public.orders drop column if exists reklamation_text;
  alter table public.orders drop column if exists reklamation_grund;
  alter table public.orders drop column if exists reklamation_von;
  alter table public.orders drop column if exists art;
  alter table public.betrieb drop constraint if exists betrieb_stundensatz_intern;
  alter table public.betrieb drop column if exists stundensatz_intern;
end
$rueck$;

select 'Migration 120 zurückgenommen' as pruefung,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders'
                          and column_name = 'art') then 'NEIN – Spalte art steht noch' else 'ja' end as ergebnis;
