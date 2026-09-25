import type { Order } from "./types";
import type { TerminFilter } from "./constants";
import { addDays, auftragsZeitraum, toDateStr, type Zeitraum } from "./calendar";
import { datumKurz } from "./dashboard";

// Die Regeln hinter der neu gestalteten Terminliste (26.09.2026, Entwurf „L · Termine").
// Reine Funktionen, geprüft in tests/terminAnsicht.test.ts.
//
// Die Frage, die die Liste beantworten soll: „Wo muss ich heute hin – und was kommt danach?"
// Deshalb ist ein Tag eine Zeitleiste: vorbei, läuft gerade, kommt noch; dazu die Jetzt-Linie
// und die freien Lücken, in die noch ein Termin passt.

// Ab wie vielen freien Minuten zwischen zwei Terminen die Liste „frei 13:00–15:15" anzeigt
// (entschieden am 26.09.2026). Darunter ist es Fahrzeit und Pause, kein Platz für einen Termin.
export const TERMIN_LUECKE_AB_MIN = 60;

type T = Pick<Order, "order_date" | "time" | "end_time" | "status">;

// ---------------------------------------------------------------- Zeitraum
//
// Stand vorher in app/page.tsx. „Morgen" und „7 Tage" wurden dort über `toISOString()`
// gebildet – das rechnet in UTC und verschob die Grenze kurz nach Mitternacht um einen Tag.
// Jetzt über `toDateStr` (Ortszeit), wie überall sonst.
export function imZeitraum(o: Pick<Order, "order_date">, vorbei: boolean, wert: TerminFilter, heute: string): boolean {
  if (wert === "alle") return true;
  if (wert === "anstehend") return !vorbei;
  if (wert === "heute") return o.order_date === heute;
  const basis = new Date(heute + "T12:00:00");
  if (wert === "morgen") return o.order_date === toDateStr(addDays(basis, 1));
  // 7 Tage: ab heute, sieben Tage nach vorn – die Woche, die man planen kann.
  return o.order_date >= heute && o.order_date <= toDateStr(addDays(basis, 7));
}

// ---------------------------------------------------------------- Phase
//
// vorbei  – an einem früheren Tag, heute schon zu Ende, oder erledigt/storniert (auch wenn die
//           Uhrzeit noch kommt: Wer früher fertig ist, hat den Termin hinter sich).
// laeuft  – heute, und entweder „In Arbeit" gesetzt oder jetzt zwischen Beginn und Ende.
// kommt   – alles andere. Ein Termin ohne Uhrzeit von heute „kommt" noch – er ist zu tun.
//
// Ohne Endzeit gilt die Standarddauer (wie im Stundenraster, `auftragsZeitraum`).
export type TerminPhase = "vorbei" | "laeuft" | "kommt";

export function terminPhase(o: T, heute: string, jetztMin: number, standardMin: number): TerminPhase {
  if (o.status === "erledigt" || o.status === "storniert") return "vorbei";
  if (o.order_date < heute) return "vorbei";
  if (o.order_date > heute) return "kommt";
  if (o.status === "in_arbeit") return "laeuft";
  const z = auftragsZeitraum(o, standardMin);
  if (!z) return "kommt";
  if (z.ende <= jetztMin) return "vorbei";
  if (z.start <= jetztMin) return "laeuft";
  return "kommt";
}

// ---------------------------------------------------------------- Tage
export type TerminEintrag<R> = {
  zeile: R;
  phase: TerminPhase;
  zeitraum: Zeitraum | null;
  // Freie Zeit NACH diesem Termin bis zum nächsten, in Minuten seit Mitternacht.
  luecke: Zeitraum | null;
};

export type TerminTag<R> = {
  datum: string;
  eintraege: TerminEintrag<R>[];
  // Vor welchem Eintrag die Jetzt-Linie steht (gleich der Länge: nach dem letzten). Nur heute,
  // und nicht, wenn gerade ein Termin läuft – der ist selbst hervorgehoben.
  jetztVor: number | null;
};

