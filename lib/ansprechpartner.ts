// Ansprechpartner je Kunde und Wechselort am Auftrag (Migration 117, v189, docs/kunden-und-karte.md „Ansprechpartner
// und Wechselort“). Hier die Regeln ohne React: Anzeige, Ansprechpartner einer Gruppe, wo ein Auftrag stattfindet,
// Vorschlag aus den Fahrzeugen, die Nadeln der Karte. Die Datenbank prüft dasselbe (`auftrag_wechselort()`,
// `fahrzeug_ansprechpartner_pruefen()`); geprüft in tests/ansprechpartner.test.ts.

import type { Ansprechpartner, Customer, GeoGenauigkeit, Order, Vehicle } from "./types";
import { effectiveColor, type KundenZustand } from "./helpers";
import { gruppenMitglieder, kundenName } from "./kundengruppe";

export function apAnzeige(a: Pick<Ansprechpartner, "anrede" | "name">): string {
  return `${a.anrede ? a.anrede + " " : ""}${a.name}`.trim();
}

const reihe = (a: Ansprechpartner, b: Ansprechpartner) => a.sortierung - b.sortierung || a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id);

export function apsVonKunde(kundeId: string, aps: readonly Ansprechpartner[]): Ansprechpartner[] {
  return aps.filter((a) => a.customer_id === kundeId).sort(reihe);
}

export function hatEigeneAdresse(a: Pick<Ansprechpartner, "address">): boolean {
  return !!(a.address ?? "").trim();
}

// Alle Ansprechpartner der Gruppe dieses Kunden (Hauptkunde zuerst), je mit dem Kunden, unter dem sie stehen – für die
// Wahl des Wechselorts und die Zuordnung eines Fahrzeugs. Ohne Gruppe: nur die eigenen.
export function apsDerGruppe<K extends Customer>(kundeId: string | null | undefined, kunden: K[], aps: readonly Ansprechpartner[]): { ap: Ansprechpartner; kunde: K }[] {
  if (!kundeId) return [];
  const mitglieder = gruppenMitglieder(kundeId, kunden);
  const liste = mitglieder.length ? mitglieder : kunden.filter((k) => k.id === kundeId);
  return liste.flatMap((k) => apsVonKunde(k.id, aps).map((ap) => ({ ap, kunde: k })));
}

// ---------------------------------------------------------------- Wechselort
export type EinsatzOrt = { address: string; lat: number | null; lng: number | null; geo_genauigkeit: GeoGenauigkeit | null };
type MitOrt = Pick<Order, "wechselort" | "einsatz_adresse" | "einsatz_lat" | "einsatz_lng" | "einsatz_geo_genauigkeit">;

// Wo der Auftrag stattfindet, wenn nicht beim Kunden – sonst null (dann gilt die Adresse des Kunden).
export function abweichenderOrt(o: Partial<MitOrt>): EinsatzOrt | null {
  const adresse = (o.einsatz_adresse ?? "").trim();
  if (!o.wechselort || !adresse) return null;
  return { address: adresse, lat: o.einsatz_lat ?? null, lng: o.einsatz_lng ?? null, geo_genauigkeit: o.einsatz_geo_genauigkeit ?? null };
}

