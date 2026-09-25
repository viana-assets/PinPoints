import type { Customer, Order, TireStorage } from "./types";
import { addDays, auftragsZeitraum, startOfWeekMonday, toDateStr } from "./calendar";
import { terminUeberschneidungen } from "./ueberschneidung";

// Die Rechnungen hinter dem neuen Dashboard (25.09.2026, Entwurf „G · Dashboard").
//
// Alles hier ist eine SICHT auf Bestände, die die App ohnehin geladen hat – Aufträge,
// Einteilung, Kunden, Lager. Nichts davon wird gespeichert; nur das Abhaken bei „Reifen
// mitnehmen" hat eine eigene Tabelle (Migration 58). Reine Funktionen, damit sie ohne
// Oberfläche prüfbar sind (tests/dashboard.test.ts).

const LAUFEND = (o: Order) => (o.status === "offen" || o.status === "in_arbeit") && !o.deleted_at;

// ---------------------------------------------------------------- Als Nächstes
//
// Der nächste Termin, der noch nicht vorbei ist: heute ab jetzt (ein laufender zählt, solange
// sein Ende nicht erreicht ist), sonst der nächste an einem späteren Tag. Aufträge ohne Uhrzeit
// kommen nur, wenn sonst nichts ansteht – „irgendwann heute" ist kein „als Nächstes".
export function alsNaechstes(orders: Order[], heute: string, jetztMin: number, standardMin: number): Order | null {
  const kandidaten = orders.filter((o) => LAUFEND(o) && o.order_date >= heute);
  const mitZeit = kandidaten
    .map((o) => ({ o, z: auftragsZeitraum(o, standardMin) }))
    .filter(({ o, z }) => z && (o.order_date > heute || z.ende > jetztMin))
    .sort((a, b) => (a.o.order_date + a.o.time).localeCompare(b.o.order_date + b.o.time));
  if (mitZeit.length > 0) return mitZeit[0].o;
  const ohneZeit = kandidaten.filter((o) => !o.time).sort((a, b) => a.order_date.localeCompare(b.order_date));
  return ohneZeit[0] ?? null;
}

// ---------------------------------------------------------------- Zu erledigen
export type ErledigenPunkt = {
  id: "rechnungen" | "ohne_mitarbeiter" | "ueberschneidung" | "rueckrufe" | "laufkunde" | "lager";
  zahl: number;
  titel: string;
  unter: string;
  // Was beim Aufklappen darunter steht. Jede Zeile kann zu einem Auftrag oder Kunden führen.
  zeilen: { text: string; auftragId?: string; kundeId?: string }[];
};

// Wie viele Plätze frei sein sollten, bevor das Dashboard warnt (entschieden am 25.09.2026).
export const LAGER_ENGPASS_AB = 10;

