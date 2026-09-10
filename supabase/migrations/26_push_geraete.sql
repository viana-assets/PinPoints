-- =====================================================================
-- Viana PinPoints – 26: Push-Anmeldungen je Gerät
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 01 (profiles).
--
-- Konzept und Begründung: docs/benachrichtigungen-plan.md.
--
-- Erster Schritt der Terminerinnerung: Wer eine Benachrichtigung bekommen soll, muss sein
-- Gerät einmal anmelden. Was dabei entsteht, ist eine Adresse beim Push-Dienst des Herstellers
-- (Apple bzw. Google) plus zwei Schlüssel, mit denen der Inhalt für genau dieses Gerät
-- verschlüsselt wird.
--
-- Warum der Schlüssel der Tabelle die ADRESSE ist und nicht die Person: Ein Mensch kann
-- mehrere Geräte haben (Handy, Rechner), und auf einem Gerät kann sich jemand anderes
-- anmelden. Wäre die Person der Schlüssel, entstünden im ersten Fall zu wenige Zeilen und im
-- zweiten eine zu viel – der Vorgänger bekäme weiter Benachrichtigungen auf ein Gerät, das
-- ihm nicht mehr gehört.
-- =====================================================================

create table if not exists public.push_geraete (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  -- Adresse beim Push-Dienst. Eindeutig: ein Gerät, eine Zeile.
  endpoint     text not null unique,
  -- Die beiden Schlüssel aus der Browser-Anmeldung. Ohne sie lässt sich der Inhalt nicht für
  -- dieses Gerät verschlüsseln; sie sind für sich genommen wertlos.
  p256dh       text not null,
  auth         text not null,
  -- Grobe Bezeichnung („iPhone", „Windows-Rechner"), damit man in einer Liste erkennt, welches
  -- Gerät gemeint ist. Bewusst kein Fingerabdruck.
  geraet       text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_geraete_profile_idx on public.push_geraete (profile_id);

alter table public.push_geraete enable row level security;

-- Jeder verwaltet ausschließlich seine eigenen Geräte. Auch für Admins gibt es hier bewusst
-- keine Ausnahme: eine Push-Anmeldung ist ein Zugang zum Sperrbildschirm eines fremden
-- Telefons – wer sie lesen oder anlegen kann, kann dort Meldungen erscheinen lassen.
create policy "Eigene Push-Geräte lesen" on public.push_geraete
  for select using (auth.uid() = profile_id);
create policy "Eigene Push-Geräte anlegen" on public.push_geraete
  for insert with check (auth.uid() = profile_id);
create policy "Eigene Push-Geräte ändern" on public.push_geraete
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "Eigene Push-Geräte löschen" on public.push_geraete
  for delete using (auth.uid() = profile_id);

-- Der spätere Terminversand läuft serverseitig mit dem Service-Role-Schlüssel und umgeht die
-- Row-Level-Security ohnehin. Diese Regeln schützen also den Weg über die Anwendung – und das
-- ist der Weg, über den ein Angreifer käme.