// Was das Auftragsfenster speichert. Beim Ansprechpartner zählt nur die Wahl – Adresse und Koordinaten kopiert die
// Datenbank selbst (`auftrag_wechselort()`), was die App dazu mitschickt, überschreibt sie.
export type WechselortEingabe = {
  art: Order["wechselort"] | null;
  ansprechpartnerId: string | null;
  name: string;
  adresse: string;
  lat: number | null;
  lng: number | null;
  geo: GeoGenauigkeit | null;
};
export function wechselortSpalten(e: WechselortEingabe): Pick<Order, "wechselort" | "ansprechpartner_id" | "einsatz_name" | "einsatz_adresse"
  | "einsatz_lat" | "einsatz_lng" | "einsatz_geo_genauigkeit"> {
  if (e.art === "einmalig") {
    return { wechselort: "einmalig", ansprechpartner_id: null, einsatz_name: e.name.trim() || null, einsatz_adresse: e.adresse.trim(),
      einsatz_lat: e.lat, einsatz_lng: e.lng, einsatz_geo_genauigkeit: e.geo };
  }
  if (e.art === "ansprechpartner") {
    return { wechselort: "ansprechpartner", ansprechpartner_id: e.ansprechpartnerId, einsatz_name: null, einsatz_adresse: null,
      einsatz_lat: null, einsatz_lng: null, einsatz_geo_genauigkeit: null };
  }
  return { wechselort: null, ansprechpartner_id: null, einsatz_name: null, einsatz_adresse: null, einsatz_lat: null, einsatz_lng: null,
    einsatz_geo_genauigkeit: null };
}
export function wechselortAusAuftrag(o: Partial<Pick<Order, "wechselort" | "ansprechpartner_id" | "einsatz_name" | "einsatz_adresse" | "einsatz_lat"
  | "einsatz_lng" | "einsatz_geo_genauigkeit">>): WechselortEingabe {
  return { art: o.wechselort ?? null, ansprechpartnerId: o.ansprechpartner_id ?? null, name: o.einsatz_name ?? "", adresse: o.einsatz_adresse ?? "",
    lat: o.einsatz_lat ?? null, lng: o.einsatz_lng ?? null, geo: o.einsatz_geo_genauigkeit ?? null };
}
export function wechselortGleich(a: WechselortEingabe, b: WechselortEingabe): boolean {
  if (a.art !== b.art) return false;
  if (a.art === "ansprechpartner") return a.ansprechpartnerId === b.ansprechpartnerId;
  if (a.art === "einmalig") return a.name.trim() === b.name.trim() && a.adresse.trim() === b.adresse.trim() && a.lat === b.lat && a.lng === b.lng;
  return true;
}
export function wechselortMangel(e: WechselortEingabe): string | null {
  if (e.art === "ansprechpartner" && !e.ansprechpartnerId) return "Den Ansprechpartner wählen.";
  if (e.art === "einmalig" && !e.adresse.trim()) return "Die Adresse für diesen Termin eintragen.";
  return null;
}

// Eine Zeile für Auftragsfenster, Liste und Termin: „bei Herr Max Muster · Nordring 5, Nürnberg“.
export function wechselortText(o: Partial<Pick<Order, "wechselort" | "einsatz_name" | "einsatz_adresse">>): string | null {
  const adresse = (o.einsatz_adresse ?? "").trim();
  if (!o.wechselort || !adresse) return null;
  const bei = (o.einsatz_name ?? "").trim();
  return bei ? `bei ${bei} · ${adresse}` : adresse;
}

// Der Ansprechpartner, bei dem die Fahrzeuge dieses Auftrags stehen – nur wenn es genau einer ist und er eine Adresse
// hat. Fahrzeuge ohne Zuordnung zählen nicht mit (die stehen beim Kunden oder sind egal).
export function wechselortVorschlag(fahrzeugIds: readonly string[], fahrzeuge: readonly Pick<Vehicle, "id" | "ansprechpartner_id">[],
  aps: readonly Ansprechpartner[]): Ansprechpartner | null {
  const ids = new Set(fahrzeuge.filter((f) => fahrzeugIds.includes(f.id) && f.ansprechpartner_id).map((f) => f.ansprechpartner_id as string));
  if (ids.size !== 1) return null;
  const ap = aps.find((a) => a.id === [...ids][0]);
  return ap && hatEigeneAdresse(ap) ? ap : null;
}

// ---------------------------------------------------------------- Suche
// Die Namen der Ansprechpartner je Kunde – damit „Muster“ in der Kundensuche auch die Firma findet.
export function apSuchtexte(aps: readonly Ansprechpartner[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of aps) m.set(a.customer_id, `${m.get(a.customer_id) ?? ""} ${a.name} ${a.telefon ?? ""} ${a.email ?? ""}`);
  return m;
}