export function zuErledigen(p: {
  orders: Order[];
  orderEmployees: Record<string, string[]>;
  customers: Customer[];
  heute: string;
  standardMin: number;
  // Ist dieser Kunde ein fälliger Rückruf? Kommt von außen, weil die Regel am Kundenzustand
  // hängt (effectiveColor, Einstellung „Zeitraum") und nicht hier ein zweites Mal stehen soll.
  istRueckruf: (c: Customer) => boolean;
  kundeName: (o: Order) => string;
  mitarbeiterName: (id: string) => string;
  freiePlaetze: number | null;
  gesamtPlaetze: number | null;
}): ErledigenPunkt[] {
  const { orders, orderEmployees, heute } = p;
  const bis = toDateStr(addDays(new Date(heute + "T12:00:00"), 7));
  const kurz = (o: Order) => `${datumKurz(o.order_date)}${o.time ? " " + o.time.slice(0, 5) : ""} · ${p.kundeName(o)}`;
  const punkte: ErledigenPunkt[] = [];

  // Erledigt, braucht eine Rechnung, hat noch keine (Migration 40: rechnung_erstellt_am).
  const rechnungen = orders
    .filter((o) => o.status === "erledigt" && !o.deleted_at && o.rechnung_noetig && !o.rechnung_erstellt_am)
    .sort((a, b) => b.order_date.localeCompare(a.order_date));
  punkte.push({
    id: "rechnungen", zahl: rechnungen.length,
    titel: rechnungen.length === 1 ? "Rechnung noch nicht ausgestellt" : "Rechnungen noch nicht ausgestellt",
    unter: "erledigte Aufträge mit „Rechnung nötig“",
    zeilen: rechnungen.map((o) => ({ text: kurz(o), auftragId: o.id })),
  });

  const naechsteWoche = orders
    .filter((o) => LAUFEND(o) && o.order_date >= heute && o.order_date <= bis)
    .sort((a, b) => (a.order_date + (a.time ?? "")).localeCompare(b.order_date + (b.time ?? "")));
  const ohne = naechsteWoche.filter((o) => (orderEmployees[o.id] || []).length === 0);
  punkte.push({
    id: "ohne_mitarbeiter", zahl: ohne.length,
    titel: ohne.length === 1 ? "Termin ohne Mitarbeiter" : "Termine ohne Mitarbeiter",
    unter: "in den nächsten 7 Tagen",
    zeilen: ohne.map((o) => ({ text: kurz(o), auftragId: o.id })),
  });

  // Überschneidungen je Mitarbeiter, jedes Paar einmal.
  const paare = new Set<string>();
  const ueber: ErledigenPunkt["zeilen"] = [];
  for (const o of naechsteWoche) {
    const treffer = terminUeberschneidungen(o, orderEmployees[o.id] || [], null, naechsteWoche, orderEmployees, p.standardMin)
      .filter((t) => t.art === "mitarbeiter");
    for (const t of treffer) {
      const schluessel = [o.id, t.auftrag.id].sort().join("|") + "|" + t.werId;
      if (paare.has(schluessel)) continue;
      paare.add(schluessel);
      ueber.push({
        text: `${p.mitarbeiterName(t.werId)} · ${datumKurz(o.order_date)} · ${p.kundeName(o)} und ${p.kundeName(t.auftrag)} (${t.von}–${t.bis})`,
        auftragId: o.id,
      });
    }
  }
  punkte.push({
    id: "ueberschneidung", zahl: ueber.length,
    titel: ueber.length === 1 ? "Überschneidung" : "Überschneidungen",
    unter: "ein Mitarbeiter ist doppelt eingeteilt",
    zeilen: ueber,
  });

  const rueckrufe = p.customers.filter((c) => c.active !== false && !c.deleted_at && c.wiedervorlage_am && c.wiedervorlage_am <= heute && p.istRueckruf(c))
    .sort((a, b) => (a.wiedervorlage_am ?? "").localeCompare(b.wiedervorlage_am ?? ""));
  punkte.push({
    id: "rueckrufe", zahl: rueckrufe.length,
    titel: rueckrufe.length === 1 ? "Rückruf fällig" : "Rückrufe fällig",
    unter: "Wiedervorlagen bis heute",
    zeilen: rueckrufe.map((c) => ({ text: c.wiedervorlage_am! < heute ? `${c.name} · seit ${datumKurz(c.wiedervorlage_am!)}` : c.name, kundeId: c.id })),
  });

  const lauf = new Set(p.customers.filter((c) => c.laufkundschaft).map((c) => c.id));
  const ohneName = orders.filter((o) => LAUFEND(o) && lauf.has(o.customer_id) && !(o.laufkunde_name ?? "").trim());
  punkte.push({
    id: "laufkunde", zahl: ohneName.length,
    titel: ohneName.length === 1 ? "Laufkunde ohne Namen" : "Laufkunden ohne Namen",
    unter: "der Name wird beim Abschließen gebraucht",
    zeilen: ohneName.map((o) => ({ text: kurz(o), auftragId: o.id })),
  });

  if (p.freiePlaetze != null && p.gesamtPlaetze != null && p.gesamtPlaetze > 0 && p.freiePlaetze < LAGER_ENGPASS_AB) {
    punkte.push({
      id: "lager", zahl: p.freiePlaetze,
      titel: p.freiePlaetze === 1 ? "Lagerplatz frei" : "Lagerplätze frei",
      unter: `von ${p.gesamtPlaetze} – das Lager wird knapp`,
      zeilen: [],
    });
  }
  return punkte.filter((x) => x.zahl > 0 || x.id === "lager");
}

// ---------------------------------------------------------------- Saison-Barometer
//
// Wer hat Reifen der kommenden Saison bei uns liegen und noch keinen Termin? Das ist die
// Anrufliste, mit der im Herbst und im Frühjahr Geld verdient wird. Ein Kunde zählt einmal,
// auch mit zwei Sätzen. „Termin" heißt: ein offener oder begonnener Auftrag ab heute.
export function saisonBarometer(saetze: TireStorage[], orders: Order[], saison: "sommer" | "winter", heute: string): {
  kunden: number; saetze: number; mitTermin: number;
} {
  const liegend = saetze.filter((s) => !s.removed_at && s.saison === saison);
  const kundenMitSatz = new Set(liegend.map((s) => s.customer_id));
  const mitTermin = new Set(orders.filter((o) => LAUFEND(o) && o.order_date >= heute).map((o) => o.customer_id));
  const ohne = [...kundenMitSatz].filter((k) => !mitTermin.has(k));
  return {
    kunden: ohne.length,
    saetze: liegend.filter((s) => !mitTermin.has(s.customer_id)).length,
    mitTermin: [...kundenMitSatz].filter((k) => mitTermin.has(k)).length,
  };
}

// ---------------------------------------------------------------- Woche
//
// Umsatz der laufenden Woche (Mo–So): Summe der erledigten Aufträge, je Tag. `betrag` kommt von
// außen (Brutto aus den Leistungen, lib/helpers.ts orderArticleTotals).
export function wochenUmsatz(orders: Order[], heute: string, betrag: (o: Order) => number): {
  summe: number; jeTag: number[]; erledigt: number; gesamt: number;
} {
  const mo = startOfWeekMonday(new Date(heute + "T12:00:00"));
  const tage = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(mo, i)));
  const jeTag = tage.map(() => 0);
  let erledigt = 0, gesamt = 0;
  for (const o of orders) {
    // Testaufträge (Migration 60, negative Nummer) sind kein Umsatz.
    if (o.deleted_at || o.status === "storniert" || o.order_number < 0) continue;
    const i = tage.indexOf(o.order_date);
    if (i < 0) continue;
    gesamt++;
    if (o.status === "erledigt") { erledigt++; jeTag[i] += betrag(o); }
  }
  return { summe: jeTag.reduce((a, b) => a + b, 0), jeTag, erledigt, gesamt };
}

// Die Wochentage kurz, Sonntag zuerst wie `Date.getDay()`.
export const WOCHENTAG_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

// „Fr 25.9."
export function datumKurz(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${WOCHENTAG_KURZ[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}
