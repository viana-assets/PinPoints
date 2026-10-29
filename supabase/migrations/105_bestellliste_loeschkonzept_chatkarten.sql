-- =====================================================================
-- Migration 105 – Bestellliste im Löschkonzept, Name des Eintragenden, Chat-Karten für Bestellung und
-- Packliste (29.10.2026, v174).
--
-- Anlass: Rückfrage Vitali 29.10.2026 – „Beinhaltet das Löschkonzept alles? … Datensicherung? … Kann man
-- Bestellliste und Packliste in den Chat ziehen wie einen Auftrag?“ – und gleich danach: „bei der
-- Bestellung sollte der Name von demjenigen stehen, der angemeldet ist“.
--
-- Was die Durchsicht ergeben hat:
--   - „Alle Daten löschen“ (72/86) und „Alle Daten sichern“ gehen über ALLE Tabellen in `public` –
--     Bestellliste, „+1“, Packliste-Haken (`mitnehmen_gepackt`), Chat, Stempeluhr, Finance sind ohne eigene
--     Zeile dabei. Die Fotos der Bestellliste räumt `app/api/alle-daten/fotos` (seit v173) ab.
--   - Saisonliste und Packliste sind Ansichten auf Aufträge und Lager; eigene Daten hat nur die Packliste
--     (`mitnehmen_gepackt`), und die hängt per Kaskade am Satz.
--   - LÜCKE: Beim endgültigen Löschen eines Kunden verlor ein Bestellwunsch nur den Verweis – Text, Notiz
--     und Foto blieben stehen, und im Auskunftsauszug (Art. 15) fehlte er. Und erledigte Wünsche blieben
--     für immer.
--
-- Was diese Migration tut:
--   1. Name des Eintragenden als Schnappschuss (`bestellwuensche.erstellt_name`, `bestellwunsch_plus.name`),
--      gesetzt von der Datenbank aus der Anmeldung – nicht vom Gerät. Bleibt lesbar, auch wenn der Zugang
--      später entfernt wird. Bestehende Einträge werden nachgetragen.
--   2. Fotos: Wird ein Wunsch gelöscht oder sein Foto ersetzt, merkt die Datenbank den Pfad vor
--      (`private.bestell_fotos_weg`, wie beim Chat, Migration 84); der Minutentakt löscht die Datei.
--   3. Aufbewahrung: Erledigte Wünsche („da“, „nicht nötig“) werden 12 Monate nach dem Erledigen gelöscht
--      (`bestell_aufraeumen()`, nächtlich 03:45 UTC) – dieselbe Frist wie im Chat.
--   4. Kunde endgültig löschen: Bestellwünsche zu diesem Kunden oder seinen Aufträgen gehen mit.
--      Kunden zusammenführen: Bestellwünsche wandern zum Kunden, der bleibt.
--   5. Auskunftsauszug: die Bestellwünsche zum Kunden stehen darin.
--   6. Chat-Karten „Bestellung“ und „Packliste“ (ein Tag). Die Packliste hat keine eigene Zeile; ihre Karte
--      trägt den Tag in einer festen Kennung `00000000-0000-4000-8000-0000JJJJMMTT` (`bezug_id` ist uuid,
--      und die Bearbeiten-Regel aus Migration 84 kennt genau diese vier Bezug-Spalten).
--      Wird ein Bestellwunsch gelöscht, heißt seine Karte „Bestellung gelöscht“.
--
-- Reihenfolge: nach 104, SQL zuerst, dann die Dateien von v174. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.orders') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.profiles / public.orders. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.bestellwuensche') is null then
    raise exception 'Zuerst Migration 104 (Bestellliste) ausführen – die Tabelle public.bestellwuensche fehlt. Es wurde nichts geändert.';
  end if;
  if to_regclass('public.chat_nachrichten') is null or to_regprocedure('public.kunde_auskunft_grund(uuid)') is null
     or to_regprocedure('public.kunden_zusammenfuehren(uuid,uuid)') is null then
    raise exception 'Es fehlen frühere Migrationen (Chat 80, Auskunft 65, Zusammenführen 78). Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Wer hat es eingetragen – Name aus der Anmeldung