// Die Termine in Tagesgruppen, so wie die Liste sie zeichnet. Die Eingabe ist bereits gefiltert
// (Zeitraum, Mitarbeiter); die Reihenfolge der Tage ist aufsteigend, innerhalb eines Tages erst
// die mit Uhrzeit nach Beginn, dann die ohne.
//
// Lücken zählen gegen das späteste Ende ALLER vorherigen Termine des Tages, nicht nur des
// unmittelbar vorherigen: Bei „Alle Mitarbeiter" laufen Termine parallel, und frei ist erst,
// wenn keiner mehr unterwegs ist. Vergangene Tage bekommen keine Lücken, heute nur die, die
// noch vor einem liegen (ab jetzt gerechnet).
export function terminTage<R extends { order: T }>(
  zeilen: R[],
  heute: string,
  jetztMin: number,
  standardMin: number,
  lueckeAbMin: number = TERMIN_LUECKE_AB_MIN
): TerminTag<R>[] {
  const jeTag = new Map<string, R[]>();
  for (const r of zeilen) {
    const liste = jeTag.get(r.order.order_date);
    if (liste) liste.push(r);
    else jeTag.set(r.order.order_date, [r]);
  }
  const tage = [...jeTag.keys()].sort();
  return tage.map((datum) => {
    const mitZeit = jeTag.get(datum)!
      .map((zeile) => ({ zeile, zeitraum: auftragsZeitraum(zeile.order, standardMin) as Zeitraum | null }));
    mitZeit.sort((a, b) => {
      if (a.zeitraum && b.zeitraum) return a.zeitraum.start - b.zeitraum.start || a.zeitraum.ende - b.zeitraum.ende;
      return a.zeitraum ? -1 : b.zeitraum ? 1 : 0;
    });
    let spaetestesEnde = -1;
    const eintraege: TerminEintrag<R>[] = mitZeit.map(({ zeile, zeitraum }) => ({
      zeile, zeitraum: zeitraum ? { start: zeitraum.start, ende: zeitraum.ende } : null,
      phase: terminPhase(zeile.order, heute, jetztMin, standardMin), luecke: null,
    }));
    if (datum >= heute) {
      eintraege.forEach((e, i) => {
        if (!e.zeitraum) return;
        spaetestesEnde = Math.max(spaetestesEnde, e.zeitraum.ende);
        const naechster = eintraege[i + 1]?.zeitraum;
        if (!naechster) return;
        const von = datum === heute ? Math.max(spaetestesEnde, jetztMin) : spaetestesEnde;
        if (naechster.start - von >= lueckeAbMin) e.luecke = { start: von, ende: naechster.start };
      });
    }
    let jetztVor: number | null = null;
    if (datum === heute && !eintraege.some((e) => e.phase === "laeuft")) {
      const i = eintraege.findIndex((e) => e.phase !== "vorbei");
      jetztVor = i < 0 ? eintraege.length : i;
    }
    return { datum, eintraege, jetztVor };
  });
}

// ---------------------------------------------------------------- Texte
export function uhrzeit(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// „frei 13:00–15:15 · 2 Std." – volle Stunden ab zwei Stunden, darunter Minuten.
export function lueckeText(l: Zeitraum): string {
  const min = l.ende - l.start;
  const dauer = min >= 120 ? `${Math.floor(min / 60)} Std.` : `${min} Min.`;
  return `frei ${uhrzeit(l.start)}–${uhrzeit(l.ende)} · ${dauer}`;
}

// Die Kopfzeile einer Tagesgruppe: „HEUTE · FR 25.9.", „MORGEN · SA 26.9.", „MO 28.9.".
export function terminTagTitel(datum: string, heute: string): string {
  const basis = new Date(heute + "T12:00:00");
  const vorsatz = datum === heute ? "HEUTE · "
    : datum === toDateStr(addDays(basis, 1)) ? "MORGEN · "
    : datum === toDateStr(addDays(basis, -1)) ? "GESTERN · " : "";
  return vorsatz + datumKurz(datum).toUpperCase();
}

// Wann ist „Als Nächstes"? Dieselbe Beschriftung wie im Dashboard: „LÄUFT GERADE", „IN 40 MIN",
// „HEUTE 15:15", „MORGEN 09:00", „MO 28.9. 09:00".
export function naechsterWann(o: Pick<Order, "order_date" | "time">, heute: string, jetztMin: number): string {
  const zeit = o.time ? o.time.slice(0, 5) : "";
  if (o.order_date === heute) {
    const z = auftragsZeitraum(o, 0);
    if (!z) return "HEUTE";
    if (z.start <= jetztMin) return "LÄUFT GERADE";
    return z.start - jetztMin < 90 ? `IN ${z.start - jetztMin} MIN` : `HEUTE ${zeit}`;
  }
  if (o.order_date === toDateStr(addDays(new Date(heute + "T12:00:00"), 1))) return "MORGEN" + (zeit ? " " + zeit : "");
  return datumKurz(o.order_date).toUpperCase() + (zeit ? " " + zeit : "");
}
