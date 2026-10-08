import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, AuftragFahrzeug, Customer, Order, OrderArticle, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { SAISON_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/helpers";
import { mitnehmenListe, type MitnehmenEintrag } from "@/lib/mitnehmen";
import { addDays, toDateStr } from "@/lib/calendar";
import { packliste } from "@/lib/packliste";
import { PacklisteBlock } from "./PacklisteBlock";
import { fetchAuftragFahrzeuge } from "@/lib/api/auftragFahrzeuge";
import { Blatt } from "@/components/Blatt";

// Das Fenster hinter dem Abendhinweis „Morgen 3 Sätze mitnehmen" (Migration 55).
//
// Es rechnet mit DERSELBEN Funktion wie der Versand (`mitnehmenListe` in lib/mitnehmen.ts) –
// sonst zeigte es irgendwann etwas anderes als die Meldung, die hierher geführt hat. Die Daten
// kommen aus dem geladenen Bestand; nur die Fahrzeuge je Auftrag holt es selbst, weil die Seite
// sie sonst nur für den gerade offenen Auftrag lädt.
//
// Ein Techniker sieht hier nur seine eigenen Aufträge – die Datenbank gibt ihm keine anderen
// (RLS, Migration 13/15). Das ist dieselbe Auswahl, die ihm die Meldung geschickt hat.
export function MitnehmenFenster({ supabase, datum, orders, tireStorages, customers, vehicles, orderArticles, articles, storageSlots, warehouses, laedt, onClose, onAuftragOeffnen, onDatum, onStapelAuslagern }: {
  // Tag wechseln (‹ ›), seit v104 – der Weg aus dem Lager kommt mit „heute" an.
  onDatum?: (datum: string) => void;
  // Der geführte Modus „der Reihe nach auslagern" (E7). Fehlt ohne Recht zum Auslagern.
  onStapelAuslagern?: (eintraege: MitnehmenEintrag[]) => void;
  supabase: SupabaseClient;
  datum: string;
  orders: Order[];
  tireStorages: TireStorage[];
  customers: Customer[];
  vehicles: Vehicle[];
  // Für die Packliste (E2).
  orderArticles: OrderArticle[];
  articles: Article[];
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
  const pack = useMemo(
    () => packliste(datum, tagesauftraege, orderArticles, articles, fahrzeuge ?? [], vehicles),
    [datum, tagesauftraege, orderArticles, articles, fahrzeuge, vehicles]
  );
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
    <Blatt titel={`Mitnehmen am ${formatDate(datum)}`} breite="mittel" ebene="modal-mitnehmen" onClose={onClose}
      kopf={
        <div className="mz-kopf">
          {onDatum && <button type="button" className="pl-rund" aria-label="Tag zurück" onClick={() => onDatum(toDateStr(addDays(new Date(datum + "T12:00:00"), -1)))}>‹</button>}
          <div className="bl-titel">
            <h2 className="ab-titel">Mitnehmen am {formatDate(datum)}</h2>
            <span className="bl-unter">
              {wartet ? "Lädt …" : saetze === 0
                ? "Für diesen Tag liegt nichts im Regal, das mitmuss."
                : `${saetze} ${saetze === 1 ? "Satz" : "Sätze"} für ${eintraege.length} ${eintraege.length === 1 ? "Auftrag" : "Aufträge"}, in der Reihenfolge der Termine.`}
            </span>
          </div>
          {onDatum && <button type="button" className="pl-rund" aria-label="Tag weiter" onClick={() => onDatum(toDateStr(addDays(new Date(datum + "T12:00:00"), 1)))}>›</button>}
        </div>
      }
      fuss={!wartet && saetze > 0 && onStapelAuslagern
        ? <button type="button" className="btn-primary" onClick={() => onStapelAuslagern(eintraege)}>Der Reihe nach auslagern · {saetze} {saetze === 1 ? "Satz" : "Sätze"}</button>
        : undefined}>
      {/* E7 („Der Reihe nach auslagern“): seit v134 unten in der Fußzeile des Blatts. */}
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

      {/* Was außer den Sätzen mitmuss (E2). */}
      {!wartet && (
        <>
          <div className="bl-gruppe-titel">PACKLISTE</div>
          <PacklisteBlock liste={pack} />
        </>
      )}
    </Blatt>
  );
}
