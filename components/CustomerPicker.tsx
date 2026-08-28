import { useState } from "react";
import type { Customer } from "@/lib/types";

// Wiederverwendbare Kundenauswahl (Suche + Liste), für Lager- und Aufträge-Modul.
// Ausgelagert aus app/page.tsx, siehe docs/roadmap.md Phase 2.
export function CustomerPicker({ customers, value, onChange, placeholder }: {
  customers: Customer[]; value: string; onChange: (customerId: string) => void; placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value) || null;
  const matches = query.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.address.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : customers.slice(0, 8);

  if (selected && !open) {
    return (
      <div className="field">
        <label>Kunde</label>
        <div className="row" style={{ alignItems: "center" }}>
          <div style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--input-bg)", fontSize: 13 }}>
            {selected.name} <span className="small">– {selected.address}</span>
          </div>
          <button type="button" className="btn-secondary" style={{ flex: "0 0 auto" }} onClick={() => { setOpen(true); setQuery(""); }}>Ändern</button>
        </div>
      </div>
    );
  }
  return (
    <div className="field" style={{ position: "relative" }}>
      <label>Kunde</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "Kunde suchen…"}
      />
      {open && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, marginTop: 4, maxHeight: 180, overflowY: "auto", background: "var(--panel)" }}>
          {matches.length === 0 && <div className="small" style={{ padding: 8 }}>Keine Treffer</div>}
          {matches.map((c) => (
            <div
              key={c.id}
              className="cust-item"
              style={{ borderRadius: 0, boxShadow: "none", border: "none", borderBottom: "1px solid var(--border)" }}
              onClick={() => { onChange(c.id); setOpen(false); setQuery(""); }}
            >
              <div className="info">
                <div className="name">{c.name}</div>
                <div className="addr">{c.address}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
