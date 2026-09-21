-- Migration 41: Der Techniker darf seinen Auftrag bearbeiten
--
-- Bisher galt: Ein Techniker darf an einem ihm zugeordneten Auftrag ausschließlich `status`
-- und `techniker_notiz` ändern, und an den Leistungen gar nichts. Das war im Frühjahr die
-- richtige Vorsicht – es war der erste Schritt mit echten Fremdzugängen.
--
-- Im Betrieb ist es zu eng: Wenn sich der Termin vor Ort verschiebt, wenn ein anderes Auto
-- dasteht, wenn eine Leistung dazukommt, weiß das der Mann vor Ort und niemand sonst. Er
-- muss dann anrufen, damit jemand im Büro einträgt, was er gerade sieht. Das ist keine
-- Sicherheit, das ist eine Warteschlange.
--
-- ENTSCHEIDUNG VOM 16.09.2026 (Vitali): Der Techniker darf alles ändern – auch Preise und die
-- Rechnungsschalter. Die Begründung ist nicht „das ist ungefährlich", sondern: Seit Migration
-- 18/36 steht jede Änderung mit Person und Zeitpunkt im Protokoll, und am Auftrag ist sie
-- sichtbar. Nachvollziehbarkeit statt Verbot.
--
-- Zwei Dinge bleiben gesperrt, und zwar mit Absicht: STORNIEREN und LÖSCHEN. Beides nimmt
-- etwas weg statt etwas hinzuzufügen – ein stornierter Auftrag verschwindet aus jeder
-- Auswertung, und ein Protokolleintrag hilft nur dem, der bereits weiß, dass er suchen muss.
-- Wiedereröffnen bleibt ebenfalls Admin (Migration 20, unverändert).
--
-- ============================================================================
-- ACHTUNG, HIER DREHT SICH EINE REGEL UM
-- ============================================================================
-- Phase 6 hat den Spaltenschutz bewusst von einer Negativ- auf eine POSITIVliste umgestellt:
-- „alles gesperrt außer diesen" – damit eine künftige Spalte automatisch geschützt ist und
-- nicht vergessen werden kann.
--
-- Diese Migration dreht das um, weil sich die Absicht umgedreht hat. „Der Techniker darf
-- alles außer wegnehmen" lässt sich nur als Negativliste ausdrücken; eine Positivliste müsste
-- man bei jeder neuen Spalte nachziehen, und vergäße man es, wäre das Ergebnis genau das
-- Gegenteil der Absicht.
--
-- DER PREIS DAFÜR: Eine künftige Spalte an `orders` ist für Techniker automatisch änderbar.
-- Wer eine anlegt, muss sich fragen, ob sie in diese Liste gehört. Das steht auch in
-- supabase/migrations/README.md.
-- ============================================================================
--
-- Fügt keine Spalte hinzu und löscht nichts – nur Funktion und Richtlinien.
-- Rücknahme: rollback/41_rollback.sql (stellt die Positivliste von Migration 20 wieder her).

begin;

-- ---------------------------------------------------------------------
-- PROJEKTWACHE. Zuerst, vor allem anderen.
--
-- In derselben Supabase-Organisation liegen mehrere Projekte (PinPoints,
-- Gartenverein_Knauersberg …), und der SQL-Editor merkt sich, welches zuletzt offen war.
-- Dreimal ist eine Migration dadurch im falschen Projekt gelandet. Die Fehlermeldung war
-- jedes Mal `relation "public.orders" does not exist` – technisch richtig und als Hinweis
-- unbrauchbar, weil sie nach einem Fehler in der Migration aussieht statt nach der
-- falschen Datenbank.
--
-- Diese Prüfung sagt es im Klartext. Sie kostet nichts und läuft vor jeder Änderung.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Der Spaltenschutz am Auftrag
-- ---------------------------------------------------------------------
create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Was ein Techniker NICHT anfassen darf. Kurz und stabil gehalten: Es sind genau die
  -- Felder, mit denen man einen Auftrag wegnimmt oder ihm eine andere Identität gibt.
  gesperrt constant text[] := array[
    -- Identität: ein Auftrag, dessen Kunde oder Nummer sich ändert, ist ein anderer Auftrag.
    'id', 'order_number', 'customer_id', 'created_at', 'created_by',
    -- Wegnehmen: Stornieren und Löschen.
    'cancelled_at', 'cancelled_by', 'cancel_reason', 'deleted_at',
    -- Wiedereröffnen ist Admin-Sache (Migration 20); ohne diesen Grund geht es ohnehin nicht.
    'reopen_reason'
  ];
begin
  if coalesce(public.current_user_role(), '') = 'techniker' then
    -- Verglichen wird nur die gesperrte Teilmenge: Ändert sich dort etwas, ist es abgelehnt.
    -- Alles übrige darf sich ändern, ohne dass es hier aufgezählt werden muss.
    if exists (
      select 1 from unnest(gesperrt) as k
       where to_jsonb(old) -> k is distinct from to_jsonb(new) -> k
    ) then
      raise exception 'Techniker dürfen einen Auftrag bearbeiten, aber nicht stornieren, löschen, wiedereröffnen oder einem anderen Kunden zuordnen.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Die Leistungen am eigenen Auftrag
--
-- Bisher durfte der Techniker sie nur LESEN (Migration 15). Jetzt darf er sie auch anlegen,
-- ändern und entfernen – aber nur an einem Auftrag, der ihm über `order_employees`
-- zugeordnet ist. `public.is_own_order()` (Migration 15) ist genau diese Prüfung.
--
-- Der Einfrier-Trigger aus Migration 20 gilt unverändert weiter: An einem erledigten oder
-- stornierten Auftrag ändert auch der Techniker nichts mehr. Das ist keine Einschränkung
-- seiner Rechte, sondern die Zusage, dass ein Abschluss ein Abschluss ist.
-- ---------------------------------------------------------------------
drop policy if exists "Techniker verwaltet Artikel eigener Auftraege" on public.order_articles;
create policy "Techniker verwaltet Artikel eigener Auftraege" on public.order_articles
  for all to authenticated
  using (
    (select public.current_user_role()) = 'techniker'
    and public.is_own_order(order_id)
  )
  with check (
    (select public.current_user_role()) = 'techniker'
    and public.is_own_order(order_id)
  );

commit;

-- Kontrolle: mit einem Techniker-Testzugang an einem EIGENEN Auftrag
--   (a) die Uhrzeit ändern           -> muss gehen
--   (b) eine Leistung hinzufügen     -> muss gehen
--   (c) auf 'storniert' setzen       -> muss abgelehnt werden
--   (d) `customer_id` ändern         -> muss abgelehnt werden
-- und an einem FREMDEN Auftrag: gar nichts, er sieht ihn nicht einmal (Migration 13).
