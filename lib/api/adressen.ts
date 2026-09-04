import type { Adressvorschlag } from "@/app/api/adresse-suchen/route";

// Zugriff auf die Vorschlagsroute. Reine Wrapper ohne React-Zustand – gleiches Muster wie
// lib/api/*, siehe docs/architektur.md.
//
// Der Typ kommt aus der Route selbst und wird hier nicht ein zweites Mal beschrieben: eine
// Kopie würde beim nächsten Feld auseinanderlaufen, und der Import kostet zur Laufzeit nichts
// (TypeScript entfernt reine Typimporte).
export type { Adressvorschlag };

export async function sucheAdressen(anfrage: string, signal?: AbortSignal): Promise<Adressvorschlag[]> {
  const resp = await fetch("/api/adresse-suchen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: anfrage }),
    signal,
  });
  if (!resp.ok) throw new Error("Adresssuche fehlgeschlagen");
  const daten = await resp.json();
  return Array.isArray(daten?.treffer) ? (daten.treffer as Adressvorschlag[]) : [];
}
