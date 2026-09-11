import { useState } from "react";
import type { Customer, EingelagertesRad, Saison, StorageSlot, TireStorage, Vehicle, Warehouse } from "@/lib/types";
import { PROFIL_KRITISCH_MM, SAISON_LABEL, SAISON_LISTE } from "@/lib/constants";
import { formatDate, profilText, satzProfilMm, todayStr } from "@/lib/helpers";
import { IconNavPin } from "@/components/icons";
import { ProfilMarke } from "@/components/lager/ProfilMarke";

// Die Saisonliste (docs/lager-ausbaukonzept.md, D1).
//
// Die Frage, die dieses Geschäft zweimal im Jahr stellt: „Welche Kunden haben Winterreifen bei
// uns liegen, die sie in sechs Wochen brauchen?" Das ist keine Lagerfrage – das ist die
// Terminplanung und die Umsatzplanung für ein halbes Jahr. Bisher war sie nur zu beantworten,
// indem jemand das Regal abgeht.
//
// Die Liste ist bewusst KEIN neuer Datenbestand, sondern eine Sicht auf den vorhandenen:
// eingelagerte Sätze (aktiv) + Saison + Kunde + Fahrzeug. Sie entsteht vollständig aus dem
// einen Feld, das Migration 30 hinzugefügt hat.

export type SaisonZeile = {
  einlagerung: TireStorage;
  cust: Customer;
  vehicle: Vehicle | null;
  slot: StorageSlot | null;
  // Die Räder dieses Satzes – leer bei Sammelerfassung. Sie kommen fertig zugeordnet aus
  // app/page.tsx, damit die Liste nicht je Zeile den ganzen Radbestand durchsucht.
  raeder: EingelagertesRad[];
};

