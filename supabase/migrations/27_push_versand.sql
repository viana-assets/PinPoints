-- =====================================================================
-- Viana PinPoints – 27: Versandprotokoll der Terminerinnerungen
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 26 (push_geraete),
-- 03 (orders) und 01 (profiles).
--
-- Konzept und Begründung: docs/benachrichtigungen-plan.md, Teil 3.
--
-- Diese Tabelle beantwortet genau eine Frage: Hat dieser Techniker für diesen Auftrag schon
-- eine Erinnerung bekommen? Ohne sie schickt ein Zeitgeber, der im Minutentakt läuft, jede
-- Minute des Erinnerungsfensters dieselbe Meldung erneut. Der eindeutige Schlüssel aus
-- (Auftrag, Person) ist dabei nicht nur eine Bremse, sondern das eigentliche Werkzeug: der
-- Versand trägt zuerst ein und verschickt danach nur, was dabei WIRKLICH neu entstanden ist.
-- Zwei gleichzeitig laufende Versandvorgänge können sich so nicht in die Quere kommen.
-- =====================================================================

create table if not exists public.push_versand (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id)   on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  gesendet_am timestamptz not null default now(),
  constraint push_versand_einmalig unique (order_id, profile_id)
);

create index if not exists push_versand_zeit_idx on public.push_versand (gesendet_am);

-- Row-Level-Security an, aber bewusst OHNE Regeln: Diese Tabelle geht ausschließlich den
-- Versand etwas an, der serverseitig mit dem Service-Role-Schlüssel läuft und die
-- Row-Level-Security ohnehin umgeht. Für jeden Weg über die Anwendung ist sie damit
-- vollständig dicht – kein Lesen, kein Schreiben.
alter table public.push_versand enable row level security;

comment on table public.push_versand is
  'Welche Terminerinnerung wurde an wen schon verschickt (Doppelmeldungssperre). Siehe docs/benachrichtigungen-plan.md.';
