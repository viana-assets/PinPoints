import type { Order } from "./types";
import { KUNDEN_ZUSTAND_LABEL, type KundenZustand } from "./helpers";
import { addDays, toDateStr } from "./calendar";
import { WOCHENTAG_KURZ } from "./dashboard";
import type { TerminPhase } from "./terminAnsicht";

// Die Regeln hinter der neu gestalteten Karte (26.09.2026, Entwurf „W · Karte & Nadeln").
// Reine Funktionen, geprüft in tests/karte.test.ts. Gezeichnet wird in app/page.tsx – Leaflet
// verwaltet seine Elemente selbst, React kommt dort nicht hin.

// ---------------------------------------------------------------- Bündel
//
// Weit herausgezoomt liegen hunderte Nadeln übereinander, und keine davon ist mehr zu treffen.
// Bis zu dieser Zoomstufe werden nahe Nadeln deshalb zu einem Bündel zusammengefasst: ein Kreis
// mit der Anzahl, außen ein Ring, der zeigt, wie sich die Zustände darin verteilen – viel Rot
// heißt, dort ist viel anzurufen. Ab der nächsten Stufe (etwa ein Stadtteil) steht wieder jede
// Nadel einzeln. Entschieden am 26.09.2026.
export const BUENDEL_BIS_ZOOM = 13;

// Kantenlänge der Rasterzelle in Bildschirmpunkten. Alles, was in dieselbe Zelle fällt, wird ein
// Bündel. Die Zelle hängt am Pixelraster der Zoomstufe, nicht am Ausschnitt – beim Verschieben
// springen die Bündel deshalb nicht.
export const BUENDEL_ZELLE_PX = 80;

// Die Reihenfolge der Farben im Ring: dieselbe wie bei den Filterknöpfen, nach Dringlichkeit.
// Zustände, die nie auf der Karte stehen (Laufkundschaft, Einmalkunde ohne Termin), bekommen
// trotzdem eine Farbe – lieber grau als ein Loch im Ring.
export const BUENDEL_RING_FARBE: Record<KundenZustand, string> = {
  red: "var(--red)",
  wiedervorlage: "var(--blau-marker)",
  termin: "var(--navy)",
  green: "var(--green)",
  "kein-interesse": "var(--frei-linie)",
  laufkundschaft: "var(--muted)",
  einmalkunde: "var(--muted)",
};
const RING_REIHENFOLGE: KundenZustand[] = ["red", "wiedervorlage", "termin", "green", "kein-interesse", "laufkundschaft", "einmalkunde"];

export type KartenPunkt = { id: string; x: number; y: number; zustand: KundenZustand };
export type Buendel = {
  // Mittelpunkt der enthaltenen Punkte in Bildschirmpunkten der Zoomstufe.
  x: number; y: number;
  ids: string[];
  anteile: Partial<Record<KundenZustand, number>>;
};

// Fasst Punkte zusammen, die in dieselbe Rasterzelle fallen. Eine Zelle mit nur einem Punkt
// bleibt eine Nadel – ein Bündel „1" wäre ein Umweg ohne Gewinn.
export function buendeln(punkte: KartenPunkt[], zellePx: number = BUENDEL_ZELLE_PX): { einzeln: string[]; buendel: Buendel[] } {
  const zellen = new Map<string, KartenPunkt[]>();
  for (const p of punkte) {
    const schluessel = Math.floor(p.x / zellePx) + ":" + Math.floor(p.y / zellePx);
    const liste = zellen.get(schluessel);
    if (liste) liste.push(p);
    else zellen.set(schluessel, [p]);
  }
  const einzeln: string[] = [];
  const buendel: Buendel[] = [];
  for (const liste of zellen.values()) {
    if (liste.length === 1) { einzeln.push(liste[0].id); continue; }
    const anteile: Partial<Record<KundenZustand, number>> = {};
    let sx = 0, sy = 0;
    for (const p of liste) {
      sx += p.x; sy += p.y;
      anteile[p.zustand] = (anteile[p.zustand] ?? 0) + 1;
    }
    buendel.push({ x: sx / liste.length, y: sy / liste.length, ids: liste.map((p) => p.id), anteile });
  }
  return { einzeln, buendel };
}

