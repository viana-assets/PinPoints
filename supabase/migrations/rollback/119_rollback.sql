-- =====================================================================
-- Rücknahme von Migration 119 (Kundenartikel, v192).
--
-- Weigert sich, solange es Kundenartikel gibt – sonst würden sie zu Artikeln für alle. Wer zurück will, macht sie vorher
-- im Artikelstamm zu normalen Artikeln oder löscht die unbenutzten.
-- Stellt „Kunde endgültig löschen“ (Migration 105), „Testkunde restlos löschen“ (Migration 60), Zusammenführen, Auskunft
-- und die Prüfung der Kundenpreise (Migration 118) wieder her.
-- Alles steht in EINEM Block: Bricht die Prüfung ab, läuft auch kein Löschen weiter (CLAUDE.md, Abschnitt 2).
-- Vorher die App auf v191 zurücksetzen. Zweiter Lauf folgenlos.
-- =====================================================================

do $rueck$
declare
  n integer;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'articles' and column_name = 'customer_id') then
    execute 'select count(*) from public.articles where customer_id is not null' into n;
    if n > 0 then
      raise exception 'Rücknahme abgebrochen – es gibt % Kundenartikel; sie würden zu Artikeln für alle. Es wurde nichts geändert.', n;
    end if;
  end if;

  execute $f1$
create or replace function public.kunden_preis_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k record;
  art text;
begin
  select c.laufkundschaft into k from public.customers c where c.id = new.customer_id;
  if coalesce(k.laufkundschaft, false) then
    raise exception 'Für die Laufkundschaft gibt es keine Kundenpreise – dort gilt der Listenpreis.';
  end if;
  select a.abrechnungsart into art from public.articles a where a.id = new.article_id;
  if art in ('reifenverkauf_neu', 'reifenverkauf_gebraucht') then
    raise exception 'Beim Reifenverkauf kommt der Preis vom Reifen – dafür gibt es keinen Kundenpreis.';
  end if;
  -- Vor dem Überschneidungsvergleich: Ein umgedrehter Zeitraum wäre sonst ein technischer Fehler statt einer Meldung.
  if new.valid_from is not null and new.valid_to is not null and new.valid_to < new.valid_from then
    raise exception 'Das Ende (gültig bis) liegt vor dem Anfang (gültig ab).';
  end if;
  if exists (select 1 from public.kunden_preise p
              where p.customer_id = new.customer_id and p.article_id = new.article_id and p.id <> new.id
                and daterange(coalesce(p.valid_from, '-infinity'::date), coalesce(p.valid_to, 'infinity'::date), '[]')
                 && daterange(coalesce(new.valid_from, '-infinity'::date), coalesce(new.valid_to, 'infinity'::date), '[]')) then
    raise exception 'Für diesen Artikel hat der Kunde im selben Zeitraum schon einen Kundenpreis. Den anderen zuerst beenden (gültig bis) oder ändern.';
  end if;
  return new;
end;
$$;
  $f1$;
  execute $f2$
create or replace function public.kunden_zusammenfuehren(p_behalten uuid, p_weg uuid)
returns table (kundennummer_weg integer, auftraege integer, fahrzeuge integer, fahrzeuge_vereint integer, reifensaetze integer, kontakte integer, rechnungen integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kunden_ansprechpartner k set customer_id = p_behalten where k.customer_id = p_weg and p_behalten <> p_weg;
  -- Migration 118: Kundenpreise wandern mit, soweit der verbleibende Kunde für denselben Artikel und Zeitraum nicht
  -- schon einen eigenen hat (der bleibt dann maßgeblich; der andere geht mit dem zweiten Kunden).
  update public.kunden_preise p set customer_id = p_behalten
   where p.customer_id = p_weg and p_behalten <> p_weg
     and not exists (select 1 from public.kunden_preise q
                      where q.customer_id = p_behalten and q.article_id = p.article_id
                        and daterange(coalesce(q.valid_from, '-infinity'::date), coalesce(q.valid_to, 'infinity'::date), '[]')
                         && daterange(coalesce(p.valid_from, '-infinity'::date), coalesce(p.valid_to, 'infinity'::date), '[]'));
  return query select * from public.kunden_zusammenfuehren_grund(p_behalten, p_weg);
  -- Sonst gingen sie beim endgültigen Löschen des zweiten Kunden mit (Migration 105).
  update public.bestellwuensche w set kunde_id = p_behalten where w.kunde_id = p_weg;
end;
$$;
  $f2$;
  execute $f3$
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
          where p.customer_id = p_kunde), '[]'::jsonb));
end;
$$;
  $f3$;
  execute $f4$
create or replace function public.kunde_endgueltig_loeschen(p_kunde uuid)
returns table (kundennummer integer, auftraege integer, fahrzeuge integer, protokolleintraege integer, rechnungen_bleiben integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  wunsch_ids uuid[];
begin
  -- Vorher einsammeln: Nach dem Löschen sind Kunde und Aufträge an den Wünschen schon leer.
  select coalesce(array_agg(w.id), '{}') into wunsch_ids
    from public.bestellwuensche w
   where w.kunde_id = p_kunde
      or w.auftrag_id in (select o.id from public.orders o where o.customer_id = p_kunde);
  -- Prüft Rolle, Papierkorb, Reifen im Regal … und bricht sonst ab – dann bleibt auch hier alles.
  return query select * from public.kunde_endgueltig_loeschen_grund(p_kunde);
  -- Text und Notiz nennen oft den Kunden; das Foto zeigt womöglich sein Auto. Die Datei merkt
  -- `bestellwunsch_nachlauf()` vor.
  delete from public.bestellwuensche w where w.id = any(wunsch_ids);
end;
$$;
  $f4$;

  if to_regprocedure('public.testkunde_loeschen_grund(uuid)') is not null then
    drop function if exists public.testkunde_loeschen(uuid);
    alter function public.testkunde_loeschen_grund(uuid) rename to testkunde_loeschen;
    revoke all on function public.testkunde_loeschen(uuid) from public, anon;
    grant execute on function public.testkunde_loeschen(uuid) to authenticated;
  end if;

  drop function if exists public.kundenartikel_nach_loeschen(uuid[]);
  drop function if exists public.kundenartikel_vor_loeschen(uuid);
  drop trigger if exists trg_position_kundenartikel_pruefen on public.order_articles;
  drop function if exists public.position_kundenartikel_pruefen();
  drop trigger if exists trg_artikel_kunde_pruefen on public.articles;
  drop function if exists public.artikel_kunde_pruefen();
  alter table public.articles drop column if exists customer_id;
end $rueck$;

select 'Migration 119 zurückgenommen' as pruefung,
       case when not exists (select 1 from information_schema.columns where table_schema = 'public'
                              and table_name = 'articles' and column_name = 'customer_id')
             and to_regprocedure('public.testkunde_loeschen_grund(uuid)') is null
            then 'ja' else 'NEIN' end as ergebnis;
