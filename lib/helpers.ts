import type { ArticlePrice, Customer, Order, OrderArticle } from "./types";

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE");
}

// Die vier früheren Termin-Hilfsfunktionen (formatApptDateTime/apptDateTime/isApptPast/
// nextAppointment) sind entfallen: seit Migration 07 ist ein Termin ein Auftrag mit
// Uhrzeit, die Entsprechungen heißen formatOrderDateTime/orderDateTime/isOrderPast/
// nextOrder. Sie wurden nirgends mehr aufgerufen (Review-Befund D7).

export function formatOrderDateTime(o: Order): string {
  return formatDate(o.order_date) + (o.time ? `, ${o.time} Uhr` : "");
}

export function orderDateTime(o: Order): Date {
  return new Date(o.order_date + "T" + (o.time || "23:59") + ":00");
}

export function isOrderPast(o: Order): boolean {
  return orderDateTime(o).getTime() < Date.now();
}

export function nextOrder(orders: Order[]): Order | null {
  const list = orders
    .filter((o) => o.order_date && o.status !== "erledigt" && !isOrderPast(o))
    .slice()
    .sort((a, b) => orderDateTime(a).getTime() - orderDateTime(b).getTime());
  return list[0] || null;
}

export function isContactedActive(cust: Customer, periodMonths: number): boolean {
  if (cust.status !== "kontaktiert" || !cust.last_contact) return false;
  const last = new Date(cust.last_contact);
  const limit = new Date(last);
  limit.setMonth(limit.getMonth() + (periodMonths || 3));
  return new Date() < limit;
}

export function effectiveColor(cust: Customer, periodMonths: number): "green" | "red" {
  return isContactedActive(cust, periodMonths) ? "green" : "red";
}

export function telHref(phone: string | null | undefined): string {
  return (phone || "").replace(/[^\d+]/g, "");
}

export function getPhoneNumbers(cust: Customer): { label: string; number: string }[] {
  const nums: { label: string; number: string }[] = [];
  if (cust.phone_mobile) nums.push({ label: "Mobil", number: cust.phone_mobile });
  if (cust.phone_landline) nums.push({ label: "Festnetz", number: cust.phone_landline });
  return nums;
}

// Navigations-Links zu einem Kunden: bevorzugt die geokodierte Position (lat/lng), falls
// vorhanden, sonst die Adresse als Text – jeweils als fertige "Route dorthin"-Links für Google
// Maps und Apple Karten, die sich auf dem Smartphone direkt in der jeweiligen App öffnen.
export function navigationUrls(cust: Customer): { google: string; apple: string } {
  const hasCoords = cust.lat != null && cust.lng != null;
  const dest = hasCoords ? `${cust.lat},${cust.lng}` : cust.address;
  const q = encodeURIComponent(dest);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: hasCoords
      ? `https://maps.apple.com/?daddr=${q}&dirflg=d`
      : `https://maps.apple.com/?daddr=${q}`,
  };
}

// ---------------------------------------------------------------- Artikelstammdaten
// Standard-MwSt.-Satz (Deutschland), Vorbelegung im Preis-Formular und Fallback, wenn einem
// Artikel noch kein Preis hinterlegt ist – zentral hier statt an zwei Stellen in
// app/page.tsx als literale Zahl (siehe docs/konstanten-register.md).
export const DEFAULT_VAT_RATE = 19;

// Standardtitel eines Termins. Bis dahin hießen alle Termine schlicht "Termin", was in einer
// Liste nichts unterscheidet – mit dem Kundennamen ist auf einen Blick klar, worum es geht.
// Bewusst nur eine Vorbelegung: wer einen sprechenderen Titel will, überschreibt ihn.
export function terminTitel(kundenName: string | null | undefined): string {
  const name = (kundenName || "").trim();
  return name ? `Termin – ${name}` : "Termin";
}

export function formatEUR(amount: number): string {
  return amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

// Der zu einem Stichtag (Standard: heute) gültige Preis-Eintrag eines Artikels – der jüngste
// Eintrag, dessen Gültigkeitszeitraum den Stichtag einschließt (valid_to = null heißt
// "bis auf Weiteres"). Gibt es keinen passenden Eintrag (z. B. noch kein Preis hinterlegt),
// wird null zurückgegeben statt eines Fantasiepreises.
export function currentArticlePrice(prices: ArticlePrice[], onDate?: string): ArticlePrice | null {
  const day = onDate || todayStr();
  const candidates = prices
    .filter((p) => p.valid_from <= day && (!p.valid_to || p.valid_to >= day))
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  return candidates[0] || null;
}

// Netto-, MwSt.- und Brutto-Summe der einem Auftrag zugeordneten Artikel-Positionen, jeweils
// unter Berücksichtigung von Menge und individuellem Rabatt je Position.
export function orderArticleTotals(rows: OrderArticle[]): { net: number; vat: number; gross: number } {
  let net = 0, vat = 0;
  rows.forEach((r) => {
    const lineNet = r.quantity * r.net_price * (1 - (r.discount_percent || 0) / 100);
    net += lineNet;
    vat += lineNet * (r.vat_rate / 100);
  });
  return { net, vat, gross: net + vat };
}

// Region, die an eine Adresse ohne erkennbaren Stadtnamen angehängt wird, damit die
// kostenlose Nominatim/OpenStreetMap-Geokodierung eindeutige Treffer liefert – zentral hier
// benannt statt als literaler String in der Funktion (siehe docs/konstanten-register.md).
// Wächst das Geschäft über die Region hinaus, hier anpassen (perspektivisch: Einstellung
// statt Code-Konstante, siehe docs/roadmap.md).
export const DEFAULT_GEOCODE_REGION = "Nürnberg, Deutschland";

// Vergleich ohne Umlaute, damit "Nürnberg" und "Nuernberg" gleich behandelt werden – und
// damit der Stadtname NICHT ein zweites Mal als Literal im Code steht, sondern aus
// DEFAULT_GEOCODE_REGION abgeleitet wird (Konstanten-Regel, siehe docs/README.md).
function ohneUmlaute(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

// Geokodierung läuft seit Roadmap-Phase 8 über die eigene Serverroute /api/geocode statt
// direkt aus dem Browser gegen Nominatim: dort sitzen Zugriffsschutz, Drosselung, ein
// identifizierender User-Agent und ein Cache (Review-Befund A9). Signatur und Verhalten
// bleiben für die Aufrufer unverändert – null bedeutet weiterhin "keine Position gefunden",
// eine Ausnahme bedeutet "Dienst nicht erreichbar".
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const stadt = DEFAULT_GEOCODE_REGION.split(",")[0].trim();
  const query = ohneUmlaute(address).includes(ohneUmlaute(stadt))
    ? address
    : address + ", " + DEFAULT_GEOCODE_REGION;

  const resp = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error("Geocoding fehlgeschlagen");
  const data = await resp.json();
  if (data == null || data.lat == null || data.lng == null) return null;
  return { lat: data.lat as number, lng: data.lng as number };
}