-- ---------------------------------------------------------------------
-- Derselbe Name wie im Chat (`chat_personen()`, Migration 80): der Mitarbeitername zum Zugang, sonst der
-- Teil der E-Mail vor dem @. Nur für die Trigger unten, nicht von außen aufrufbar.
create or replace function public.zugang_anzeigename(p_profil uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim((select e.name from public.employees e where e.profile_id = p_profil order by e.created_at, e.id limit 1)), ''),
    nullif(split_part(coalesce((select p.email from public.profiles p where p.id = p_profil), ''), '@', 1), ''),
    case when p_profil is null then null else 'Zugang' end);
$$;
revoke all on function public.zugang_anzeigename(uuid) from public, anon, authenticated;

alter table public.bestellwuensche add column if not exists erstellt_name text;
alter table public.bestellwunsch_plus add column if not exists name text;
alter table public.bestellwuensche drop constraint if exists bw_erstellt_name;
alter table public.bestellwuensche add constraint bw_erstellt_name check (erstellt_name is null or char_length(erstellt_name) <= 120);
comment on column public.bestellwuensche.erstellt_name is
  'Migration 105: Name dessen, der eingetragen hat – Schnappschuss aus der Anmeldung (zugang_anzeigename), nicht änderbar.';
comment on column public.bestellwunsch_plus.name is 'Migration 105: Name zum „+1“ – Schnappschuss aus der Anmeldung.';

-- Läuft NACH `trg_bestellwunsch_pruefen` (Trigger feuern nach Namen), also mit dem dort gesetzten
-- `erstellt_von`. Mit security definer, weil Techniker die Mitarbeitertabelle nicht lesen dürfen.
create or replace function public.bestellwunsch_wer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.erstellt_name is null then
    new.erstellt_name := left(public.zugang_anzeigename(new.erstellt_von), 120);
  else
    new.erstellt_name := old.erstellt_name;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bestellwunsch_wer on public.bestellwuensche;
create trigger trg_bestellwunsch_wer
  before insert or update on public.bestellwuensche
  for each row execute procedure public.bestellwunsch_wer();

create or replace function public.bestellwunsch_plus_wer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := left(public.zugang_anzeigename(new.profile_id), 120);
  return new;
end;
$$;
drop trigger if exists trg_bestellwunsch_plus_wer on public.bestellwunsch_plus;
create trigger trg_bestellwunsch_plus_wer
  before insert on public.bestellwunsch_plus
  for each row execute procedure public.bestellwunsch_plus_wer();

-- Nachtragen. Der Prüftrigger lässt den Eigentümer durch (current_user-Weiche), der Wer-Trigger füllt
-- nur, was leer ist.
update public.bestellwuensche w set erstellt_name = public.zugang_anzeigename(w.erstellt_von)
 where w.erstellt_name is null and w.erstellt_von is not null;
update public.bestellwunsch_plus p set name = left(public.zugang_anzeigename(p.profile_id), 120)
 where p.name is null;

-- ---------------------------------------------------------------------
-- 2. Fotodateien vormerken (wie Chat, Migration 84)
-- ---------------------------------------------------------------------
create table if not exists private.bestell_fotos_weg (
  pfad text primary key,
  seit timestamptz not null default now()
);
revoke all on table private.bestell_fotos_weg from public, anon, authenticated;

create or replace function public.bestellwunsch_nachlauf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.foto_pfad is not null then
      insert into private.bestell_fotos_weg (pfad) values (old.foto_pfad) on conflict (pfad) do nothing;
    end if;
    -- Eine Chat-Karte zu diesem Wunsch öffnet danach nichts mehr.
    update public.chat_nachrichten n
       set bezug_titel = 'Bestellung gelöscht', bezug_unter = null
     where n.bezug_art = 'bestellung' and n.bezug_id = old.id;
    return old;
  end if;
  if old.foto_pfad is not null and new.foto_pfad is distinct from old.foto_pfad then
    insert into private.bestell_fotos_weg (pfad) values (old.foto_pfad) on conflict (pfad) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bestellwunsch_nachlauf on public.bestellwuensche;
