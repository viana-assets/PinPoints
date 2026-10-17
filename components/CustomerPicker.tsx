import { useState } from "react";
import type { Customer } from "@/lib/types";
import { SuchFeld } from "@/components/SuchFeld";
import { gruppenText } from "@/lib/kundengruppe";

// Wiederverwendbare Kundenauswahl (Suche + Liste), für Lager- und Aufträge-Modul.
// Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
//
// Seit v134 (Runde 2 der Designprüfung) im Stil der Listen: das Suchfeld der Kundenliste
// (`SuchFeld`), die Treffer als Zeilen zum Antippen, der gewählte Kunde als graue Karte mit
// „Ändern“. Vorher ein schmales Eingabefeld mit aufklappender Liste und Stil am Element.
// Seit v165 (Kundengruppen, Migration 101) steht bei Haupt- und Unterdebitoren die Einordnung dabei, und gesucht wird
// auch im Firmennamen. `alle`: die ganze Kartei für die Gruppenzeile, wenn `customers` nur eine Auswahl ist.
export function CustomerPicker({ customers, value, onChange, placeholder, alle, label = "Kunde" }: {
  customers: Customer[]; value: string; onChange: (customerId: string) => void; placeholder?: string; alle?: Customer[]; label?: string;
}) {
  const kartei = alle ?? customers;
  // Die Firma mit in die Zeile (v165): Bei Kundengruppen sucht man nach dem Firmennamen, fett steht der Ansprechpartner.
  const unter = (c: Customer) => [(c.company || "").trim() || null, gruppenText(c, kartei), c.address].filter(Boolean).join(" · ");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value) || null;
  const q = query.trim().toLowerCase();
  const matches = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q) || c.address.toLowerCase().includes(q)).slice(0, 8)
    : [];

  if (selected && !open) {
    return (
      <div className="kp-feld">
        <span className="kp-label">{label}</span>
        <div className="kp-gewaehlt">
          <span className="kp-text"><b>{selected.name}</b>{unter(selected) && <span>{unter(selected)}</span>}</span>
          <button type="button" className="kp-aendern" onClick={() => { setOpen(true); setQuery(""); }}>Ändern</button>
        </div>
      </div>
    );
  }
  return (
    <div className="kp-feld">
      <span className="kp-label">{label}</span>
      <SuchFeld value={query} onWert={setQuery} placeholder={placeholder || "Kunde suchen …"} ariaLabel="Kunde suchen" />
      {/* Erst mit Suchtext eine Liste – acht beliebige Kunden helfen niemandem. */}
      {q && <div className="kp-liste" role="listbox" aria-label="Treffer">
        {matches.length === 0 && <div className="kp-leer">Keine Treffer</div>}
        {matches.map((c) => (
          <button key={c.id} type="button" role="option" aria-selected={c.id === value} className={"kp-treffer" + (c.id === value ? " aktiv" : "")}
            onClick={() => { onChange(c.id); setOpen(false); setQuery(""); }}>
            <b>{c.name}</b>
            {unter(c) && <span>{unter(c)}</span>}
          </button>
        ))}
      </div>}
      {selected && <button type="button" className="kp-aendern kp-zurueck" onClick={() => setOpen(false)}>Bei {selected.name} bleiben</button>}
    </div>
  );
}
