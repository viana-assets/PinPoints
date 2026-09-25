import { useMemo, useState } from "react";
import type { Customer, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { SAISON_LABEL } from "@/lib/constants";
import { LANGLIEGER_EURO, LANGLIEGER_MONATE, formatDate, formatEUR, todayStr } from "@/lib/helpers";
import { langlieger } from "@/lib/langlieger";

// Langlieger-Übersicht (Fahrplan E4). Die Rechnung steht in lib/langlieger.ts; hier wird nur
// gefiltert und angezeigt.
//
// Sie steht auf der Startseite des Lagers und nicht in einem eigenen Reiter: Sie beantwortet
// eine Lagerfrage („was liegt hier zu lange"), und wer sie braucht, ist ohnehin im Lager.
// Zugeklappt, solange niemand hineinsieht – aber mit der Zahl in der Überschrift, damit sie
// auffällt, ohne im Weg zu stehen.
export function LangliegerListe({ tireStorages, customers, vehicles, storageSlots, warehouses, monatspreisNetto, onOpenPlatz }: {
  tireStorages: TireStorage[];
  customers: Customer[];
  vehicles: Vehicle[];
  storageSlots: StorageSlot[];
  warehouses: Warehouse[];
  // Heute gültiger Monatspreis der Lagergebühr, netto. null = kein Preis gepflegt – dann
  // zählt nur die Monatsschwelle, und die Spalte „Gebühr bis heute" bleibt leer.
  monatspreisNetto: number | null;
  // Öffnet das Blatt des Platzes (26.09.2026). Dort stehen Kunde, Gebühr und „Auslagern" – die
  // frühere Tabelle führte mit zwei Links getrennt zum Kunden und ins Lager.
  onOpenPlatz: (slotId: string) => void;
}) {
  const [abMonaten, setAbMonaten] = useState(String(LANGLIEGER_MONATE));
  const [abEuro, setAbEuro] = useState(String(LANGLIEGER_EURO));

  const monateZahl = Math.max(1, parseInt(abMonaten, 10) || LANGLIEGER_MONATE);
  const euroZahl = abEuro.trim() === "" ? null : Math.max(0, parseFloat(abEuro.replace(",", ".")) || 0);

  const zeilen = useMemo(
    () => langlieger(tireStorages, todayStr(), monatspreisNetto, monateZahl, euroZahl),
    [tireStorages, monatspreisNetto, monateZahl, euroZahl]
  );

  const kundeNach = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const fahrzeugNach = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const platzNach = useMemo(() => new Map(storageSlots.map((s) => [s.id, s])), [storageSlots]);
  const lagerNach = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const summe = zeilen.reduce((s, z) => s + (z.summeNetto ?? 0), 0);

  return (
    <details className="langlieger">
      <summary>
        <b>Langlieger</b>
        <span className={`langlieger-zahl ${zeilen.length > 0 ? "hat" : ""}`}>{zeilen.length}</span>
        <span className="small">
          {zeilen.length === 0
            ? "kein Satz über der Schwelle"
            : `${zeilen.length === 1 ? "Satz" : "Sätze"} ab ${monateZahl} Monaten${euroZahl != null && monatspreisNetto != null ? ` oder ${formatEUR(euroZahl)}` : ""}`
              + (monatspreisNetto != null && summe > 0 ? ` · zusammen ${formatEUR(summe)} netto` : "")}
        </span>
      </summary>

      <div className="langlieger-filter">
        <label>ab Monaten
          <input type="number" min={1} className="feld-kompakt" value={abMonaten} onChange={(e) => setAbMonaten(e.target.value)} />
        </label>
        <label>oder ab € netto
          <input type="number" min={0} step="1" className="feld-kompakt" value={abEuro}
                 disabled={monatspreisNetto == null} onChange={(e) => setAbEuro(e.target.value)} />
        </label>
        {monatspreisNetto == null && (
          <span className="small">Für die Lagergebühr ist kein Preis gepflegt – es zählen nur die Monate.</span>
        )}
      </div>

      {zeilen.length === 0 ? (
        <div className="empty">Kein eingelagerter Satz reißt diese Schwellen.</div>
      ) : (
        <div className="lg-zeilen langlieger-zeilen">
          {zeilen.map(({ satz, monate, summeNetto }) => {
            const kunde = kundeNach.get(satz.customer_id);
            const platz = platzNach.get(satz.storage_slot_id);
            const lager = platz ? lagerNach.get(platz.warehouse_id) : undefined;
            const fahrzeug = satz.vehicle_id ? fahrzeugNach.get(satz.vehicle_id) : undefined;
            return (
              <button key={satz.id} type="button" className="lg-zeile" disabled={!platz} onClick={() => { if (platz) onOpenPlatz(platz.id); }}>
                <span className="lg-code">{platz?.code ?? "–"}</span>
                <span className="lg-zeile-text">
                  <span className="lg-zeile-kunde">{kunde?.name ?? "Unbekannter Kunde"}</span>
                  <span className="lg-zeile-info">
                    {[
                      `seit ${monate} Monaten`,
                      warehouses.length > 1 ? lager?.name : null,
                      fahrzeug?.license_plate,
                      satz.saison ? SAISON_LABEL[satz.saison] : null,
                      `eingelagert ${formatDate(satz.created_at.slice(0, 10))}`,
                      `Kontakt ${kunde?.last_contact ? formatDate(kunde.last_contact.slice(0, 10)) : "nie"}`,
                    ].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {summeNetto != null && <span className="lg-betrag">{formatEUR(summeNetto)}</span>}
              </button>
            );
          })}
        </div>
      )}
    </details>
  );
}
