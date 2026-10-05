"use client";

import { useState } from "react";
import type { Order, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { SAISON_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/helpers";
import { auftragsNr } from "@/lib/testkunde";
import { satzZustand } from "@/lib/lagerVormerkung";

// Wo die Reifen dieses Auftrags im Lager liegen oder lagen (Migration 67, v111).
//
// Zwei Karten im Abschnitt „Reifen" des Auftragsfensters:
//   - „Aus dem Lager": was mit diesem Auftrag herausgeht – vorgemerkt (liegt noch im Regal, geht
//     beim Abschließen raus) oder schon ausgelagert. Der Platz bleibt auch nach dem Abschluss
//     stehen. Anlass: Der Techniker öffnete zum Termin den Auftrag und fand dort keinen Platz mehr,
//     weil der Satz schon beim Anlegen „ausgelagert" worden war.
//   - „Hier eingelagert": was in diesem Auftrag ins Regal kam und inzwischen wieder draußen ist.
//     Sonst verschwände mit dem nächsten Saisonwechsel auch hier der Platz.
export function LagerSaetzeAmAuftrag({ ausLager, frueher, einlagerungen = [], storageSlots, warehouses, vehicles, auftraege, gesperrt, onZuruecknehmen }: {
  ausLager: TireStorage[];
  // Die Einlagerungen dieses Auftrags – um einen Tausch (Migration 69) am alten Satz zu nennen.
  einlagerungen?: TireStorage[];
  frueher: TireStorage[];
  storageSlots: StorageSlot[];
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  // Um die Nummer des Auftrags zu nennen, mit dem ein früher eingelagerter Satz herausging.
  auftraege: Order[];
  gesperrt: boolean;
  onZuruecknehmen: (satzId: string) => Promise<void>;
}) {
  const [laeuft, setLaeuft] = useState<string | null>(null);
  if (ausLager.length === 0 && frueher.length === 0) return null;

  function kopf(satz: TireStorage) {
    const platz = storageSlots.find((sl) => sl.id === satz.storage_slot_id);
    const lager = warehouses.find((w) => w.id === platz?.warehouse_id);
    const fz = vehicles.find((v) => v.id === satz.vehicle_id);
    return {
      code: platz?.code || "?",
      lager: lager?.name ?? null,
      titel: [satz.saison ? SAISON_LABEL[satz.saison] : "Reifensatz", fz ? [fz.license_plate, fz.make_model].filter(Boolean).join(" ") : null].filter(Boolean).join(" · "),
    };
  }

  async function zuruecknehmen(id: string) {
    setLaeuft(id);
    try { await onZuruecknehmen(id); } finally { setLaeuft(null); }
  }

  return (
    <>
      {ausLager.length > 0 && (
        <div className="db-karte ao-karte">
          <div className="db-karte-kopf"><span className="db-karte-titel">Aus dem Lager</span></div>
          {ausLager.map((satz) => {
            const k = kopf(satz);
            const vorgemerkt = satzZustand(satz) === "vorgemerkt";
            const tausch = einlagerungen.find((e) => e.kommt_rein && e.tausch_fuer === satz.id);
            return (
              <div key={satz.id} className="ao-regal">
                <span className={"ao-platz" + (vorgemerkt ? " ao-vorgemerkt" : " ao-draussen")}>{k.code}</span>
                <span className="dm-fz-text">
                  <b>{k.titel}</b>
                  <span className="small">
                    {k.lager ? `${k.lager} · ` : ""}
                    {vorgemerkt
                      ? "liegt noch im Regal · geht beim Abschließen raus"
                      : `ausgelagert am ${formatDate((satz.removed_at ?? "").slice(0, 10))}`}
                  </span>
                  {tausch && <span className="small tausch-hinweis">⇄ Tausch: {tausch.saison ? SAISON_LABEL[tausch.saison] : "der neue Satz"} kommt auf diesen Platz</span>}
                </span>
                {vorgemerkt && !gesperrt && (
                  <button type="button" className="es-knopf" disabled={laeuft !== null || !!tausch}
                    title={tausch ? "Erst den Tausch-Satz unten entfernen" : undefined}
                    onClick={() => void zuruecknehmen(satz.id)}>
                    {laeuft === satz.id ? "…" : "Zurücknehmen"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {frueher.length > 0 && (
        <div className="db-karte ao-karte">
          <div className="db-karte-kopf"><span className="db-karte-titel">Hier eingelagert</span></div>
          {frueher.map((satz) => {
            const k = kopf(satz);
            const mit = satz.entnahme_order_id ? auftraege.find((o) => o.id === satz.entnahme_order_id) : null;
            return (
              <div key={satz.id} className="ao-regal">
                <span className="ao-platz ao-draussen">{k.code}</span>
                <span className="dm-fz-text">
                  <b>{k.titel}</b>
                  <span className="small">
                    {k.lager ? `${k.lager} · ` : ""}eingelagert {formatDate(satz.created_at.slice(0, 10))} · ausgelagert {formatDate((satz.removed_at ?? "").slice(0, 10))}
                    {mit ? ` mit Auftrag ${auftragsNr(mit.order_number)}` : ""}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
