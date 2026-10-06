import type { RadPosition, TireStorage } from "@/lib/types";
import { RAD_NOTIZ_SPALTE, RAD_POSITIONEN } from "@/lib/constants";

// Notizen am eingelagerten Satz (Migration 71, v115): eine zum ganzen Satz (`note`) und eine je
// Rad (`notiz_vl` … `notiz_hr`). Anlass: In einem Reifen steckte beim Einlagern eine Schraube –
// das soll am Reifen stehen und ein halbes Jahr später noch zu lesen sein.
//
// Die Notiz je Rad hängt am SATZ, nicht an einem gemessenen Rad: Sie geht auch bei „ein Wert für
// den Satz“ und bleibt, wenn jemand zwischen den Messarten umschaltet.

export type SatzNotizFeld = "note" | (typeof RAD_NOTIZ_SPALTE)[RadPosition];
export type SatzNotizen = Partial<Record<SatzNotizFeld, string | null>>;

// Welche Räder gehören zu diesem Satz? `anzahl_raeder` gilt auch bei Sammelmessung – es gehört
// zum Reifensatz, nicht zur Messart. (Dieselbe Regel wie auf dem Satz-Etikett.)
export function satzPositionen(satz: Pick<TireStorage, "anzahl_raeder">): RadPosition[] {
  return RAD_POSITIONEN.slice(0, Math.min(Math.max(satz.anzahl_raeder || 4, 1), RAD_POSITIONEN.length));
}

function rein(t: string | null | undefined): string | null {
  const s = (t ?? "").trim();
  return s ? s : null;
}

// Die Notizen je Rad, in der Reihenfolge des Radbilds; leere fehlen.
export function radNotizen(satz: Pick<TireStorage, "notiz_vl" | "notiz_vr" | "notiz_hl" | "notiz_hr">): { position: RadPosition; text: string }[] {
  return RAD_POSITIONEN
    .map((position) => ({ position, text: rein(satz[RAD_NOTIZ_SPALTE[position]]) }))
    .filter((n): n is { position: RadPosition; text: string } => n.text !== null);
}

export function radNotiz(satz: Pick<TireStorage, "notiz_vl" | "notiz_vr" | "notiz_hl" | "notiz_hr">, position: RadPosition): string | null {
  return rein(satz[RAD_NOTIZ_SPALTE[position]]);
}

export function hatNotizen(satz: Pick<TireStorage, "note" | "notiz_vl" | "notiz_vr" | "notiz_hl" | "notiz_hr">): boolean {
  return rein(satz.note) !== null || radNotizen(satz).length > 0;
}

// Alles in einer Zeile, z. B. für die Lagersuche, das Etikett oder den Verkauf:
// „VR: Schraube in der Lauffläche · HL: Flanke · Kunde will Rückruf“.
export function notizenText(satz: Pick<TireStorage, "note" | "notiz_vl" | "notiz_vr" | "notiz_hl" | "notiz_hr">, mitSatz = true): string {
  return [
    ...radNotizen(satz).map((n) => `${n.position}: ${n.text}`),
    mitSatz ? rein(satz.note) : null,
  ].filter(Boolean).join(" · ");
}

// Die Felder, die sich zwischen zwei Fassungen unterscheiden – leer und null gelten als gleich.
// Ergibt null, wenn nichts zu speichern ist.
export function notizAenderungen(vorher: SatzNotizen, nachher: SatzNotizen): SatzNotizen | null {
  const aus: SatzNotizen = {};
  for (const k of Object.keys(nachher) as SatzNotizFeld[]) {
    const n = rein(nachher[k]);
    if (n !== rein(vorher[k])) aus[k] = n;
  }
  return Object.keys(aus).length ? aus : null;
}