// Durchmesser des Bündelkreises: vier Stufen, damit man „ein paar" von „sehr viele" unterscheidet,
// ohne dass ein großes Bündel die Nachbarn zudeckt.
export function buendelGroesse(anzahl: number): number {
  if (anzahl < 10) return 40;
  if (anzahl < 100) return 48;
  if (anzahl < 1000) return 56;
  return 64;
}

// Der Ring als CSS-Verlauf. Jeder vorkommende Zustand bekommt seinen Anteil am Kreis.
export function ringVerlauf(anteile: Partial<Record<KundenZustand, number>>): string {
  const summe = RING_REIHENFOLGE.reduce((s, z) => s + (anteile[z] ?? 0), 0);
  if (summe === 0) return "var(--frei-linie)";
  let bisher = 0;
  const teile: string[] = [];
  for (const z of RING_REIHENFOLGE) {
    const n = anteile[z] ?? 0;
    if (!n) continue;
    const von = (bisher / summe) * 360;
    bisher += n;
    const bis = (bisher / summe) * 360;
    teile.push(`${BUENDEL_RING_FARBE[z]} ${von.toFixed(1)}deg ${bis.toFixed(1)}deg`);
  }
  return `conic-gradient(${teile.join(", ")})`;
}

// „Offen", „Kein Interesse" – die Beschriftung aus KUNDEN_ZUSTAND_LABEL, groß am Anfang, weil
// sie auf der Karte allein auf einer Pille steht und nicht mitten im Satz.
export function zustandText(z: KundenZustand): string {
  const t = KUNDEN_ZUSTAND_LABEL[z];
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// „1.137" – Tausenderpunkt wie überall in der App.
export function zahlText(n: number): string {
  return n.toLocaleString("de-DE");
}

// Die Zeile unten auf der Karte: was man gerade vor sich hat.
export function ausschnittText(a: { nadeln: number; gebuendelt: number; buendel: number; ausgelassen: number }): string {
  const gesamt = a.nadeln + a.gebuendelt + a.ausgelassen;
  if (a.ausgelassen > 0) return `${zahlText(a.ausgelassen)} weitere Kunden in diesem Ausschnitt – zum Anzeigen näher heranzoomen`;
  if (gesamt === 0) return "Keine Kunden in diesem Ausschnitt";
  if (a.buendel > 0) {
    return `${zahlText(gesamt)} ${gesamt === 1 ? "Kunde" : "Kunden"} · ${zahlText(a.buendel)} Bündel – zum Heranzoomen antippen`;
  }
  return `${zahlText(gesamt)} ${gesamt === 1 ? "Kunde" : "Kunden"} in diesem Ausschnitt`;
}

// ---------------------------------------------------------------- Terminnadel
//
// Eine Nadel im Zustand „Termin" trägt ein kleines Schild: heute die Uhrzeit, morgen „morgen",
// sonst den Tag. So sieht man auf der Karte, wo man heute hinfährt, ohne jede Nadel anzutippen.
export function nadelTerminText(o: Pick<Order, "order_date" | "time">, heute: string): string {
  if (o.order_date === heute) return o.time ? o.time.slice(0, 5) : "heute";
  const morgen = toDateStr(addDays(new Date(heute + "T12:00:00"), 1));
  if (o.order_date === morgen) return o.time ? `morgen ${o.time.slice(0, 5)}` : "morgen";
  const d = new Date(o.order_date + "T12:00:00");
  return `${WOCHENTAG_KURZ[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

// ---------------------------------------------------------------- Kundenkarte
//
// Die eine Zeile unter dem Namen: warum die Nadel diese Farbe hat. Sie ersetzt die fünf Zeilen
// „Letzter Kontakt / Wiedervorlage / …" des alten Popups.
export function kundenInfoZeile(
  k: { last_contact: string | null; wiedervorlage_am: string | null; status?: string | null },
  zustand: KundenZustand
): string {
  const datum = (iso: string) => new Date(iso).toLocaleDateString("de-DE");
  switch (zustand) {
    case "wiedervorlage":
      return k.wiedervorlage_am ? `Wiedervorlage am ${datum(k.wiedervorlage_am)}` : "Wiedervorlage";
    case "green":
      return k.last_contact ? `Kontaktiert am ${datum(k.last_contact)}` : "Kontaktiert";
    case "kein-interesse":
      return k.last_contact ? `Kein Interesse seit ${datum(k.last_contact)}` : "Kein Interesse";
    case "termin":
      return k.last_contact ? `Letzter Kontakt ${datum(k.last_contact)}` : "Noch kein Kontakt vermerkt";
    default:
      // Rot mit abgelaufener Wiedervorlage: Das Datum ist die eigentliche Nachricht.
      if (k.wiedervorlage_am) return `Wiedervorlage war am ${datum(k.wiedervorlage_am)} fällig`;
      return k.last_contact ? `Letzter Kontakt ${datum(k.last_contact)}` : "Noch nicht kontaktiert";
  }
}

// ---------------------------------------------------------------- Tag auf der Karte
//
// Im Reiter „Termine" bei „Heute" oder „Morgen" zeigt die Karte keinen Kundenbestand, sondern
// den Tag: jede Station mit ihrer Nummer in der Reihenfolge des Tages, dazu je Mitarbeiter eine
// gestrichelte Linie von Station zu Station.
//
// Die Linie ist bewusst eine LUFTLINIE und keine gefahrene Strecke (entschieden am 26.09.2026):
// Für die Strecke müssten die Adressen an einen Routendienst gehen, und Adressen gehen außer an
// die eigene Geocode-Route an niemanden (CLAUDE.md, Abschnitt 5). Die Reihenfolge ist die
// Aussage, nicht die Straße – navigiert wird ohnehin mit der Navigations-App.
export type TagesStation = {
  orderId: string;
  kundeId: string;
  nr: number;
  lat: number;
  lng: number;
  phase: TerminPhase;
  zeit: string;          // „08:30" oder „ohne Uhrzeit"
  mitarbeiter: string[];
};

type TagesZeile = {
  cust: { id: string; lat: number | null; lng: number | null };
  order: Pick<Order, "id" | "order_date" | "time" | "status">;
  phase: TerminPhase;
};

// Die Zeilen kommen chronologisch sortiert (wie die Terminliste). Stornierte fallen heraus – der
// Techniker fährt dort nicht hin. Stationen ohne Position bekommen trotzdem ihre Nummer: Sonst
// hieße „3" auf der Karte etwas anderes als „3" in der Liste daneben.
export function tagesStationen(zeilen: TagesZeile[], orderEmployees: Record<string, string[]>): { stationen: TagesStation[]; ohnePosition: number } {
  const stationen: TagesStation[] = [];
  let nr = 0;
  let ohnePosition = 0;
  for (const z of zeilen) {
    if (z.order.status === "storniert") continue;
    nr++;
    if (z.cust.lat == null || z.cust.lng == null) { ohnePosition++; continue; }
    stationen.push({
      orderId: z.order.id,
      kundeId: z.cust.id,
      nr,
      lat: z.cust.lat,
      lng: z.cust.lng,
      phase: z.phase,
      zeit: z.order.time ? z.order.time.slice(0, 5) : "ohne Uhrzeit",
      mitarbeiter: orderEmployees[z.order.id] || [],
    });
  }
  return { stationen, ohnePosition };
}

// Eine Linie je Mitarbeiter, in der Reihenfolge seiner Stationen. Ein Auftrag mit zwei Leuten
// liegt auf beiden Linien. Stationen ohne Mitarbeiter bekommen keine Linie – wer dort hinfährt,
// steht noch nicht fest. Eine Linie braucht mindestens zwei Punkte.
export function tagesWege(stationen: TagesStation[]): { mitarbeiterId: string; punkte: [number, number][] }[] {
  const wege = new Map<string, [number, number][]>();
  for (const s of stationen) {
    for (const id of s.mitarbeiter) {
      const liste = wege.get(id);
      if (liste) liste.push([s.lat, s.lng]);
      else wege.set(id, [[s.lat, s.lng]]);
    }
  }
  return [...wege.entries()]
    .filter(([, punkte]) => punkte.length >= 2)
    .map(([mitarbeiterId, punkte]) => ({ mitarbeiterId, punkte }));
}
