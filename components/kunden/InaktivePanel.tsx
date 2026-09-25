import { useState } from "react";
import type { Customer } from "@/lib/types";
import { anzeigeName, initialen } from "@/lib/kundenAnsicht";

// „Inaktive Kunden" (neu gestaltet am 26.09.2026, Entwurf „S · Inaktive Kunden") – vorher als
// Block direkt in app/page.tsx: eine Liste ohne Suche mit zwei Knöpfen je Zeile.
//
// Jetzt mit Suche und im Stil der Kundenliste. „Reaktivieren" wirkt sofort wie bisher; die Karte
// bleibt danach bis zum Verlassen der Seite mit „Rückgängig" stehen – sonst verschwände sie beim
// Antippen, und ein Fehlgriff ließe sich nicht mehr finden.

export function InaktivePanel({ inaktive, alle, onSetActive, onOpen }: {
  inaktive: Customer[];
  // Alle Kunden – um gerade reaktivierte weiter zeigen zu können.
  alle: Customer[];
  onSetActive: (id: string, aktiv: boolean) => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const [suche, setSuche] = useState("");
  const [reaktiviert, setReaktiviert] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const zurueck = reaktiviert.map((id) => alle.find((c) => c.id === id)).filter((c): c is Customer => !!c && c.active !== false);
  const liste = [...zurueck, ...inaktive.filter((c) => !reaktiviert.includes(c.id))];
  const q = suche.trim().toLowerCase();
  const sichtbar = q ? liste.filter((c) => [c.name, c.company, c.address, String(c.kundennummer ?? "")].some((x) => (x ?? "").toLowerCase().includes(q))) : liste;

  async function schalten(c: Customer, aktiv: boolean) {
    setLaeuft(c.id);
    try {
      await onSetActive(c.id, aktiv);
      setReaktiviert((r) => (aktiv ? [c.id, ...r] : r.filter((x) => x !== c.id)));
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <div className="tabpanel active">
      <div className="kl-seite">
        <div className="lg-leiste">
          <div className="lg-kopf">
            <div className="lg-titel">
              <h2>Inaktive Kunden</h2>
              <span className="lg-unter">{inaktive.length} deaktiviert{zurueck.length ? ` · ${zurueck.length} gerade reaktiviert` : ""}</span>
            </div>
          </div>
          <label className="lg-suchfeld">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
            <input type="search" placeholder="Name, Firma, Adresse, Kundennummer …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Inaktive Kunden suchen" />
          </label>
        </div>

        <span className="small ik-hinweis">Deaktivierte Kunden stehen nicht in der Kundenliste und haben keine Nadel auf der Karte. Aufträge und Rechnungen bleiben erhalten.</span>

        {sichtbar.length === 0 ? (
          <div className="db-karte"><div className="db-leer">{liste.length === 0 ? "Keine deaktivierten Kunden." : "Kein Treffer."}</div></div>
        ) : (
          <div className="kl-karte">
            {sichtbar.map((c) => {
              const wieder = reaktiviert.includes(c.id);
              const titel = anzeigeName(c);
              return (
                <div key={c.id} className={"kl-zeile" + (wieder ? " ik-wieder" : "")}>
                  <span className={"kl-kreis " + (wieder ? "green" : "gray")} aria-hidden="true">{initialen(titel)}</span>
                  <button type="button" className="kl-text" onClick={() => onOpen(c.id)}>
                    <span className="kl-name">{titel}</span>
                    <span className="kl-adresse">{[(c.company || "").trim() ? c.name : null, c.address].filter(Boolean).join(" · ") || "ohne Adresse"}</span>
                    <span className="kl-meta">
                      {wieder ? <span className="kl-status green">wieder in der Kundenliste ✓</span>
                        : c.kundennummer != null && <span className="kl-status">Kd.-Nr. {c.kundennummer}</span>}
                    </span>
                  </button>
                  <button type="button" className={"ik-knopf" + (wieder ? " zurueck" : "")} disabled={laeuft === c.id} onClick={() => void schalten(c, !wieder)}>
                    {laeuft === c.id ? "…" : wieder ? "Rückgängig" : "Reaktivieren"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <span className="small sl-fuss">Gelöschte Kunden liegen im Papierkorb (Admin).</span>
      </div>
    </div>
  );
}