create trigger trg_bestellwunsch_nachlauf
  after update or delete on public.bestellwuensche
  for each row execute procedure public.bestellwunsch_nachlauf();

-- „Alle Daten löschen“ leert mit TRUNCATE – das löst Zeilen-Trigger nicht aus.
create or replace function public.bestell_fotos_vor_leeren()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.bestell_fotos_weg (pfad)
  select w.foto_pfad from public.bestellwuensche w where w.foto_pfad is not null
  on conflict (pfad) do nothing;
  return null;
end;
$$;
drop trigger if exists trg_bestell_fotos_vor_leeren on public.bestellwuensche;
create trigger trg_bestell_fotos_vor_leeren
  before truncate on public.bestellwuensche
  for each statement execute procedure public.bestell_fotos_vor_leeren();

create or replace function public.bestell_fotos_weg_liste(p_anzahl integer default 100)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select w.pfad from private.bestell_fotos_weg w order by w.seit, w.pfad
   limit greatest(1, least(coalesce(p_anzahl, 100), 1000));
$$;
create or replace function public.bestell_fotos_weg_erledigt(p_pfade text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  anzahl integer;
begin
  delete from private.bestell_fotos_weg w where w.pfad = any (coalesce(p_pfade, '{}'::text[]));
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;
revoke all on function public.bestell_fotos_weg_liste(integer) from public, anon, authenticated;
revoke all on function public.bestell_fotos_weg_erledigt(text[]) from public, anon, authenticated;
grant execute on function public.bestell_fotos_weg_liste(integer) to service_role;
grant execute on function public.bestell_fotos_weg_erledigt(text[]) to service_role;

-- ---------------------------------------------------------------------
-- 3. Aufbewahrung: erledigte Wünsche nach 12 Monaten
-- ---------------------------------------------------------------------
create or replace function public.bestell_aufraeumen(frist interval default interval '12 months')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  anzahl integer;
begin
  delete from public.bestellwuensche w
   where w.status in ('da', 'nicht_noetig')
     and coalesce(w.status_am, w.geaendert_am, w.created_at) < now() - frist;
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;
revoke all on function public.bestell_aufraeumen(interval) from public, anon, authenticated;

select cron.unschedule('pinpoints-bestell-aufraeumen')
 where exists (select 1 from cron.job where jobname = 'pinpoints-bestell-aufraeumen');
select cron.schedule('pinpoints-bestell-aufraeumen', '45 3 * * *', $auftrag$ select public.bestell_aufraeumen(); $auftrag$);

-- ---------------------------------------------------------------------
-- 4. Kunde endgültig löschen / zusammenführen
-- ---------------------------------------------------------------------
-- Die bisherigen Funktionen (56/60 bzw. 64/78) bleiben unverändert unter neuem Namen; die neuen rufen
-- sie und erledigen danach die Bestellliste. Vorbild: `kunde_auskunft_grund` (Migration 65).
do $$
begin
  if to_regprocedure('public.kunde_endgueltig_loeschen_grund(uuid)') is null then
    alter function public.kunde_endgueltig_loeschen(uuid) rename to kunde_endgueltig_loeschen_grund;
  end if;
  if to_regprocedure('public.kunden_zusammenfuehren_grund(uuid,uuid)') is null then
    alter function public.kunden_zusammenfuehren(uuid, uuid) rename to kunden_zusammenfuehren_grund;
  end if;
end $$;
revoke all on function public.kunde_endgueltig_loeschen_grund(uuid) from public, anon, authenticated;
revoke all on function public.kunden_zusammenfuehren_grund(uuid, uuid) from public, anon, authenticated;

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
comment on function public.kunde_endgueltig_loeschen(uuid) is
  'Migration 56/60/105: Kunde aus dem Papierkorb endgültig löschen, samt Bestellwünschen zu ihm. Nur Superadmin.';
revoke all on function public.kunde_endgueltig_loeschen(uuid) from public, anon;
grant execute on function public.kunde_endgueltig_loeschen(uuid) to authenticated;

create or replace function public.kunden_zusammenfuehren(p_behalten uuid, p_weg uuid)
returns table (kundennummer_weg integer, auftraege integer, fahrzeuge integer, fahrzeuge_vereint integer, reifensaetze integer, kontakte integer, rechnungen integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from public.kunden_zusammenfuehren_grund(p_behalten, p_weg);
  -- Sonst gingen sie beim endgültigen Löschen des zweiten Kunden mit.
  update public.bestellwuensche w set kunde_id = p_behalten where w.kunde_id = p_weg;
end;
$$;
comment on function public.kunden_zusammenfuehren(uuid, uuid) is
  'Migration 64/78/105: zwei Kunden zusammenführen; Bestellwünsche wandern mit.';
revoke all on function public.kunden_zusammenfuehren(uuid, uuid) from public, anon;
grant execute on function public.kunden_zusammenfuehren(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Auskunftsauszug (Art. 15): die Bestellwünsche zum Kunden
-- ---------------------------------------------------------------------
-- Stand von Migration 71 plus `bestellungen`. Ohne den Namen des Mitarbeiters – der Auszug gilt dem Kunden.
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
             or w.auftrag_id in (select o.id from public.orders o where o.customer_id = p_kunde)), '[]'::jsonb));
