-- =====================================================================
-- Viana PinPoints – 25: Zwischenspeicher für Adressvorschläge
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 01.
--
-- Konzept und Begründung: docs/kunden-und-karte.md, Abschnitt „Adressvorschläge".
--
-- Gegenstück zu `geocode_cache` (Migration 17), aber für eine andere Frage: dort steht zu
-- EINER Adresse EINE Koordinate, hier zu einer Sucheingabe eine LISTE von Kandidaten. Beides
-- in eine Tabelle zu pressen hieße, eine der beiden Formen zu verbiegen.
--
-- Warum überhaupt zwischenspeichern: die Korrekturliste unter Admin → Wartung fragt für jeden
-- Kunden ohne Kartenposition einen Vorschlag ab. Ohne Zwischenspeicher gingen bei jedem
-- Neuladen der Seite erneut über hundert Anfragen an einen fremden Dienst – für Daten, die
-- sich in Monaten nicht ändern.
-- =====================================================================

create table if not exists public.adressvorschlag_cache (
  -- Die normalisierte Sucheingabe (klein, Mehrfach-Leerzeichen zusammengezogen).
  query      text primary key,
  -- Die Kandidatenliste, so wie die Route sie ausliefert. Als jsonb und nicht als eigene
  -- Tabelle mit einer Zeile je Kandidat: die Liste wird immer als Ganzes geschrieben und
  -- als Ganzes gelesen, nie einzeln abgefragt oder verknüpft.
  treffer    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.adressvorschlag_cache enable row level security;

-- Gleiche Regeln wie beim Geocode-Cache: nur angemeldete Nutzer. Der Inhalt ist eine
-- Sucheingabe samt öffentlich bekannter Straßendaten – kein Personenbezug über das hinaus,
-- was ohnehin in `customers` steht.
create policy "Adressvorschlaege lesen" on public.adressvorschlag_cache
  for select to authenticated using (true);
create policy "Adressvorschlaege schreiben" on public.adressvorschlag_cache
  for insert to authenticated with check (true);
create policy "Adressvorschlaege aktualisieren" on public.adressvorschlag_cache
  for update to authenticated using (true) with check (true);

-- Alte Einträge lassen sich bei Bedarf von Hand wegräumen; ein automatischer Ablauf wäre
-- Aufwand für ein Problem, das bei dieser Datenmenge nicht entsteht:
--   delete from public.adressvorschlag_cache where created_at < now() - interval '1 year';
