-- Migration 43: Spuren des ersten Entwurfs von Migration 42 entfernen
--
-- WER DAS BRAUCHT: Nur wer eine frühe Fassung von Migration 42 ausgeführt hat – die, in der
-- die Bereiche noch an Tabellen geschnitten waren („lager", „einlagerung") statt an
-- Handlungen („lager.regale", „lager.einlagerung", „lager.raeder").
--
-- WER SIE NICHT BRAUCHT, kann sie trotzdem laufen lassen: Sie entfernt ausschließlich Dinge,
-- die es in der überarbeiteten Fassung nicht mehr gibt, und findet sonst schlicht nichts.
--
-- ============================================================================
-- WARUM DAS NICHT WARTEN KANN
-- ============================================================================
-- Die überarbeitete Fassung benannte die Lager-Richtlinien von „Bereich lager …" in
-- „Bereich lager.regale …" um – und räumte damit die alten NICHT weg, weil auch die
-- `drop`-Anweisungen den neuen Namen trugen. Auf `warehouses` und `storage_slots` liegen
-- danach ZWEI Sätze Richtlinien.
--
-- In Postgres sind mehrere Richtlinien für dieselbe Aktion ODER-verknüpft. Es genügt also
-- eine von beiden. Die alte fragt `darf('lager','schreiben')` – und die Zeile `lager` ist
-- inzwischen die MODULzeile, deren `edit_roles` niemand mehr pflegt. Dort steht noch, was die
-- erste Fassung hineingeschrieben hat.
--
-- Die Folge: Wer in der neuen Matrix bei „Regale und Plätze verwalten" das Schreiben abhakt,
-- nimmt es damit NICHT weg – die Geisterrichtlinie erlaubt es weiter. Eine Rechtematrix, die
-- ein Wegnehmen anzeigt, aber nicht vollzieht, ist schlimmer als gar keine.
--
-- Dazu zwei harmlosere Altlasten:
--   * die verwaisten Zeilen `einlagerung` und die Schreib-/Löschlisten an `lager`
--   * ein Löschtrigger auf `tire_storage`, der einen Bereich abfragt, den es nicht mehr gibt
--     (die Anwendung löscht dort ohnehin nie – Auslagern ist ein `update`)
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- 1. Die Geisterrichtlinien. Nur die mit dem ALTEN Namen; die neuen heißen „lager.regale".
do $$
declare t text;
begin
  foreach t in array array['warehouses', 'storage_slots'] loop
    execute format('drop policy if exists "Bereich lager lesen" on public.%I', t);
    execute format('drop policy if exists "Bereich lager schreiben" on public.%I', t);
    execute format('drop policy if exists "Bereich lager aendern" on public.%I', t);
    execute format('drop policy if exists "Bereich lager loeschen" on public.%I', t);
  end loop;
end $$;

-- Und dieselbe Sorte auf den Reifentabellen, falls die erste Fassung sie dort hinterlassen hat.
do $$
declare t text;
begin
  foreach t in array array['tire_storage', 'eingelagerte_raeder'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "Bereich einlagerung loeschen" on public.%I', t);
  end loop;
end $$;

-- 2. Der Löschtrigger auf `tire_storage`. Eine Einlagerung wird nie gelöscht – Auslagern
--    setzt `removed_at` und ist ein Schreiben. Der Trigger bewachte eine Handlung, die es
--    nicht gibt, und fragte dabei einen Bereich ab, den es nicht mehr gibt.
drop trigger if exists trg_loeschrecht on public.tire_storage;
drop trigger if exists trg_loeschrecht_soft on public.tire_storage;

-- 3. Die verwaisten Zeilen.
--
--    `lager` bleibt als MODULzeile bestehen (sie entscheidet, ob der Reiter erscheint) – aber
--    ihre Schreib- und Löschlisten werden geleert, weil sie niemand mehr liest und sie sonst
--    beim nächsten Blick in die Tabelle wie eine gültige Einstellung aussehen.
update public.module_permissions
   set edit_roles = '{}', delete_roles = '{}'
 where module_key in ('lager', 'auftraege', 'dashboard', 'termine', 'einsatzplanung', 'saison', 'auswertung')
   and (edit_roles <> '{}' or delete_roles <> '{}');

--    `einlagerung` gibt es als Bereich nicht mehr; sie heißt jetzt `lager.einlagerung`.
--    Vorher die Einstellung übernehmen, falls jemand sie inzwischen angepasst hat – eine
--    Bereinigung darf keine Entscheidung wegwerfen, die jemand getroffen hat.
update public.module_permissions ziel
   set read_roles = quelle.read_roles,
       edit_roles = quelle.edit_roles
  from public.module_permissions quelle
 where ziel.module_key = 'lager.einlagerung'
   and quelle.module_key = 'einlagerung'
   and (ziel.read_roles is distinct from quelle.read_roles
        or ziel.edit_roles is distinct from quelle.edit_roles);

delete from public.module_permissions where module_key = 'einlagerung';

commit;

-- ---------------------------------------------------------------------
-- KONTROLLE nach dem Lauf – beide Abfragen müssen LEER sein:
--
-- select tablename, policyname from pg_policies
--  where schemaname = 'public' and policyname like 'Bereich lager %'
--    and policyname not like '%lager.regale%';
--
-- select module_key from public.module_permissions where module_key = 'einlagerung';
-- ---------------------------------------------------------------------
