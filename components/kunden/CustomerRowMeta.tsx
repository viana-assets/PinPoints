import type { Customer } from "@/lib/types";
import { formatDate, todayStr } from "@/lib/helpers";

// Zeigt je nach gewählter Listenansicht (Datum/Status/Tage seit Kontakt) die passende
// Meta-Zeile unter einem Kunden in der Kundenliste an. Ausgelagert aus app/page.tsx,
// siehe docs/roadmap.md Phase 2. `daysSinceContact` ist nur hier gebraucht, daher lokal
// gehalten statt in lib/helpers.ts aufgenommen zu werden.
function daysSinceContact(lastContact: string | null): number | null {
  if (!lastContact) return null;
  const then = new Date(lastContact + "T00:00:00");
  const now = new Date(todayStr() + "T00:00:00");
  return Math.round((now.getTime() - then.getTime()) / 86400000);
}

export function CustomerRowMeta({ customer, rowDisplay }: { customer: Customer; rowDisplay: "datum" | "status" | "tage" }) {
  if (customer.lat == null) return <div className="meta">Keine Kartenposition</div>;

  if (rowDisplay === "status") {
    return (
      <div className="meta">
        <span className={`row-pill ${customer.status === "kontaktiert" ? "green" : "red"}`}>
          {customer.status === "kontaktiert" ? "Kontaktiert" : "Offen"}
        </span>
      </div>
    );
  }
  if (rowDisplay === "tage") {
    const d = daysSinceContact(customer.last_contact);
    if (d == null) return <div className="meta">Noch nicht kontaktiert</div>;
    return <div className="meta">{d === 0 ? "Heute kontaktiert" : `Vor ${d} ${d === 1 ? "Tag" : "Tagen"} kontaktiert`}</div>;
  }
  return (
    <div className="meta">
      {customer.last_contact ? `Letzter Kontakt: ${formatDate(customer.last_contact)}` : "Noch nicht kontaktiert"}
    </div>
  );
}