// ---------------------------------------------------------------- Formular
export type ApEntwurf = Pick<Ansprechpartner, "anrede" | "name" | "funktion" | "telefon" | "email" | "address" | "auf_karte" | "notiz">;
export function apMaengel(e: ApEntwurf): string | null {
  if (!e.name.trim()) return "Den Namen eintragen.";
  if (e.auf_karte && !(e.address ?? "").trim()) return "Für eine Nadel auf der Karte braucht der Ansprechpartner eine Adresse.";
  return null;
}

// ---------------------------------------------------------------- Karte
// Eine Nadel: an der Adresse des Kunden, eines Ansprechpartners (mit „Auf der Karte“) oder eines Termins woanders.
// Der Zustand ist immer der des Kunden – Anrufstatus und Wiedervorlage führt der Kunde –, außer es steht an genau
// diesem Ort ein Termin an (dann „termin“).
export type KartenNadel = {
  key: string;
  kunde: Customer;
  lat: number;
  lng: number;
  geo: GeoGenauigkeit | null;
  titel: string;
  adresse: string;
  zustand: KundenZustand;
  // Die anstehenden Aufträge an diesem Ort (für das Terminschild).
  termine: Order[];
};

const steht = (o: Pick<Order, "status" | "order_date" | "deleted_at">, heute: string) =>
  !o.deleted_at && (o.status === "offen" || o.status === "in_arbeit") && !!o.order_date && o.order_date >= heute;

export function kartenNadeln(kunden: readonly Customer[], aps: readonly Ansprechpartner[], auftraege: readonly Order[],
  periodMonths: number, heute: string): KartenNadel[] {
  const kundeVon = new Map(kunden.map((k) => [k.id, k]));
  const apVon = new Map(aps.map((a) => [a.id, a]));
  const amKunden = new Map<string, Order[]>();
  const beiAp = new Map<string, Order[]>();
  const anderswo: Order[] = [];
  for (const o of auftraege) {
    if (!steht(o, heute)) continue;
    if (!o.wechselort) { amKunden.set(o.customer_id, [...(amKunden.get(o.customer_id) ?? []), o]); continue; }
    const ap = o.wechselort === "ansprechpartner" && o.ansprechpartner_id ? apVon.get(o.ansprechpartner_id) : undefined;
    if (ap && ap.auf_karte && ap.lat != null && ap.lng != null) beiAp.set(ap.id, [...(beiAp.get(ap.id) ?? []), o]);
    else anderswo.push(o);
  }
  const zustand = (k: Customer, termin: boolean) => effectiveColor(k, periodMonths, heute, termin);
  const nadeln: KartenNadel[] = [];
  for (const k of kunden) {
    if (k.active === false || k.lat == null || k.lng == null) continue;
    const termine = amKunden.get(k.id) ?? [];
    // Von der Karte genommen: nur solange hier ein Termin ansteht.
    if (k.auf_karte === false && !termine.length) continue;
    nadeln.push({ key: k.id, kunde: k, lat: k.lat, lng: k.lng, geo: k.geo_genauigkeit, titel: kundenName(k), adresse: k.address,
      zustand: zustand(k, termine.length > 0), termine });
  }
  for (const a of aps) {
    const k = kundeVon.get(a.customer_id);
    if (!k || k.active === false || !a.auf_karte || a.lat == null || a.lng == null) continue;
    const termine = beiAp.get(a.id) ?? [];
    nadeln.push({ key: `ap:${a.id}`, kunde: k, lat: a.lat, lng: a.lng, geo: a.geo_genauigkeit, titel: `${kundenName(k)} · ${apAnzeige(a)}`,
      adresse: a.address ?? "", zustand: zustand(k, termine.length > 0), termine });
  }
  for (const o of anderswo) {
    const k = kundeVon.get(o.customer_id);
    if (!k || k.active === false || o.einsatz_lat == null || o.einsatz_lng == null) continue;
    nadeln.push({ key: `auftrag:${o.id}`, kunde: k, lat: o.einsatz_lat, lng: o.einsatz_lng, geo: o.einsatz_geo_genauigkeit ?? null,
      titel: `${kundenName(k)}${o.einsatz_name ? ` · ${o.einsatz_name}` : ""}`, adresse: o.einsatz_adresse ?? "", zustand: "termin", termine: [o] });
  }
  return nadeln;
}
