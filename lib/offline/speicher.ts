"use client";

// Offline schreiben – wo der Ausgangskorb liegt (F1). Siehe lib/offline/ausgang.ts für die Regeln.
//
// In der IndexedDB des Geräts, neben dem gespeicherten Datenbestand (app/providers.tsx), aber
// unter eigenem Schlüssel: Der Datenbestand darf jederzeit verworfen und neu geladen werden, der
// Ausgangskorb nicht – darin stehen Eingaben, die es sonst nirgends gibt.
//
// Beim Abmelden wird er NICHT still geleert (handleLogout in app/page.tsx fragt nach, wenn noch
// etwas wartet): Eine Messung, die nur auf diesem Gerät steht, ginge sonst verloren.

import { useSyncExternalStore } from "react";
import { get, set, del } from "idb-keyval";
import { zusammenlegen, type Absicht, type AbsichtInhalt } from "./ausgang";

const SCHLUESSEL = "pinpoints-ausgang";

let stand: Absicht[] = [];
let geladen = false;
let ladeVersprechen: Promise<void> | null = null;
const hoerer = new Set<() => void>();

function melden() {
  hoerer.forEach((h) => h());
}

export function ausgangLaden(): Promise<void> {
  if (geladen) return Promise.resolve();
  if (!ladeVersprechen) {
    ladeVersprechen = get<Absicht[]>(SCHLUESSEL)
      .then((wert) => { stand = Array.isArray(wert) ? wert : []; })
      .catch(() => { stand = []; })
      .finally(() => { geladen = true; melden(); });
  }
  return ladeVersprechen;
}

async function schreiben(neu: Absicht[]) {
  stand = neu;
  melden();
  try {
    if (neu.length === 0) await del(SCHLUESSEL);
    else await set(SCHLUESSEL, neu);
  } catch {
    // Kein Speicher (privates Fenster, voll): Die Absicht bleibt im Arbeitsspeicher und geht
    // mit, solange die App offen ist. Mehr ist dann nicht zu machen.
  }
}

export function ausgangAlle(): Absicht[] {
  return stand;
}

// Neue Absicht ans Ende. Die Reihenfolge ist die der Entstehung – so wird auch gesendet.
export async function ausgangAufnehmen(inhalt: AbsichtInhalt, titel: string): Promise<void> {
  await ausgangLaden();
  const gemischt = zusammenlegen(stand, inhalt);
  if (gemischt) { await schreiben(gemischt); return; }
  const absicht: Absicht = {
    ...inhalt,
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()),
    erstellt: new Date().toISOString(),
    titel,
    zustand: "wartet",
  };
  await schreiben([...stand, absicht]);
}

export async function ausgangAendern(id: string, aenderung: Partial<Absicht>): Promise<void> {
  await schreiben(stand.map((a) => (a.id === id ? ({ ...a, ...aenderung } as Absicht) : a)));
}

export async function ausgangEntfernen(id: string): Promise<void> {
  await schreiben(stand.filter((a) => a.id !== id));
}

export async function ausgangLeeren(): Promise<void> {
  await schreiben([]);
}

function abonnieren(h: () => void) {
  hoerer.add(h);
  void ausgangLaden();
  return () => { hoerer.delete(h); };
}

const LEER: Absicht[] = [];

// Für die Oberfläche: der aktuelle Korb, neu gezeichnet bei jeder Änderung.
export function useAusgang(): Absicht[] {
  return useSyncExternalStore(abonnieren, () => stand, () => LEER);
}