export function SaisonPanel({
  zeilen, gesamtAktiv, saison, onSaisonChange, plz, onPlzChange, nurFaellige, onNurFaelligeChange,
  nurSchwach, onNurSchwachChange,
  warehouses, onOpenCustomer, onCall, onNavigate, onWiedervorlage, schreibt,
}: {
  zeilen: SaisonZeile[];
  // Wie viele Sätze insgesamt aktiv eingelagert sind – der Bezugspunkt für die Kopfzeile.
  gesamtAktiv: number;
  saison: Saison | "alle";
  onSaisonChange: (s: Saison | "alle") => void;
  plz: string;
  onPlzChange: (p: string) => void;
  nurFaellige: boolean;
  onNurFaelligeChange: (b: boolean) => void;
  nurSchwach: boolean;
  onNurSchwachChange: (b: boolean) => void;
  warehouses: Warehouse[];
  onOpenCustomer: (id: string) => void;
  onCall: (e: React.MouseEvent, cust: Customer) => void;
  onNavigate: (e: React.MouseEvent, cust: Customer) => void;
  onWiedervorlage: (kundenIds: string[], datum: string) => Promise<void>;
  schreibt: boolean;
}) {
  // Vorschlag: in sechs Wochen. Der übliche Vorlauf, um vor der Saisonspitze durch die Liste
  // zu telefonieren – änderbar, bevor es losgeht.
  const [datum, setDatum] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 42);
    return d.toISOString().slice(0, 10);
  });

  // Ein Kunde kann zwei Sätze liegen haben (zwei Autos). Für die Anrufliste zählt der Mensch,
  // nicht der Satz – sonst steht er zweimal auf der Liste und wird zweimal angerufen.
  const kundenIds = Array.from(new Set(zeilen.map((z) => z.cust.id)));

  // Wie viele der angezeigten Sätze sind unter der kritischen Grenze? Dieselbe Regel wie im
  // Filter – einmal formuliert, damit Zahl und Filter nicht auseinanderlaufen können.
  const schwacheZeilen = zeilen.filter((z) => {
    const mm = satzProfilMm(z.einlagerung, z.raeder);
    return mm != null && mm < PROFIL_KRITISCH_MM;
  }).length;

  function lagerName(slot: StorageSlot | null): string {
    if (!slot) return "Platz unbekannt";
    const wh = warehouses.find((w) => w.id === slot.warehouse_id);
    return wh ? `${slot.code} · ${wh.name}` : slot.code;
  }
  function fahrzeugText(v: Vehicle | null): string {
    if (!v) return "– kein Fahrzeug hinterlegt –";
    return [v.license_plate, v.make_model].filter(Boolean).join(" · ") || "Fahrzeug ohne Kennzeichen";
  }

  return (
    <div className="tabpanel active">
      <div className="filterbar">
        <button type="button" className={"chip" + (saison === "alle" ? " active" : "")} onClick={() => onSaisonChange("alle")}>
          Alle
        </button>
        {SAISON_LISTE.map((wert) => (
          <button key={wert} type="button" className={"chip" + (saison === wert ? " active" : "")} onClick={() => onSaisonChange(wert)}>
            {SAISON_LABEL[wert]}
          </button>
        ))}
      </div>

      <div className="row" style={{ alignItems: "flex-end", marginTop: 6 }}>
        <div className="field" style={{ marginBottom: 0, maxWidth: 200 }}>
          <label>Postleitzahl beginnt mit</label>
          <input
            type="text" inputMode="numeric" placeholder="z. B. 904"
            value={plz} onChange={(e) => onPlzChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
          />
        </div>
        <div className="checkbox-row" style={{ margin: "0 0 6px" }}>
          <input
            type="checkbox" id="saison-nur-faellige"
            checked={nurFaellige} onChange={(e) => onNurFaelligeChange(e.target.checked)}
          />
          <label htmlFor="saison-nur-faellige">Nur fällige (rote Flagge)</label>
        </div>
        {/* Der eigentliche Verkaufsanlass: nicht „wer hat Reifen bei uns", sondern „bei wem
            reicht das Profil nicht mehr durch die nächste Saison". Erst seit Migration 33
            beantwortbar, wenn einzeln gemessen wurde – bei Sammelwerten greift derselbe
            Vergleich. */}
        <div className="checkbox-row" style={{ margin: "0 0 6px" }}>
          <input
            type="checkbox" id="saison-nur-schwach"
            checked={nurSchwach} onChange={(e) => onNurSchwachChange(e.target.checked)}
          />
          <label htmlFor="saison-nur-schwach">Nur mit schwachem Profil (unter {profilText(PROFIL_KRITISCH_MM)})</label>
        </div>
      </div>

      {/* Die Kopfzeile ist die eigentliche Antwort. Sie steht deshalb als Satz da und nicht als
          Zahl in einer Ecke. */}
      <div style={{ margin: "8px 0 4px", fontWeight: 700 }}>
        {zeilen.length === 0
          ? "Kein Satz passt zu dieser Auswahl."
          : `${kundenIds.length} ${kundenIds.length === 1 ? "Kunde hat" : "Kunden haben"} ` +
            `${saison === "alle" ? "Reifen" : `${SAISON_LABEL[saison]}reifen`} bei uns liegen` +
            (zeilen.length !== kundenIds.length ? ` (${zeilen.length} Sätze)` : "")}
      </div>
      {/* Die Zahl, die den Anruf lohnend macht – und zwar bevor jemand die Liste durchgeht.
          Sie steht nur da, wenn nicht ohnehin danach gefiltert ist. */}
      {!nurSchwach && schwacheZeilen > 0 && (
        <div style={{ marginBottom: 4, color: "var(--red)", fontWeight: 700 }}>
          Bei {schwacheZeilen} {schwacheZeilen === 1 ? "Satz" : "Sätzen"} liegt das schwächste Rad
          unter {profilText(PROFIL_KRITISCH_MM)}.
        </div>
      )}
      <div className="small" style={{ marginBottom: 8 }}>
        Insgesamt aktiv eingelagert: {gesamtAktiv} {gesamtAktiv === 1 ? "Satz" : "Sätze"}. Die
        Karte zeigt in diesem Reiter nur die Kunden aus der Liste.
      </div>

      {zeilen.length > 0 && (
        <div className="row" style={{ alignItems: "flex-end", marginBottom: 8 }}>
          <div className="field" style={{ marginBottom: 0, maxWidth: 190 }}>
            <label>Wiedervorlage am</label>
            <input type="date" min={todayStr()} value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
          <button
            type="button" className="btn-primary" style={{ flex: "0 0 auto" }}
            disabled={schreibt || !datum}
            onClick={() => {
              // Nachfragen, weil hier mit einem Druck bis zu mehrere hundert Kundendatensätze
              // geändert werden. Die Zahl steht in der Frage – „Wirklich?" allein beantwortet
              // niemand richtig.
              const sicher = window.confirm(
                `Bei ${kundenIds.length} ${kundenIds.length === 1 ? "Kunden" : "Kunden"} die Wiedervorlage auf ${formatDate(datum)} setzen?\n\n` +
                  "Sie erscheinen ab diesem Datum wieder als fällig. Der Kontaktstatus bleibt unverändert – es wurde ja noch nicht angerufen."
              );
              if (!sicher) return;
              void onWiedervorlage(kundenIds, datum);
            }}
          >
            {schreibt ? "Wird gesetzt…" : `Anrufliste erzeugen (${kundenIds.length})`}
          </button>
        </div>
      )}

      <div style={{ overflowY: "auto", overflowX: "auto", flex: 1 }}>
        {zeilen.length === 0 ? (
          <div className="empty">
            Kein eingelagerter Satz passt zu dieser Auswahl. Sätze ohne Saison tauchen nur unter
            &bdquo;Alle&ldquo; auf – die Saison wird beim Einlagern im Auftrag gesetzt.
          </div>
        ) : (
          <table className="appt-table">
            <thead>
              {/* Profil steht bewusst an zweiter Stelle und nicht am Ende: Auf dem Handy
                  scrollt die Tabelle waagerecht, und die hinterste Spalte ist dann genau die,
                  die man nicht sieht. Die Lesereihenfolge ist damit auch die Reihenfolge der
                  Fragen: wer – wie dringend – welches Auto – wo liegt es. */}
              <tr><th>Kunde</th><th>Profil</th><th>Fahrzeug</th><th>Lagerplatz</th><th>Satz</th><th></th></tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.einlagerung.id} className="klickbar" onClick={() => onOpenCustomer(z.cust.id)} title="Kundenfenster öffnen">
                  <td>
                    <b>{z.cust.name}</b>
                    <div className="small">{z.cust.address}</div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <ProfilMarke satz={z.einlagerung} raeder={z.raeder} praefix="" />
                  </td>
                  <td>{fahrzeugText(z.vehicle)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{lagerName(z.slot)}</td>
                  <td>
                    {z.einlagerung.saison ? SAISON_LABEL[z.einlagerung.saison] : "ohne Saison"}
                    <div className="small">{z.einlagerung.dot_date ? `DOT ${z.einlagerung.dot_date}` : "DOT –"}</div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                    {z.cust.address.trim() && (
                      <button className="call-icon-btn small nav-icon-btn" title="Navigation starten" onClick={(e) => onNavigate(e, z.cust)}>
                        <IconNavPin />
                      </button>
                    )}
                    <button className="call-icon-btn small" title="Anrufen" onClick={(e) => onCall(e, z.cust)}>📞</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
