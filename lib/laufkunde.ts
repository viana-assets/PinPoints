import type { Customer, Order } from "./types";

// Der Laufkunde am Auftrag (Migration 57, 24.09.2026).
//
// Die Laufkundschaft ist EIN Sammelkunde für alle Barverkäufe (Migration 53). Wer es jeweils war,
// steht seit Migration 57 am AUFTRAG: Name, Telefon, Einsatzort. Überall, wo ein Auftrag seinen
// Kunden zeigt – Liste, Kalender, Auftragsfenster, Anruf- und Navigationsknopf, Erinnerung –,
// soll dieser Mensch erscheinen und nicht „Laufkundschaft".
//
// Deshalb EINE Funktion, die aus Sammelkunde + Auftrag einen Kunden macht, wie ihn die übrigen
// Bauteile ohnehin erwarten. Kein Bauteil muss den Sonderfall kennen: Der Anrufknopf findet die
// Nummer in `phone_mobile`, die Navigation den Einsatzort in `address`, die Liste den Namen in
// `name`. Stünde die Ausnahme in jedem Bauteil einzeln, fehlte sie in einem.
//
// Der Einsatzort ist Freitext und wird nicht geokodiert – deshalb bleiben lat/lng leer, und die
// Navigation sucht nach dem Text. Eine Nadel entsteht daraus nie.

export function istLaufkundenAuftrag(kunde: Pick<Customer, "laufkundschaft"> | null | undefined): boolean {
  return kunde?.laufkundschaft === true;
}

// Der Anzeigename: „Max Muster (Laufkunde)". Ohne eingetragenen Namen bleibt es beim Namen des
// Sammelkunden – dann sieht man sofort, dass noch etwas fehlt.
export function laufkundeName(auftrag: Pick<Order, "laufkunde_name">, sammelkunde: Pick<Customer, "name">): string {
  const name = (auftrag.laufkunde_name ?? "").trim();
  return name ? `${name} (Laufkunde)` : sammelkunde.name;
}

export function kundeZumAuftrag(
  auftrag: Pick<Order, "laufkunde_name" | "laufkunde_telefon" | "laufkunde_ort">,
  kunde: Customer | null | undefined
): Customer | undefined {
  if (!kunde) return undefined;
  if (!istLaufkundenAuftrag(kunde)) return kunde;
  return {
    ...kunde,
    name: laufkundeName(auftrag, kunde),
    phone_mobile: (auftrag.laufkunde_telefon ?? "").trim() || null,
    phone_landline: null,
    email: null,
    address: (auftrag.laufkunde_ort ?? "").trim(),
    lat: null,
    lng: null,
    geo_genauigkeit: null,
  };
}

// Kurzform für Listen: den passenden Kunden zu einem Auftrag aus dem Bestand holen.
export function kundeFuerAuftrag(
  auftrag: Pick<Order, "customer_id" | "laufkunde_name" | "laufkunde_telefon" | "laufkunde_ort">,
  kunden: Customer[]
): Customer | undefined {
  return kundeZumAuftrag(auftrag, kunden.find((c) => c.id === auftrag.customer_id));
}
