// Offline schreiben – der Ausgangskorb (F1, PWA-Stufe 4, 02.10.2026). Die reinen Regeln.
//
// WARUM ABSICHTEN UND KEINE ZEILEN (Projektkonzept „Offline schreiben", Baustein 2)
//
// Eine Änderung ohne Netz wird als ABSICHT gemerkt: „setze die Notiz von Auftrag X auf …,
// vorher stand dort …". Nicht als ganze Zeile. Eine Absicht lässt sich später gegen den
// aktuellen Serverstand ausführen und rührt nur die Felder an, die wirklich geändert wurden; eine
// ganze Zeile überschriebe alles, was das Büro in der Zwischenzeit getan hat.
//
// DREI AUSGÄNGE BEIM SENDEN (Baustein 5)
//
//   * Am Server hat sich das Feld nicht geändert (oder schon auf denselben Wert) → übernehmen.
//   * Jemand hat DASSELBE Feld anders geändert → KONFLIKT: beide Fassungen zeigen, ein Mensch
//     entscheidet. Nie stillschweigend gewinnen lassen.
//   * Der Auftrag ist inzwischen abgeschlossen oder storniert, oder die Datenbank lehnt ab →
//     NICHT ÜBERNOMMEN, mit dem Grund im Klartext.
//
// WAS OFFLINE GEHT (Bauvorgabe im Konzept, Tabelle „Was offline gehen SOLL"): am Auftrag Titel,
// Beschreibung, Termin (Tag, von, bis), „Rechnung benötigt", Technikernotiz, Leistungen
// (eintragen, Menge, Endpreis, Text, entfernen) und die Radmessung. NICHT offline: abschließen,
// stornieren, Status, Mitarbeiter, ein- und auslagern, Kunden, Stammdaten.
//
// Alles hier sind reine Funktionen – geprüft in tests/offlineAusgang.test.ts. Gespeichert wird
// in lib/offline/speicher.ts, gesendet in lib/offline/senden.ts.

import type { EingelagertesRad, Order, OrderArticle, RadPosition, TireStorage } from "@/lib/types";
import type { Auftragsdaten } from "@/lib/api/orders";

// Die Felder am Auftrag, die offline geändert werden dürfen.
export const AUFTRAG_OFFLINE_FELDER = [
  "title", "description", "order_date", "time", "end_time", "rechnung_noetig", "techniker_notiz",
  "laufkunde_name", "laufkunde_telefon", "laufkunde_ort",
] as const;
export type AuftragFeld = (typeof AUFTRAG_OFFLINE_FELDER)[number];

export const POSITION_OFFLINE_FELDER = ["quantity", "endpreis_netto", "note", "deleted_at"] as const;
export type PositionFeld = (typeof POSITION_OFFLINE_FELDER)[number];

export const RAD_OFFLINE_FELDER = ["reifengroesse", "dot_date", "profiltiefe_mm", "felge", "sensor", "bemerkung"] as const;
export type RadFeld = (typeof RAD_OFFLINE_FELDER)[number];

type Werte<K extends string> = Partial<Record<K, unknown>>;

export type AbsichtInhalt =
  | { art: "auftrag"; auftragId: string; felder: Werte<AuftragFeld>; basis: Werte<AuftragFeld> }
  | { art: "position_neu"; auftragId: string; zeile: Omit<OrderArticle, "created_at" | "deleted_at"> }
  | { art: "position"; auftragId: string; positionId: string; felder: Werte<PositionFeld>; basis: Werte<PositionFeld> }
  | {
      art: "rad"; satzId: string; position: RadPosition;
      // Das Rad, wie es auf dem Gerät vorher aussah – null, wenn es noch nicht gemessen war.
      radId: string | null; felder: Werte<RadFeld>; basis: Werte<RadFeld> | null;
      // Der Satz stand noch auf „ein Wert für den Satz": vor dem Rad auf „je Rad" umstellen.
      umstellen: boolean;
    };

export type AbsichtZustand = "wartet" | "konflikt" | "abgelehnt";

export type Absicht = AbsichtInhalt & {
  id: string;
  // Wann es auf dem Gerät geschah – nicht, wann es übertragen wurde (Baustein 4).
  erstellt: string;
  // Für Menschen: „Auftrag 1234 · Notiz". Bewusst ohne Kundennamen.
  titel: string;
  zustand: AbsichtZustand;
  // Bei „abgelehnt" der Grund; bei „konflikt" die Felder mit beiden Fassungen.
  grund?: string;
  konflikt?: { feld: string; meine: unknown; server: unknown }[];
};

// ---------------------------------------------------------------- Vergleichen

// Zwei Werte als „gleich" im Sinn des Auftrags: leer ist leer (null, "", undefined), Uhrzeiten
// werden auf HH:MM verglichen (die Datenbank liefert „10:00:00", die Oberfläche schreibt
// „10:00"), Zahlen als Zahlen.
export function gleich(a: unknown, b: unknown): boolean {
  const leer = (x: unknown) => x === null || x === undefined || x === "";
  if (leer(a) && leer(b)) return true;
  if (leer(a) || leer(b)) return false;
  if (typeof a === "string" && typeof b === "string") {
    const uhr = /^\d{2}:\d{2}(:\d{2})?$/;
    if (uhr.test(a) && uhr.test(b)) return a.slice(0, 5) === b.slice(0, 5);
    return a === b;
  }
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return a === b;
}

