-- =====================================================================
-- Viana PinPoints – 28: Zeitgeber für die Terminerinnerung (pg_cron + pg_net)
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 27 (push_versand).
--
-- Konzept und Begründung: docs/benachrichtigungen-plan.md, Abschnitt „Der Zeitgeber".
--
-- Warum hier und nicht in Vercel: Ein Vercel-Cron läuft auf dem kostenlosen Tarif nur einmal
-- täglich – für eine Erinnerung fünf Minuten vor dem Termin unbrauchbar. pg_cron läuft im
-- Minutentakt und steht als Migration bei allem anderen, was die Datenbank betrifft.
--
-- ---------------------------------------------------------------------
-- WICHTIG – zwei Handgriffe von Hand, in dieser Reihenfolge:
--
-- 1. Erweiterungen einschalten. Die beiden `create extension`-Zeilen unten erledigen das;
--    schlagen sie fehl, geht es auch über Database → Extensions (pg_cron, pg_net).
--
-- 2. Adresse und Geheimnis eintragen. Das GEHEIMNIS STEHT NICHT IN DIESER DATEI und gehört
--    auch nicht ins Repository. Es wird einmal erzeugt (z. B. `select gen_random_uuid();`)
--    und an genau zwei Stellen hinterlegt: hier unten und in Vercel als Umgebungsvariable
--    PUSH_GEHEIMNIS (danach neu deployen). Stimmen beide nicht überein, weist die
--    Versandroute den Aufruf ab – so kann niemand von außen Meldungen auslösen.
--
--    insert into private.push_konfiguration (basis_url, geheimnis)
--    values ('https://pin-points.vercel.app', '‹hier das erzeugte Geheimnis›')
--    on conflict (id) do update
--       set basis_url = excluded.basis_url, geheimnis = excluded.geheimnis;
-- ---------------------------------------------------------------------
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Eigenes Schema statt `public`: PostgREST veröffentlicht nur `public`. Was hier liegt, ist
-- über die Datenschnittstelle grundsätzlich nicht erreichbar – unabhängig von jeder Regel,
-- die jemand später einmal versehentlich zu weit fasst. Für ein Geheimnis ist das der
-- richtige Ort.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.push_konfiguration (
  -- Genau eine Zeile: der Primärschlüssel kann nur `true` sein.
  id        boolean primary key default true check (id),
  basis_url text not null,
  geheimnis text not null
);

revoke all on private.push_konfiguration from anon, authenticated;

-- Der Auftrag selbst. `cron.unschedule` zuerst, damit ein erneutes Ausführen dieser Migration
-- den Auftrag ersetzt statt einen zweiten daneben zu stellen (zwei Zeitgeber = doppelte Last,
-- die Doppelmeldungssperre aus 27 fängt die Wirkung ab, aber sauber ist es nicht).
select cron.unschedule('pinpoints-terminerinnerung')
 where exists (select 1 from cron.job where jobname = 'pinpoints-terminerinnerung');

select cron.schedule(
  'pinpoints-terminerinnerung',
  '* * * * *',
  $auftrag$
  select net.http_post(
    url     := (select basis_url from private.push_konfiguration) || '/api/push/senden',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-geheimnis', (select geheimnis from private.push_konfiguration)
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $auftrag$
);

-- Zur Kontrolle:
--   select * from cron.job;                                   -- läuft der Auftrag?
--   select * from cron.job_run_details order by start_time desc limit 20;  -- mit welchem Ergebnis?
--   select * from net._http_response order by created desc limit 20;       -- was hat die Route geantwortet?
