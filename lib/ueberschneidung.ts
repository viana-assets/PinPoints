import type { Order } from "./types";
import { auftragsZeitraum, hhmmAus } from "./calendar";

// Doppelbuchungen erkennen (Fahrplan D1, gebaut am 23.09.2026).
//
// Die Frage beim Einteilen: Ist dieser Mitarbeiter oder dieser Transporter zur selben Zeit
// schon an einem ANDEREN Auftrag? Bis hierher sah man das nur, wenn man zufällig genau diesen
// Tag im Stundenraster öffnete – im Saisongeschäft kostet eine Doppelbuchung einen halben Tag.
//
// BEWUSST EIN HINWEIS UND KEINE SPERRE. Es gibt gute Gründe für eine Überschneidung: zwei
// Aufträge beim selben Kunden, ein Termin, der „irgendwann zwischen 10 und 12" liegt, eine
// geschätzte Endzeit, die in Wahrheit kürzer ist. Die Anwendung sagt, was sie sieht; ob es ein
// Fehler ist, entscheidet der Mensch.
//
// Was NICHT mitzählt:
//   - stornierte und gelöschte Aufträge – die finden nicht statt;
//   - Aufträge ohne Uhrzeit – ohne Zeit gibt es keine Überschneidung, nur eine Vermutung;
//   - Berührung ohne Überlappung: 10:00–11:00 und 11:00–12:00 passen hintereinander.
//
// Eine fehlende Endzeit wird wie im Stundenraster mit der Standarddauer angenommen (derselbe
// Aufruf `auftragsZeitraum`), und das steht dann auch so im Hinweis („Ende geschätzt").

export type TerminEntwurf = {
  id: string;
  order_date: string;
  time: string | null;
  end_time: string | null;
};

export type Ueberschneidung = {
  art: "mitarbeiter" | "fahrzeug";
  // Mitarbeiter- bzw. Firmenfahrzeug-Kennung, um die es geht.
  werId: string;
  auftrag: Order;
  von: string;
  bis: string;
  // Beruht die Überschneidung auf einer angenommenen Endzeit (bei einem der beiden Termine)?
  geschaetzt: boolean;
};

export function terminUeberschneidungen(
  entwurf: TerminEntwurf,
  mitarbeiterIds: string[],
  firmenfahrzeugId: string | null,
  andere: Order[],
  zuordnungen: Record<string, string[]>,
  standardMinuten: number
): Ueberschneidung[] {
  const eigener = auftragsZeitraum(entwurf, standardMinuten);
  if (!eigener || !entwurf.order_date) return [];

  const ergebnis: Ueberschneidung[] = [];
  for (const auftrag of andere) {
    if (auftrag.id === entwurf.id) continue;
    if (auftrag.deleted_at || auftrag.status === "storniert") continue;
    if (auftrag.order_date !== entwurf.order_date) continue;
    const fremd = auftragsZeitraum(auftrag, standardMinuten);
    if (!fremd) continue;
    // Echte Überlappung, nicht nur Berührung.
    if (!(eigener.start < fremd.ende && fremd.start < eigener.ende)) continue;

    const zeit = {
      von: hhmmAus(fremd.start),
      bis: hhmmAus(fremd.ende),
      geschaetzt: eigener.geschaetzt || fremd.geschaetzt,
    };
    const dort = zuordnungen[auftrag.id] ?? [];
    for (const id of mitarbeiterIds) {
      if (dort.includes(id)) ergebnis.push({ art: "mitarbeiter", werId: id, auftrag, ...zeit });
    }
    if (firmenfahrzeugId && auftrag.firmenfahrzeug_id === firmenfahrzeugId) {
      ergebnis.push({ art: "fahrzeug", werId: firmenfahrzeugId, auftrag, ...zeit });
    }
  }
  return ergebnis.sort((a, b) => a.von.localeCompare(b.von));
}