// Welche Felder sind ein echter Konflikt? Am Server anders als beim Bearbeiten (jemand hat es
// geändert) UND anders als die eigene neue Fassung (sonst haben beide dasselbe gewollt).
export function konfliktFelder(
  felder: Record<string, unknown>,
  basis: Record<string, unknown>,
  server: Record<string, unknown>
): { feld: string; meine: unknown; server: unknown }[] {
  return Object.keys(felder)
    .filter((k) => !gleich(server[k], basis[k]) && !gleich(server[k], felder[k]))
    .map((feld) => ({ feld, meine: felder[feld], server: server[feld] }));
}

// Nur die geänderten Felder, samt ihrem Wert vorher. Ein Speichern ohne Änderung erzeugt keine
// Absicht – sonst stünde „1 Änderung wartet" da, wo es nichts zu übertragen gibt.
export function aenderungen<K extends string>(
  vorher: Partial<Record<K, unknown>>,
  nachher: Partial<Record<K, unknown>>,
  erlaubt: readonly K[]
): { felder: Werte<K>; basis: Werte<K> } | null {
  const felder: Werte<K> = {};
  const basis: Werte<K> = {};
  for (const k of erlaubt) {
    if (!(k in nachher)) continue;
    if (gleich(vorher[k], nachher[k])) continue;
    felder[k] = nachher[k];
    basis[k] = vorher[k] ?? null;
  }
  return Object.keys(felder).length > 0 ? { felder, basis } : null;
}

// Ist das ein Fehler, weil kein Netz da war – und nicht, weil die Datenbank abgelehnt hat?
// supabase-js meldet einen Netzabbruch als Fehlertext des Browsers: Chrome „Failed to fetch",
// Safari „Load failed", Firefox „NetworkError when attempting to fetch resource".
export function istNetzfehler(fehler: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const text = fehler instanceof Error ? fehler.message : typeof fehler === "string" ? fehler : "";
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|netzwerk/i.test(text);
}

// ---------------------------------------------------------------- Auf dem Gerät vorgreifen
//
// Die Änderung soll sofort zu sehen sein, so wie online (Baustein 3) – deshalb wird sie in den
// gespeicherten Bestand eingetragen, ohne dass der Server gefragt wurde. Dass sie noch nicht
// übertragen ist, sagt die Leiste „n Änderungen warten" (AusgangLeiste).

function auftragAnwenden(o: Order, a: Absicht): Order {
  if (a.art !== "auftrag" || o.id !== a.auftragId) return o;
  return { ...o, ...(a.felder as Partial<Order>) };
}

function positionenAnwenden(liste: OrderArticle[], a: Absicht): OrderArticle[] {
  if (a.art === "position_neu") {
    if (liste.some((p) => p.id === a.zeile.id)) return liste;
    return [...liste, { ...a.zeile, created_at: a.erstellt, deleted_at: null }];
  }
  if (a.art === "position") {
    const neu = liste.map((p) => (p.id === a.positionId ? { ...p, ...(a.felder as Partial<OrderArticle>) } : p));
    // Entfernt: aus der Liste nehmen, wie es das Laden auch täte (aufteilen() in lib/api/orders.ts).
    return neu.filter((p) => !p.deleted_at);
  }
  return liste;
}

// Auf einen Auftragsbestand (Zeitfenster oder Kundenhistorie) die wartenden Absichten legen.
// Eine neue Position kommt nur dorthin, wo ihr Auftrag auch steht.
export function auftragsdatenAnwenden(daten: Auftragsdaten, absichten: Absicht[]): Auftragsdaten {
  let { orders, orderArticles } = daten;
  for (const a of absichten) {
    if (a.zustand === "abgelehnt") continue;
    if (a.art === "auftrag") orders = orders.map((o) => auftragAnwenden(o, a));
    if (a.art === "position_neu" && !orders.some((o) => o.id === a.auftragId)) continue;
    if (a.art === "position_neu" || a.art === "position") orderArticles = positionenAnwenden(orderArticles, a);
  }
  return orders === daten.orders && orderArticles === daten.orderArticles ? daten : { ...daten, orders, orderArticles };
}

// Dasselbe für die gemessenen Räder. Ein offline neu gemessenes Rad bekommt eine vorläufige
// Kennung (`offline-…`); beim Senden legt der Server die echte an.
export function raederAnwenden(raeder: EingelagertesRad[], absichten: Absicht[]): EingelagertesRad[] {
  let liste = raeder;
  for (const a of absichten) {
    if (a.art !== "rad" || a.zustand === "abgelehnt") continue;
    const vorhanden = liste.find((r) => r.tire_storage_id === a.satzId && r.position === a.position);
    if (vorhanden) {
      liste = liste.map((r) => (r === vorhanden ? { ...r, ...(a.felder as Partial<EingelagertesRad>) } : r));
    } else {
      liste = [...liste, {
        id: `offline-${a.id}`, tire_storage_id: a.satzId, position: a.position,
        reifengroesse: null, dot_date: null, profiltiefe_mm: null, felge: null, sensor: false, bemerkung: null,
        created_at: a.erstellt, updated_at: a.erstellt,
        ...(a.felder as Partial<EingelagertesRad>),
      }];
    }
  }
  return liste;
}

