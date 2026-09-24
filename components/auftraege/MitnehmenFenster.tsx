import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuftragFahrzeug, Customer, Order, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { SAISON_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/helpers";
import { mitnehmenListe } from "@/lib/mitnehmen";
import { fetchAuftragFahrzeuge } from "@/lib/api/auftragFahrzeuge";

// Das Fenster hinter dem Abendhinweis „Morgen 3 Sätze mitnehmen" (Migration 55).
//
// Es rechnet mit DERSELBEN Funktion wie der Versand (`mitnehmenListe` in lib/mitnehmen.ts) –
// sonst zeigte es irgendwann etwas anderes als die Meldung, die hierher geführt hat. Die Daten
// kommen aus dem geladenen Bestand; nur die Fahrzeuge je Auftrag holt es selbst, weil die Seite
// sie sonst nur für den gerade offenen Auftrag lädt.
//
// Ein Techniker sieht hier nur seine eigenen Aufträge – die Datenbank gibt ihm keine anderen
// (RLS, Migration 13/15). Das ist dieselbe Auswahl, die ihm die Meldung geschickt hat.
export function MitnehmenFenster({ supabase, datum, orders, tireStorages, customers, vehicles, storageSlots, warehouses, laedt, onClose, onAuftragOeffnen }: {
  supabase: SupabaseClient;
  datum: string;
  orders: Order[];
  tireStorages: TireStorage[];
  customers: Customer[];
  vehicles: Vehicle[];
  storageSlots: StorageSlot[];
  warehouses: Warehouse[];
  // Lädt der Lagerbestand noch? Dann steht „lädt" statt „nichts mitzunehmen" da – das zweite
  // wäre in diesem Moment eine falsche Entwarnung.
  laedt: boolean;
  onClose: () => void;
  onAuftragOeffnen: (auftragId: string) => void;
}) {
  const tagesauftraege = useMemo(() => orders.filter((o) => o.order_date === datum), [orders, datum]);
  const [fahrzeuge, setFahrzeuge] = useState<AuftragFahrzeug[] | null>(null);
  const ids = tagesauftraege.map((o) => o.id).join(",");
  useEffect(() => {
    let abgebrochen = false;
    fetchAuftragFahrzeuge(supabase, ids ? ids.split(",") : [])
      .then((z) => { if (!abgebrochen) setFahrzeuge(z); })
      .catch(() => { if (!abgebrochen) setFahrzeuge([]); });
    return () => { abgebrochen = true; };
  }, [supabase, ids]);

  const eintraege = useMemo(
    () => mitnehmenListe(datum, tagesauftraege, tireStorages, fahrzeuge ?? []),
    [datum, tagesauftraege, tireStorages, fahrzeuge]
  );
  const saetze = eintraege.reduce((n, e) => n + e.saetze.length, 0);
  const wartet = laedt || fahrzeuge === null;

  function platzText(slotId: string): string {
    const platz = storageSlots.find((s) => s.id === slotId);
    if (!platz) return "Platz unbekannt";
    const lager = warehouses.find((w) => w.id === platz.warehouse_id);
    return lager && warehouses.length > 1 ? `${platz.code} · ${lager.name}` : platz.code;
  }
  function fahrzeugText(id: string | null): string {
    if (!id) return "ohne Fahrzeug";
    const v = vehicles.find((x) => x.id === id);
    return v ? [v.license_plate, v.make_model].filter(Boolean).join(" · ") || "Fahrzeug" : "Fahrzeug";
  }

  return (
    <div className="modal-overlay modal-mitnehmen" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ position: "relative", maxWidth: 520 }}>
        <button className="modal-close" onClick={onClose} aria-label="Schließen">✕</button>
        <h2 style={{ marginBottom: 2 }}>Mitnehmen am {formatDate(datum)}</h2>
        <p className="small" style={{ marginTop: 0 }}>
          {wartet ? "Lädt …" : saetze === 0
            ? "Für diesen Tag liegt nichts im Regal, das mitmuss."
            : `${saetze} ${saetze === 1 ? "Satz" : "Sätze"} für ${eintraege.length} ${eintraege.length === 1 ? "Auftrag" : "Aufträge"}, in der Reihenfolge der Termine.`}
        </p>

        {!wartet && eintraege.map(({ auftrag, saetze: liste }) => {
          const kunde = customers.find((c) => c.id === auftrag.customer_id);
          return (
            <button key={auftrag.id} type="button" className="mitnehmen-zeile" onClick={() => onAuftragOeffnen(auftrag.id)}>
              <span className="mz-zeit">{auftrag.time || "–"}</span>
              <span className="mz-inhalt">
                <b>{kunde?.name ?? "Kunde"}</b>
                {liste.map((s) => (
                  <span key={s.id} className="mz-satz">
                    <b>{platzText(s.storage_slot_id)}</b>
                    {" · "}{fahrzeugText(s.vehicle_id)}
                    {s.saison ? ` · ${SAISON_LABEL[s.saison]}` : ""}
                    {s.anzahl_raeder !== 4 ? ` · ${s.anzahl_raeder} Räder` : ""}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
