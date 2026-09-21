-- Migration 47: Ein abgeschlossener Auftrag IST ein Kontakt
--
-- ============================================================================
-- WORUM ES GEHT
-- ============================================================================
-- Die rote Nadel auf der Karte beantwortet nicht „hat jemand mit dem geredet", sondern
-- „müssen wir den anrufen". Bisher blieb ein Kunde auch dann rot, wenn der Techniker am
-- Vortag bei ihm in der Einfahrt stand und den Auftrag abgeschlossen hat: `last_contact`
-- schrieb ausschließlich der Kontaktdialog. Auf der Anrufliste zur nächsten Saison steht
-- damit ein Kunde, den man gerade erst bedient hat.
--
-- Umgekehrt gilt: Ein abgeschlossener Auftrag ist der belastbarste Kontakt, den es in dieser
-- Anwendung gibt. Es wurde nicht nur telefoniert, es wurde geleistet. Und das Datum liegt in
-- der VERGANGENHEIT – daran kann die Wiedervorlage-Uhr hängen, ohne etwas zu behaupten.
--
-- ============================================================================
-- WARUM IN DER DATENBANK UND NICHT IM PROGRAMM
-- ============================================================================
-- Weil sonst genau der, der den Auftrag abschließt, es nicht darf: Der Techniker hat seit
-- Migration 42/45 kein Schreibrecht auf `customers`. Ein `update` aus dem Browser heraus
-- würde bei ihm still scheitern (RLS filtert die Zeile weg, null Zeilen, kein Fehler) – die
-- Regel gälte also für den Admin und nicht für den, der draußen arbeitet.
--
-- Deshalb ein Trigger mit `security definer`: Er gehört zur Regel „Auftrag abgeschlossen",
-- nicht zur Frage „wer darf Kundenstammdaten pflegen".
--
-- ============================================================================
-- WAS AUSDRÜCKLICH NICHT PASSIERT
-- ============================================================================
-- Beim ANLEGEN eines Auftrags wird nichts geschrieben. Das war die naheliegende Idee und ist
-- eine Falle: Der Kunde wäre drei Monate lang grün, auch wenn der Termin danach storniert
-- wird – jemand, mit dem nie jemand gesprochen hat, verschwände für ein Quartal von der
-- Anrufliste. Dass ein Termin ansteht, leitet die Oberfläche stattdessen aus den Aufträgen ab
-- (Zustand „Termin"); das kann nicht veralten, weil nichts gespeichert wird.
--
-- Beim WIEDERERÖFFNEN wird der Kontakt ebenfalls nicht zurückgenommen. Der Besuch hat
-- stattgefunden; ihn zu widerrufen, weil hinterher eine Position korrigiert wurde, wäre eine
-- Geschichtsfälschung.

begin;

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.contact_history') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.contact_history. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Der Trigger
--
-- `after update`, nicht `before`: Erst wenn feststeht, dass der Statuswechsel durchgeht
-- (`enforce_order_status_transition` läuft `before` und kann noch abbrechen), darf am Kunden
-- etwas stehen. Ein `before`-Trigger hätte den Kontakt auch dann geschrieben, wenn der
-- Abschluss danach abgelehnt wurde.
-- ---------------------------------------------------------------------
create or replace function public.kontakt_aus_abschluss()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tag date := coalesce(new.completed_at::date, current_date);
begin
  -- Nur der Übergang NACH erledigt. Ein Auftrag, der schon erledigt war und dessen Notiz
  -- jemand ändert, löst nichts aus.
  if new.status <> 'erledigt' or old.status is not distinct from new.status then
    return null;
  end if;
  if new.customer_id is null then
    return null;
  end if;

  update public.customers c
     set status           = 'kontaktiert',
         -- Nur vorrücken, nie zurück: Hat jemand heute telefoniert und wird ein alter Auftrag
         -- von letzter Woche nachträglich abgeschlossen, bleibt das neuere Datum stehen.
         -- Sonst stellte ein Nachtrag die Wiedervorlage-Uhr heimlich zurück.
         last_contact     = greatest(coalesce(c.last_contact, tag), tag),
         kontakt_ergebnis = 'auftrag',
         -- Eine offene Wiedervorlage ist damit erledigt: Der Grund, noch einmal anzurufen,
         -- war dieser Auftrag.
         wiedervorlage_am = null
   where c.id = new.customer_id;

  -- Die Historie ist das, was der Nutzer im Kundenfenster liest. Ohne diese Zeile stünde dort
  -- ein Kontaktdatum ohne Anlass - und niemand wüsste, woher es kommt.
  insert into public.contact_history (customer_id, date, note)
  values (new.customer_id, tag, 'Auftrag ' || coalesce(new.order_number::text, '?') || ' abgeschlossen');

  return null;
end;
$$;

comment on function public.kontakt_aus_abschluss() is
  'Setzt beim Abschliessen eines Auftrags den Kontaktstand des Kunden (Migration 47). security definer, weil der Techniker selbst kein Schreibrecht auf customers hat.';

drop trigger if exists trg_kontakt_aus_abschluss on public.orders;
create trigger trg_kontakt_aus_abschluss
  after update of status on public.orders
  for each row execute procedure public.kontakt_aus_abschluss();

commit;

-- Kontrolle nach dem Lauf:
--
-- select c.name, c.status, c.last_contact, c.kontakt_ergebnis
--   from public.customers c
--   join public.orders o on o.customer_id = c.id
--  where o.status = 'erledigt'
--  order by c.last_contact desc nulls last
--  limit 10;
