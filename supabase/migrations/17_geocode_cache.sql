-- =====================================================================
-- Viana PinPoints – 17: Cache für die Geokodierung
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 05 (current_user_role).
--
-- Gehört zur serverseitigen Geokodierung (Roadmap Phase 8, Review-Befund A9):
-- app/api/geocode/route.ts fragt Nominatim/OpenStreetMap nur noch dann an, wenn
-- dieselbe Adresse nicht schon einmal aufgelöst wurde. Das reduziert die Zahl der
-- Anfragen an den Drittdienst drastisch (viele Kunden wohnen in derselben Straße)
-- und ist Voraussetzung dafür, dass ein späterer Import von Bestandskunden die
-- Nutzungsbedingungen von Nominatim nicht verletzt.
--
-- Auch ein Nicht-Treffer wird gespeichert (`gefunden = false`), damit eine
-- unauffindbare Adresse nicht bei jedem Speichern erneut nach draußen geht.
--
-- Rücknahme: supabase/migrations/rollback/17_rollback.sql
-- =====================================================================

create table if not exists public.geocode_cache (
  query text primary key,
  lat double precision,
  lng double precision,
  gefunden boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.geocode_cache enable row level security;

-- Nur eingeloggte Nutzer, und nur über die Serverroute relevant. Der Inhalt ist
-- die normalisierte Suchzeichenkette samt Koordinate – kein Personenbezug über
-- die Adresse hinaus, die ohnehin in `customers` steht.
create policy "Geocode-Cache lesen" on public.geocode_cache
  for select to authenticated using (true);
create policy "Geocode-Cache schreiben" on public.geocode_cache
  for insert to authenticated with check (true);
create policy "Geocode-Cache aktualisieren" on public.geocode_cache
  for update to authenticated using (true) with check (true);
