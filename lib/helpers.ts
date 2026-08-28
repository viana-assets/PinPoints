import type { Appointment, ArticlePrice, Customer, Order, OrderArticle } from "./types";

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE");
}

export function formatApptDateTime(a: Appointment): string {
  return formatDate(a.date) + (a.time ? `, ${a.time} Uhr` : "");
}

export function apptDateTime(a: Appointment): Date {
  return new Date(a.date + "T" + (a.time || "23:59") + ":00");
}

export function isApptPast(a: Appointment): boolean {
  return apptDateTime(a).getTime() < Date.now();
}

export function nextAppointment(appointments: Appointment[]): Appointment | null {
  const list = appointments
    .filter((a) => a.date && !isApptPast(a))
    .slice()
    .sort((a, b) => apptDateTime(a).getTime() - apptDateTime(b).getTime());
  return list[0] || null;
}

// Termine und Aufträge sind seit dem ERP-Umbau ein Modul: ein "Termin" ist einfach
// ein Auftrag mit Datum/Uhrzeit. Diese Helfer arbeiten auf `orders` genauso, wie die
// obigen früher auf `appointments` gearbeitet haben.
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

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const q =
    address.toLowerCase().includes("nürnberg") || address.toLowerCase().includes("nuernberg")
      ? address
      : address + ", Nürnberg, Deutschland";
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q);
  const resp = await fetch(url, { headers: { "Accept-Language": "de" } });
  if (!resp.ok) throw new Error("Geocoding fehlgeschlagen");
  const data = await resp.json();
  if (!data || !data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}