// Ein Satz, der durch die erste Radmessung auf „je Rad" umgestellt wird, verliert dabei seinen
// Satzwert (Migration 33: nie beides) – auch in der Anzeige.
export function saetzeAnwenden(saetze: TireStorage[], absichten: Absicht[]): TireStorage[] {
  const umgestellt = new Set(absichten.filter((a) => a.art === "rad" && a.umstellen && a.zustand !== "abgelehnt").map((a) => (a as { satzId: string }).satzId));
  if (umgestellt.size === 0) return saetze;
  return saetze.map((s) => (umgestellt.has(s.id) && s.erfassungsart !== "einzeln" ? { ...s, erfassungsart: "einzeln", profiltiefe_mm: null } : s));
}

// ---------------------------------------------------------------- Zählen

export function ausgangStand(absichten: Absicht[]): { wartet: number; konflikt: number; abgelehnt: number } {
  return {
    wartet: absichten.filter((a) => a.zustand === "wartet").length,
    konflikt: absichten.filter((a) => a.zustand === "konflikt").length,
    abgelehnt: absichten.filter((a) => a.zustand === "abgelehnt").length,
  };
}

// Für Menschen lesbare Feldnamen in der Konfliktanzeige.
export const FELD_TEXT: Record<string, string> = {
  title: "Titel", description: "Beschreibung", order_date: "Datum", time: "Beginn", end_time: "Ende",
  rechnung_noetig: "Rechnung benötigt", techniker_notiz: "Notiz", laufkunde_name: "Name (Laufkunde)",
  laufkunde_telefon: "Telefon (Laufkunde)", laufkunde_ort: "Ort (Laufkunde)",
  quantity: "Menge", endpreis_netto: "Endpreis", note: "Text", deleted_at: "entfernt",
  reifengroesse: "Reifengröße", dot_date: "DOT", profiltiefe_mm: "Profiltiefe", felge: "Felge", sensor: "Sensor", bemerkung: "Bemerkung",
};

export function wertText(wert: unknown): string {
  if (wert === null || wert === undefined || wert === "") return "leer";
  if (typeof wert === "boolean") return wert ? "ja" : "nein";
  if (typeof wert === "number") return wert.toLocaleString("de-DE");
  return String(wert);
}

// ---------------------------------------------------------------- Zusammenlegen
//
// Wer offline dreimal an derselben Notiz tippt, erzeugt nicht drei Absichten, sondern eine: die
// neueste Fassung, aber mit der Basis von VOR der ersten Änderung. Sonst verglich die zweite
// Absicht beim Senden gegen einen Zwischenstand, den der Server nie gesehen hat.
//
// Gibt den neuen Korb zurück, oder null, wenn die Absicht neu angehängt werden muss.
export function zusammenlegen(korb: Absicht[], neu: AbsichtInhalt): Absicht[] | null {
  const passt = (a: Absicht) => a.zustand === "wartet" && (
    (neu.art === "auftrag" && a.art === "auftrag" && a.auftragId === neu.auftragId)
    || (neu.art === "position" && a.art === "position" && a.positionId === neu.positionId)
    || (neu.art === "rad" && a.art === "rad" && a.satzId === neu.satzId && a.position === neu.position)
  );
  // Eine offline angelegte Position, die gleich wieder geändert wird: in die Anlage einrechnen.
  if (neu.art === "position") {
    const anlage = korb.find((a) => a.art === "position_neu" && a.zustand === "wartet" && a.zeile.id === neu.positionId);
    if (anlage && anlage.art === "position_neu") {
      if (neu.felder.deleted_at) return korb.filter((a) => a !== anlage);
      return korb.map((a) => (a === anlage ? { ...anlage, zeile: { ...anlage.zeile, ...(neu.felder as Partial<OrderArticle>) } } : a));
    }
  }
  const alt = korb.find(passt);
  if (!alt) return null;
  return korb.map((a) => {
    if (a !== alt) return a;
    if (a.art === "auftrag" && neu.art === "auftrag") {
      return { ...a, felder: { ...a.felder, ...neu.felder }, basis: { ...neu.basis, ...a.basis } };
    }
    if (a.art === "position" && neu.art === "position") {
      return { ...a, felder: { ...a.felder, ...neu.felder }, basis: { ...neu.basis, ...a.basis } };
    }
    if (a.art === "rad" && neu.art === "rad") {
      return { ...a, felder: { ...a.felder, ...neu.felder }, basis: a.basis === null ? null : { ...(neu.basis ?? {}), ...a.basis }, umstellen: a.umstellen || neu.umstellen };
    }
    return a;
  });
}
