-- =====================================================================
-- Viana PinPoints – 12: Artikelstammdaten (Dienstleistungen/Artikel) + Zuordnung zu Aufträgen
-- Noch auszuführen. Braucht `public.orders` (03) und `public.current_user_role()` (05).
--
-- Erster Baustein Richtung ERP: ein zentrales Artikelstammdatenbuch für Dienstleistungen
-- (z. B. "Mobiler Reifenwechsel"), die einem Auftrag zugeordnet werden können. Jeder Artikel
-- hat eine Kurz- und eine Langbezeichnung sowie eine Preis-HISTORIE (nicht nur einen einzigen
-- Preis) – ein neuer Preis bekommt einen "gültig ab"-Tag, der alte wird automatisch mit
-- "gültig bis" (Vortag) geschlossen. So bleibt nachvollziehbar, welcher Preis zu welchem
-- Zeitpunkt galt, auch rückwirkend für bereits abgerechnete Aufträge.
--
-- Rabatte werden bewusst NICHT am Artikel selbst hinterlegt, sondern individuell bei der
-- Zuordnung zu einem Auftrag (order_articles.discount_percent) – z. B. für Kundenrabatt oder
-- Mengenrabatt im Einzelfall.
--
-- Nur Admin/Superadmin dürfen Artikel und Preise anlegen/ändern (Governance-Entscheidung,
-- wie bei den Modul-Berechtigungen). Die Zuordnung von Artikeln zu einem konkreten Auftrag
-- (order_articles) darf dagegen jeder eingeloggte Nutzer – wie bei der Mitarbeiter-Zuordnung
-- (order_employees, Migration 11) –, weil das im Tagesgeschäft von Technikern gemacht wird.
--
-- Buchhaltung/Rechnungsstellung ist bewusst NICHT Teil dieser Migration, kann aber später auf
-- diesen Tabellen aufsetzen (order_articles speichert Preis/MwSt./Rabatt zum Zeitpunkt der
-- Zuordnung als Schnappschuss, damit eine spätere Rechnung auch dann korrekt bleibt, wenn sich
-- der Artikelpreis danach ändert).
-- =====================================================================

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  short_name text not null,
  long_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.articles enable row level security;

create policy "Eingeloggte Nutzer lesen Artikelstammdaten" on public.articles
  for select using (auth.role() = 'authenticated');

create policy "Nur Admin/Superadmin pflegen Artikelstammdaten" on public.articles
  for all using (public.current_user_role() in ('admin', 'superadmin'))
  with check (public.current_user_role() in ('admin', 'superadmin'));

create table if not exists public.article_prices (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  net_price numeric(10,2) not null,
  vat_rate numeric(5,2) not null default 19,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now()
);

alter table public.article_prices enable row level security;

create policy "Eingeloggte Nutzer lesen Artikelpreise" on public.article_prices
  for select using (auth.role() = 'authenticated');

create policy "Nur Admin/Superadmin pflegen Artikelpreise" on public.article_prices
  for all using (public.current_user_role() in ('admin', 'superadmin'))
  with check (public.current_user_role() in ('admin', 'superadmin'));

create table if not exists public.order_articles (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete restrict,
  quantity numeric(10,2) not null default 1,
  net_price numeric(10,2) not null,
  vat_rate numeric(5,2) not null default 19,
  discount_percent numeric(5,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

alter table public.order_articles enable row level security;

create policy "Eingeloggte Nutzer verwalten Auftrags-Artikel" on public.order_articles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Start-Artikelstamm: die Dienstleistungen des mobilen Reifenwechsel-Services, ohne Preis
-- (Preise werden bewusst leer gelassen und später im Admin-Bereich unter "Artikelstamm"
-- gepflegt, sobald die tatsächlichen Preise feststehen).
insert into public.articles (short_name, long_name) values
  ('Reifenwechsel mobil', 'Mobiler Reifenwechsel direkt beim Kunden vor Ort'),
  ('Reifenwuchten', 'Auswuchten der Räder nach dem Reifenwechsel'),
  ('Reifeneinlagerung', 'Saisonale Einlagerung der Reifen bis zum nächsten Wechsel'),
  ('Reifenentsorgung', 'Fachgerechte Entsorgung der Altreifen'),
  ('Reifenwäsche', 'Waschen der Reifen vor der Einlagerung'),
  ('Reifenberatung', 'Beratung zur passenden Reifenauswahl je nach Fahrzeug, Bedarf und Budget');
