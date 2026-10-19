// Kundengruppen (Migration 101, v165): ein Hauptkunde mit Unterdebitoren – genau eine Ebene. Der Auftrag darf auf
// den Hauptkunden laufen, die Fahrzeuge gehören den Unterdebitoren; Etikett und Einlagerung folgen dem Halter des
// Fahrzeugs, die Rechnung je Unterdebitor kommt in Runde 2. Die Regeln selbst stehen in der Datenbank
// (`kunde_gruppe_pruefen()`); hier nur, was die Oberfläche zum Anzeigen und Anbieten braucht.
// Geprüft in tests/kundengruppe.test.ts.

import type { Customer } from "./types";

type K = Pick<Customer, "id" | "name" | "company" | "haupt_kunde_id" | "deleted_at" | "laufkundschaft" | "einmalkunde" | "testkunde"> & { active?: boolean; address?: string };

// Die Gruppe eines Kunden = sein Hauptkunde, sonst er selbst (wie `kunde_gruppe()` in Migration 101).
export function gruppeVon(kundeId: string | null | undefined, kunden: Pick<Customer, "id" | "haupt_kunde_id">[]): string | null {
  if (!kundeId) return null;
  return kunden.find((k) => k.id === kundeId)?.haupt_kunde_id ?? kundeId;
}

export function unterdebitoren<T extends K>(hauptId: string, kunden: T[]): T[] {
  return kunden.filter((k) => k.haupt_kunde_id === hauptId && !k.deleted_at)
    .sort((a, b) => kundenName(a).localeCompare(kundenName(b), "de"));
}

// Alle Mitglieder der Gruppe dieses Kunden, der Hauptkunde zuerst. Ohne Gruppe: nur er selbst.
export function gruppenMitglieder<T extends K>(kundeId: string | null | undefined, kunden: T[]): T[] {
  const haupt = gruppeVon(kundeId, kunden);
  if (!haupt) return [];
  const h = kunden.find((k) => k.id === haupt);
  return [...(h ? [h] : []), ...unterdebitoren(haupt, kunden)];
}

export function istHauptkunde(kundeId: string, kunden: K[]): boolean {
  return kunden.some((k) => k.haupt_kunde_id === kundeId && !k.deleted_at);
}

export function kundenName(k: Pick<Customer, "name" | "company">): string {
  return (k.company || "").trim() || k.name;
}

// Eine Zeile zur Einordnung in Listen und Suchtreffern – oder null ohne Gruppe.
export function gruppenText(k: K, kunden: K[]): string | null {
  if (k.haupt_kunde_id) {
    const h = kunden.find((x) => x.id === k.haupt_kunde_id);
    return h ? `Unterdebitor von ${kundenName(h)}` : "Unterdebitor";
  }
  const n = unterdebitoren(k.id, kunden).length;
  return n ? `Hauptkunde · ${n} ${n === 1 ? "Unterdebitor" : "Unterdebitoren"}` : null;
}

// Wer als Hauptkunde für `kunde` in Frage kommt – wie `kunde_gruppe_pruefen()`: nicht er selbst, kein Unterdebitor,
// keine Laufkundschaft / kein Einmalkunde, Testkunde nur zu Testkunde. Hat `kunde` selbst Unterdebitoren, niemand.
export function hauptkundeKandidaten<T extends K>(kunde: K, kunden: T[]): T[] {
  if (kunde.laufkundschaft || kunde.einmalkunde || istHauptkunde(kunde.id, kunden)) return [];
  return kunden.filter((k) => k.id !== kunde.id && !k.deleted_at && k.active !== false && !k.haupt_kunde_id
    && !k.laufkundschaft && !k.einmalkunde && !!k.testkunde === !!kunde.testkunde);
}

// Die Gegenrichtung (v166): Wer unter `haupt` als Unterdebitor passt – dieselben Regeln wie oben. Ist `haupt` selbst
// Unterdebitor, Laufkundschaft oder Einmalkunde, niemand.
export function unterdebitorKandidaten<T extends K>(haupt: K, kunden: T[]): T[] {
  if (haupt.haupt_kunde_id || haupt.laufkundschaft || haupt.einmalkunde || haupt.deleted_at) return [];
  return kunden.filter((k) => k.id !== haupt.id && !k.deleted_at && k.active !== false && !k.haupt_kunde_id
    && !k.laufkundschaft && !k.einmalkunde && !!k.testkunde === !!haupt.testkunde && !istHauptkunde(k.id, kunden));
}

// Anschrift zum Vergleichen: klein, ohne Satzzeichen und doppelte Leerzeichen, „Str." = „Straße“.
export function adresseVergleich(a: string | null | undefined): string {
  return (a || "").toLowerCase().replace(/stra(ss|ß)e\b/g, "str").replace(/[.,;]/g, " ").replace(/\s+/g, " ").trim();
}

// Andere Kunden unter derselben Anschrift – Vorschlag für eine Kundengruppe (drei Firmen, ein Haus).
export function gleicheAnschrift<T extends K>(kunde: K, kunden: T[]): T[] {
  const a = adresseVergleich(kunde.address);
  if (!a) return [];
  return kunden.filter((k) => k.id !== kunde.id && !k.deleted_at && k.active !== false && adresseVergleich(k.address) === a);
}