end;
$$;
comment on function public.kunde_auskunft(uuid) is
  'Migration 64/65/71/105: Auskunftsauszug je Kunde (Art. 15 DSGVO), mit Belegen, Rad-Notizen und Bestellwünschen. Admin und Superadmin.';
revoke all on function public.kunde_auskunft(uuid) from public, anon;
grant execute on function public.kunde_auskunft(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Chat-Karten „Bestellung“ und „Packliste“
-- ---------------------------------------------------------------------
alter table public.chat_nachrichten drop constraint if exists chat_bezug_bekannt;
alter table public.chat_nachrichten add constraint chat_bezug_bekannt
  check (bezug_art is null or bezug_art in ('auftrag', 'kunde', 'platz', 'verkaufsreifen', 'bestellung', 'packliste'));
-- Die Packliste-Karte trägt den Tag in der Kennung (lib/chat.ts, `packlisteKennung`).
alter table public.chat_nachrichten drop constraint if exists chat_bezug_packliste;
alter table public.chat_nachrichten add constraint chat_bezug_packliste
  check (bezug_art is distinct from 'packliste' or bezug_id::text ~ '^00000000-0000-4000-8000-0000[0-9]{8}$');

-- ---------------------------------------------------------------------
-- 7. Ergebnis
-- ---------------------------------------------------------------------
select 'Name des Eintragenden (Spalte + Trigger)' as pruefung,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bestellwuensche' and column_name = 'erstellt_name')
             and exists (select 1 from pg_trigger where tgname = 'trg_bestellwunsch_wer') then 'ja' else 'nein' end as ergebnis
union all
select 'Einträge ohne Namen', (select count(*)::text from public.bestellwuensche where erstellt_name is null and erstellt_von is not null)
union all
select 'Fotos vormerken (private.bestell_fotos_weg)', case when to_regclass('private.bestell_fotos_weg') is not null then 'ja' else 'nein' end
union all
select 'Aufräumen nächtlich (12 Monate nach Erledigen)',
       case when exists (select 1 from cron.job where jobname = 'pinpoints-bestell-aufraeumen') then 'eingeplant' else 'fehlt' end
union all
select 'Endgültig löschen / Zusammenführen mit Bestellliste',
       case when to_regprocedure('public.kunde_endgueltig_loeschen_grund(uuid)') is not null
             and to_regprocedure('public.kunden_zusammenfuehren_grund(uuid,uuid)') is not null then 'ja' else 'nein' end
union all
select 'Chat-Karten Bestellung/Packliste erlaubt',
       case when exists (select 1 from pg_constraint where conname = 'chat_bezug_packliste') then 'ja' else 'nein' end;
