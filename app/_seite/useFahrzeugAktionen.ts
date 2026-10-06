"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { addAuftragFahrzeug, removeAuftragFahrzeug, setKilometerstand } from "@/lib/api/auftragFahrzeuge";
import { updateTireStorageDetails } from "@/lib/api/lager";
import { deleteVehicleById, fetchVehiclesFuerKunde, insertVehicle, updateVehicleById } from "@/lib/api/vehicles";
import { fahrzeugMitKennzeichen, kennzeichenGross } from "@/lib/kennzeichen";
import { type Absicht, type AbsichtInhalt, auftragFahrzeugeAnwenden, fahrzeugeAnwenden, wartetAufAnlage } from "@/lib/offline/ausgang";
import { useAuftragFahrzeuge, useEinsatzVorrat } from "@/lib/queries/hooks";
import { qk } from "@/lib/queries/keys";
import { type AuftragFahrzeug, type Order, type Vehicle } from "@/lib/types";
import { useMemo } from "react";
import type { Nachladen, NeuLaden, OfflineOderDirekt } from "./typen";

// Fahrzeuge der Kunden und am Auftrag (v113, Fahrplan C5 – aus app/page.tsx herausgelöst).
//
// Enthält die Kartei-Handlungen (anlegen, ändern, löschen) und die Fahrzeuge am geöffneten
// Auftrag samt Kilometerstand. Was am Auftrag geschrieben wird, läuft über `offlineOderDirekt`
// (CLAUDE.md: neue Schreibwege am Auftrag) – ohne Netz landet es im Ausgangskorb (Offline Runde 2).

const KEINE_AUFTRAG_FAHRZEUGE: AuftragFahrzeug[] = [];
const KEINE_FAHRZEUGE: Vehicle[] = [];

export type FahrzeugKontext = {
  supabase: SupabaseClient;
  queryClient: QueryClient;
  orders: Order[];
  // Der gerade geöffnete Auftrag – nur für ihn werden die Fahrzeuge am Auftrag gelesen.
  offenerAuftragId: string | null;
  sitzungBereit: boolean;
  istOffline: boolean;
  netzLos: () => boolean;
  ausgang: Absicht[];
  auftragTitel: (id: string, was: string) => string;
  neuLaden: NeuLaden;
  offlineOderDirekt: OfflineOderDirekt;
  refreshTireStorages: Nachladen;
};

