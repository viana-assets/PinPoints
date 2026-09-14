-- =====================================================================
-- Viana PinPoints – 35: Wie genau ist diese Kartenposition eigentlich?
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 01 (customers).
--
-- Anlass, 14.09.2026: „Allerheiligenweg 36b, 90530 Wendelstein" – OpenStreetMap kennt die
-- Straße, aber nicht die Hausnummer. Solche Adressen gibt es in kleineren Orten reihenweise.
-- Bisher hatte der Kunde dann GAR KEINE Position und fehlte auf jeder Karte.
--
-- Die naheliegende Abhilfe – einfach die Straßenmitte nehmen – war bis jetzt keine, und zwar
-- aus einem Grund, den man erst im Code sieht:
--
--     const dest = hasCoords ? `${lat},${lng}` : cust.address;
--
-- Der Navigationsknopf bevorzugt die Koordinate vor der Adresse. Eine Straßenmitte hätte also
-- die Navigation VERSCHLECHTERT: Sie führe an den Anfang der Straße, obwohl die „36b" im
-- Datensatz danebensteht und Google sie problemlos findet.
--
-- Deshalb speichert die Anwendung ab jetzt nicht nur WO, sondern auch WIE GENAU:
--
--   'exakt'     – der Kartendienst hat die vollständige Adresse samt Hausnummer gefunden.
--   'ungefaehr' – nur die Straße war auffindbar. Der Kunde erscheint auf der Karte, aber
--                 sichtbar als Näherung – und die Navigation läuft über den Adresstext,
--                 nicht über diesen Punkt.
--   'hand'      – jemand hat den Punkt selbst auf der Karte gesetzt. Das ist die genaueste
--                 Angabe, die es gibt: Sie kommt von einem Menschen, der dort war.
--
-- NULL heißt „keine Position" – dasselbe wie lat/lng = null.
--
-- Warum eine Prüfregel statt eines freien Textfelds: Die drei Werte sind eine feste Liste,
-- und feste Listen gehören in die Datenbank (siehe docs/README.md, Konstanten-Regel). Im Code
-- stehen sie als `GEO_GENAUIGKEIT_LABEL` in lib/constants.ts.
-- =====================================================================

alter table public.customers
  add column if not exists geo_genauigkeit text;

do $$
begin
  alter table public.customers
    add constraint customers_geo_genauigkeit_werte
    check (geo_genauigkeit is null or geo_genauigkeit in ('exakt', 'ungefaehr', 'hand'));
exception when duplicate_object then
  null;
end $$;

-- Bestandsdaten: Jede vorhandene Position entstand aus der VOLLSTÄNDIGEN Adresse – die alte
-- Fassung speicherte nur dann etwas, wenn der Kartendienst genau diese gefunden hat. 'exakt'
-- ist hier also keine Annahme, sondern die Beschreibung dessen, was passiert ist.
update public.customers
   set geo_genauigkeit = 'exakt'
 where lat is not null
   and lng is not null
   and geo_genauigkeit is null;

-- Umgekehrt: Ohne Position gibt es auch keine Genauigkeit.
update public.customers
   set geo_genauigkeit = null
 where (lat is null or lng is null)
   and geo_genauigkeit is not null;

-- Gegenprobe.
select
  count(*) filter (where geo_genauigkeit = 'exakt')     as exakt,
  count(*) filter (where geo_genauigkeit = 'ungefaehr') as ungefaehr,
  count(*) filter (where geo_genauigkeit = 'hand')      as von_hand,
  count(*) filter (where geo_genauigkeit is null)       as ohne_position,
  count(*)                                              as kunden_gesamt
from public.customers
where deleted_at is null;
