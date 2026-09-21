-- Migration 45: Der Techniker sieht die Kunden und Fahrzeuge SEINER Aufträge wieder
--
-- ============================================================================
-- WAS KAPUTT WAR, UND SEIT WANN
-- ============================================================================
-- Migration 42 hat das Lesen von `customers`, `contact_history` und `vehicles` an
-- `darf('kunden','lesen')` gehängt – und dort steht der Techniker nicht drin, mit Absicht:
-- Er soll den Kundenstamm nicht durchblättern.
--
-- Damit sieht er aber auch den Kunden seines EIGENEN Auftrags nicht mehr. Kaputt sind
-- dadurch: der Kundenname und die Anschrift im Auftragsfenster, der Navigationsknopf zum
-- Einsatzort, die Kundensuche im Lager – und seit Migration 44 meldet die Rechnungs-
-- Abhakliste ihm „Name fehlt, Anschrift fehlt", obwohl beides gepflegt ist.
--
-- Das Ärgerliche: Genau davor warnt der Abweichungs-Vermerk zu Phase 7 in `docs/roadmap.md`
-- seit August wörtlich – „ein Techniker braucht die Kundenadresse seines eigenen Auftrags für
-- die Navigation […] Würde man das per RLS abschneiden, wären genau diese Funktionen kaputt."
-- Ich habe es trotzdem abgeschnitten.
--
-- ============================================================================
-- DIE KORREKTUR – UND WARUM NICHT EINFACH „ALLES WIEDER FREIGEBEN"
-- ============================================================================
-- Vor Migration 42 war `customers` für jeden Eingeloggten lesbar. Das zurückzudrehen wäre
-- der bequeme Weg und der falsche: Dann sähe ein Techniker über die API wieder alle 424
-- Kunden, und der Haken „Kunden lesen" in der Rechtematrix wäre eine Anzeige ohne Wirkung –
-- genau das, was die Matrix abschaffen sollte.
--
-- Stattdessen dieselbe Form wie bei den Aufträgen und den Mitarbeitern: Modulrecht ODER
-- eigener Bezug. Der Techniker sieht die Kunden, zu denen er einen Auftrag hat – und sonst
-- keinen.
--
-- Es bleibt eine bewusste Öffnung, und sie ist zu benennen: Wer die API direkt anspricht,
-- kann darüber die Stammdaten der Kunden lesen, bei denen er war. Das ist genau die Auskunft,
-- die er für die Fahrt dorthin ohnehin am Bildschirm hat.

begin;

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. „Habe ich mit diesem Kunden zu tun?"
--
-- `security definer`, damit die Abfrage auf `orders` nicht wieder durch die Zeilenrechte
-- läuft – sonst ruft eine Richtlinie auf `customers` eine Funktion auf, die `orders` liest,
-- deren Richtlinie wiederum `is_own_order` fragt. Postgres bricht solche Ketten mit
-- „stack depth limit exceeded" ab, und die Meldung nennt die Ursache nicht.
-- ---------------------------------------------------------------------
create or replace function public.ist_eigener_kunde(p_customer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.orders o
      join public.order_employees oe on oe.order_id = o.id
     where o.customer_id = p_customer_id
       and oe.employee_id = public.current_employee_id()
  );
$$;

comment on function public.ist_eigener_kunde(uuid) is
  'Hat der Aufrufer mindestens einen Auftrag bei diesem Kunden? Grundlage dafür, dass ein Techniker Name und Anschrift seines Einsatzorts sieht.';

-- ---------------------------------------------------------------------
-- 2. Kunden und Kontakthistorie
-- ---------------------------------------------------------------------
drop policy if exists "Bereich kunden lesen" on public.customers;
create policy "Bereich kunden lesen" on public.customers
  for select to authenticated
  using (
    public.darf('kunden','lesen')
    or (coalesce(public.current_user_role(), '') = 'techniker' and public.ist_eigener_kunde(id))
  );

-- Die Kontakthistorie gehört NICHT dazu: Wann wer mit dem Kunden telefoniert hat und was
-- dabei herauskam, ist Büroarbeit. Der Techniker braucht die Anschrift, nicht den Vorgang.
drop policy if exists "Bereich kunden lesen" on public.contact_history;
create policy "Bereich kunden lesen" on public.contact_history
  for select to authenticated
  using (public.darf('kunden','lesen'));

-- ---------------------------------------------------------------------
-- 3. Fahrzeuge
--
-- Zwei Wege, und beide werden gebraucht: über den Kunden (damit im Auftragsfenster die
-- Fahrzeugauswahl gefüllt ist) und über die Zuordnung am Auftrag selbst (Migration 44) –
-- letzteres, falls ein Auto später beim Kunden umgehängt wird.
-- ---------------------------------------------------------------------
drop policy if exists "Bereich kunden lesen" on public.vehicles;
create policy "Bereich kunden lesen" on public.vehicles
  for select to authenticated
  using (
    public.darf('kunden','lesen')
    or (
      coalesce(public.current_user_role(), '') = 'techniker'
      and (
        public.ist_eigener_kunde(customer_id)
        or exists (
          select 1 from public.auftrag_fahrzeuge af
           where af.vehicle_id = vehicles.id and public.is_own_order(af.order_id)
        )
      )
    )
  );

-- Das SCHREIBEN bleibt unverändert bei `darf('kunden','schreiben')`. Ein Techniker, der die
-- Anschrift seines Kunden ändern kann, ändert damit dessen Kartei – das ist Büroarbeit.
--
-- FOLGE FÜR DIE RECHNUNGS-ABHAKLISTE (Migration 44): Das Feld „E-Mail-Adresse nachtragen"
-- wird die Datenbank einem Techniker verweigern. Die Oberfläche blendet es deshalb für ihn
-- aus und zeigt stattdessen den Hinweis, dass das Büro sie ergänzt. Lieber ein ehrlicher
-- Hinweis als ein Feld, das beim Speichern eine Fehlermeldung wirft.

commit;

-- Kontrolle mit einem Techniker-Testzugang:
--   select count(*) from public.customers;   -- nur die Kunden seiner Aufträge, nicht alle
--   select count(*) from public.vehicles;    -- deren Fahrzeuge
--   select count(*) from public.contact_history;  -- 0