export function useFahrzeugAktionen(k: FahrzeugKontext) {
  const { supabase, queryClient, orders, offenerAuftragId, sitzungBereit, istOffline, netzLos, ausgang, auftragTitel, neuLaden, offlineOderDirekt, refreshTireStorages } = k;
  // Fahrzeuge stehen in ZWEI Zwischenspeichern: je Kunde (Kundenfenster, Auftragsfenster) und
  // alle zusammen (Lager, Saisonliste). Bis v92 lud diese Funktion nur den des gerade
  // geöffneten KUNDEN neu – ein im Auftrag angelegtes Fahrzeug fehlte dann in der Auswahl
  // „+ weiteres Fahrzeug" desselben Auftrags, während das Lager es längst zeigte (gemeldet
  // 29.09.2026). Jetzt werden alle Kunden-Listen und die Gesamtliste verworfen; geladen wird
  // ohnehin nur, was gerade angezeigt wird.
  async function refreshVehicles() {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "kunde" && q.queryKey[2] === "fahrzeuge" }),
      neuLaden(qk.fahrzeuge()),
    ]);
  }
  // Ein Fahrzeug zu diesem Kennzeichen: das vorhandene des Kunden, sonst ein neues. Gelesen
  // wird frisch aus der Datenbank, nicht aus dem Zwischenspeicher – sonst entstünde die
  // Dublette genau in dem Fall, für den es diese Prüfung gibt (Liste noch nicht nachgeladen).
  async function fahrzeugFuerKennzeichen(kundeId: string, kennzeichen: string, modell = ""): Promise<string> {
    const vorhanden = fahrzeugMitKennzeichen(await fetchVehiclesFuerKunde(supabase, kundeId), kennzeichen);
    if (vorhanden) return vorhanden.id;
    return insertVehicle(supabase, kundeId, { licensePlate: kennzeichen, makeModel: modell, tireSize: "", note: "" });
  }

  // Fahrzeuge am Auftrag (Migration 44). Geladen wird nur für den gerade geöffneten Auftrag –
  // für die Liste braucht es sie nicht, und ein Vollabzug über alle Aufträge wäre derselbe
  // Fehler wie die dreizehn Vollabzüge beim Start, die Phase 10 abgestellt hat.
  //
  // Seit v113 (Offline Runde 2) eine Abfrage im Zwischenspeicher statt eines eigenen Zustands, und
  // mit den wartenden Absichten darübergelegt. Der Vorrat (`useEinsatzVorrat`) legt sie für die
  // kommenden Aufträge schon vorher hinein – dann sind sie auch ohne Netz da.
  const auftragFahrzeugeAbfrage = useAuftragFahrzeuge(supabase, offenerAuftragId, sitzungBereit);
  useEinsatzVorrat(supabase, orders, sitzungBereit && !istOffline);
  const auftragFahrzeuge = useMemo(
    () => auftragFahrzeugeAnwenden(auftragFahrzeugeAbfrage.data ?? KEINE_AUFTRAG_FAHRZEUGE, ausgang, offenerAuftragId),
    [auftragFahrzeugeAbfrage.data, ausgang, offenerAuftragId],
  );

  async function auftragFahrzeugeNeu(orderId: string) {
    if (!netzLos()) await neuLaden(qk.auftragFahrzeuge(orderId));
  }
  const neueId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  // Offline Runde 2: dem Auftrag ein Fahrzeug zuordnen. Ein offline angelegtes Auto gibt es am
  // Server noch nicht – dann geht auch die Zuordnung in den Ausgangskorb.
  async function fahrzeugHinzufuegen(orderId: string, vehicleId: string) {
    await offlineOderDirekt(
      () => addAuftragFahrzeug(supabase, orderId, vehicleId, null),
      () => ({ inhalt: { art: "fahrzeug_zu", auftragId: orderId, zeile: { id: neueId(), order_id: orderId, vehicle_id: vehicleId, kilometerstand: null } }, titel: auftragTitel(orderId, "Fahrzeug zugeordnet") }),
      wartetAufAnlage(ausgang, vehicleId),
    );
    await auftragFahrzeugeNeu(orderId);
  }
  // Ein Auto, das der Kunde noch nicht in der Kartei hat: erst anlegen, dann zuordnen. Es
  // bleibt beim Kunden stehen – beim nächsten Auftrag muss niemand das Kennzeichen noch
  // einmal tippen, genau wie bei der E-Mail-Adresse.
  // Seit v93: Hat der Kunde das Kennzeichen schon, wird DIESES Fahrzeug genommen statt eines
  // neuen (siehe `fahrzeugFuerKennzeichen`). Steht es schon am Auftrag, passiert nichts.
  //
  // Offline Runde 2: ohne Netz entscheidet die Kartei auf dem Gerät, ob das Kennzeichen schon da
  // ist; beim Senden wird am Server noch einmal nachgesehen (lib/offline/senden.ts).
  async function rechnungsFahrzeugAnlegen(orderId: string, kundeId: string, kennzeichen: string) {
    await offlineOderDirekt(
      async () => {
        const fahrzeugId = await fahrzeugFuerKennzeichen(kundeId, kennzeichen);
        if (!auftragFahrzeuge.some((af) => af.order_id === orderId && af.vehicle_id === fahrzeugId)) {
          await addAuftragFahrzeug(supabase, orderId, fahrzeugId, null);
        }
      },
      () => {
        const kartei = fahrzeugeAnwenden(queryClient.getQueryData<Vehicle[]>(qk.kundeFahrzeuge(kundeId)) ?? KEINE_FAHRZEUGE, ausgang, kundeId);
        const vorhanden = fahrzeugMitKennzeichen(kartei, kennzeichen);
        const fahrzeugId = vorhanden?.id ?? neueId();
        const absichten: { inhalt: AbsichtInhalt; titel: string }[] = [];
        if (!vorhanden) {
          absichten.push({
            inhalt: { art: "fahrzeug_neu", kundeId, auftragId: orderId, zeile: { id: fahrzeugId, customer_id: kundeId, license_plate: kennzeichenGross(kennzeichen.trim()), make_model: null, tire_size: null, note: null } },
            titel: auftragTitel(orderId, "neues Fahrzeug"),
          });
        }
        if (!auftragFahrzeuge.some((af) => af.order_id === orderId && af.vehicle_id === fahrzeugId)) {
          absichten.push({
            inhalt: { art: "fahrzeug_zu", auftragId: orderId, zeile: { id: neueId(), order_id: orderId, vehicle_id: fahrzeugId, kilometerstand: null } },
            titel: auftragTitel(orderId, "Fahrzeug zugeordnet"),
          });
        }
        return absichten;
      },
    );
    await auftragFahrzeugeNeu(orderId);
    if (!netzLos()) await refreshVehicles();
  }
  async function kilometerstandSetzen(id: string, km: number | null) {
    const orderId = offenerAuftragId;
    const vorher = auftragFahrzeuge.find((af) => af.id === id);
    await offlineOderDirekt(
      () => setKilometerstand(supabase, id, km),
      () => (orderId ? { inhalt: { art: "km", auftragId: orderId, zeileId: id, felder: { kilometerstand: km }, basis: { kilometerstand: vorher?.kilometerstand ?? null } }, titel: auftragTitel(orderId, "Kilometerstand") } : null),
      wartetAufAnlage(ausgang, id),
    );
    if (orderId) await auftragFahrzeugeNeu(orderId);
  }
  async function fahrzeugEntfernen(id: string) {
    const orderId = offenerAuftragId;
    await offlineOderDirekt(
      () => removeAuftragFahrzeug(supabase, id),
      () => (orderId ? { inhalt: { art: "fahrzeug_weg", auftragId: orderId, zeileId: id }, titel: auftragTitel(orderId, "Fahrzeug entfernt") } : null),
      wartetAufAnlage(ausgang, id),
    );
    if (orderId) await auftragFahrzeugeNeu(orderId);
  }

  async function addVehicle(customerId: string, fields: {
    licensePlate: string; makeModel: string; tireSize: string; note: string;
  }) {
    // Im Kundenfenster wird bewusst angelegt – eine Dublette ist dort ein Versehen. Die Meldung
    // nennt das Kennzeichen nicht (keine Kundendaten in Fehlermeldungen, CLAUDE.md 5).
    if (fahrzeugMitKennzeichen(await fetchVehiclesFuerKunde(supabase, customerId), fields.licensePlate)) {
      throw new Error("Dieses Kennzeichen ist bei diesem Kunden schon angelegt.");
    }
    await insertVehicle(supabase, customerId, fields);
    await refreshVehicles();
  }

  // Fahrzeug aus dem Auftragsfenster heraus: anlegen UND dem eingelagerten Satz zuordnen.
  // Beides in einem Schritt, weil es fachlich einer ist – der Techniker steht am Auto und
  // sagt „das hier gehört zu diesem Satz".
  async function fahrzeugAusAuftragAnlegen(orderId: string, kennzeichen: string, modell: string, einlagerungId?: string) {
    const auftrag = orders.find((o) => o.id === orderId);
    if (!auftrag) return;
    const fahrzeugId = await fahrzeugFuerKennzeichen(auftrag.customer_id, kennzeichen, modell);
    await refreshVehicles();
    // Dem Satz zuordnen, aus dessen Block heraus das Fahrzeug angelegt wurde. Ohne diese Id
    // landete es bei zwei Sätzen im falschen – vorher gab es nur einen, da war die Frage
    // nicht zu stellen.
    if (einlagerungId) {
      await updateTireStorageDetails(supabase, einlagerungId, { vehicleId: fahrzeugId });
      await refreshTireStorages();
    }
  }
  async function updateVehicle(id: string, fields: {
    licensePlate: string; makeModel: string; tireSize: string; note: string;
  }) {
    await updateVehicleById(supabase, id, fields);
    await refreshVehicles();
  }
  async function deleteVehicle(id: string) {
    await deleteVehicleById(supabase, id);
    await refreshVehicles();
  }


  return {
    addVehicle, auftragFahrzeuge, deleteVehicle, fahrzeugAusAuftragAnlegen, fahrzeugEntfernen, fahrzeugHinzufuegen,
    kilometerstandSetzen, rechnungsFahrzeugAnlegen, refreshVehicles, updateVehicle,
  };
}
