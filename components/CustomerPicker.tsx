import { useState } from "react";
import type { Customer } from "@/lib/types";
import { SuchFeld } from "@/components/SuchFeld";

// Wiederverwendbare Kundenauswahl (Suche + Liste), für Lager- und Aufträge-Modul.
// Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
//
// Seit v134 (Runde 2 der Designprüfung) im Stil der Listen: das Suchfeld der Kundenliste
// (`SuchFeld`), die Treffer als Zeilen zum Antippen, der gewählte Kunde als graue Karte mit
// „Ändern“. Vorher ein schmales Eingabefeld mit aufklappender Liste und Stil am Element.
export function CustomerPicker({ customers, value, onChange, placeholder }: {
  customers: Customer[]; value: string; onChange: (customerId: string) => void; placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value) || null;
  const q = query.trim().toLowerCase();
  const matches = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)).slice(0, 8)
    : [];

  if (selected && !open) {
    return (
      <div className="kp-feld">
        <span className="kp-label">Kunde</span>
        <div className="kp-gewaehlt">
          <span className="kp-text"><b>{selected.name}</b>{selected.address && <span>{selected.address}</span>}</span>
          <button type="button" className="kp-aendern" onClick={() => { setOpen(true); setQuery(""); }}>Ändern</button>
        </div>
      </div>
    );
  }
  return (
    <div className="kp-feld">
      <span className="kp-label">Kunde</span>
      <SuchFeld value={query} onWert={setQuery} placeholder={placeholder || "Kunde suchen …"} ariaLabel="Kunde suchen" />
      {/* Erst mit Suchtext eine Liste – acht beliebige Kunden helfen niemandem. */}
      {q && <div className="kp-liste" role="listbox" aria-label="Treffer">
        {matches.length === 0 && <div className="kp-leer">Keine Treffer</div>}
        {matches.map((c) => (
          <button key={c.id} type="button" role="option" aria-selected={c.id === value} className={"kp-treffer" + (c.id === value ? " aktiv" : "")}
            onClick={() => { onChange(c.id); setOpen(false); setQuery(""); }}>
            <b>{c.name}</b>
            {c.address && <span>{c.address}</span>}
          </button>
        ))}
      </div>}
      {selected && <button type="button" className="kp-aendern kp-zurueck" onClick={() => setOpen(false)}>Bei {selected.name} bleiben</button>}
    </div>
  );
}
