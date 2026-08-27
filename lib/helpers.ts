import type { Appointment, Customer } from "./types";

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
