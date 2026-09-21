-- Rücknahme von Migration 45: zurück auf den Stand von Migration 42.
--
-- ACHTUNG: Danach sieht ein Techniker den Kunden seines eigenen Auftrags nicht mehr – der
-- Name und die Anschrift im Auftragsfenster bleiben leer, der Navigationsknopf führt
-- nirgendwohin, und die Rechnungs-Abhakliste meldet ihm fehlende Angaben, die in Wahrheit
-- gepflegt sind. Das ist der Zustand, den 45 behebt; diese Rücknahme stellt ihn wieder her.

begin;

drop policy if exists "Bereich kunden lesen" on public.customers;
create policy "Bereich kunden lesen" on public.customers
  for select to authenticated using (public.darf('kunden','lesen'));

drop policy if exists "Bereich kunden lesen" on public.vehicles;
create policy "Bereich kunden lesen" on public.vehicles
  for select to authenticated using (public.darf('kunden','lesen'));

drop function if exists public.ist_eigener_kunde(uuid);

commit;
