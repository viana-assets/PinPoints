import type { Article, AuftragFahrzeug, Order, OrderArticle, TireStorage, Vehicle, Verkaufsreifen } from "./types";
import { mitnehmenListe } from "./mitnehmen";
import { packliste, type Packliste } from "./packliste";
import { kalenderwoche } from "./zeiterfassung";

// Die Seite „Packliste“ (v171, Entwurf Mockup_Packliste_v1): Was muss wann mit – nicht nur heute
// und morgen wie im Dashboard, sondern für einen wählbaren Zeitraum.
//
// KEINE NEUE REGEL. Je Tag rechnet sie genau das, was das Dashboard rechnet: die Sätze nach
// `mitnehmenListe()` (lib/mitnehmen.ts) und Leistungen/Reifengrößen nach `packliste()`
// (lib/packliste.ts). Neu sind nur drei Dinge:
//
//  1. Über mehrere Tage erscheint ein Satz nur beim ERSTEN Termin. `mitnehmenListe()` sorgt dafür
//     innerhalb eines Tages; hat der Kunde am Montag und am Donnerstag einen Auftrag, käme derselbe
//     Satz sonst zweimal auf die Liste, obwohl er nur einmal aus dem Regal geht.
//  2. Die Verkaufsreifen, die an einem Auftrag reserviert sind (`order_articles.verkaufsreifen_id`,
//     Migration 61) – auch sie müssen aus dem Lager ins Auto.
//  3. Die Gesamtansicht: alle Sätze nach Lager und Platz sortiert (einmal durchs Regal) und die
//     Reifengrößen je Kalenderwoche (zum Vorbestellen).
//
// Vergangene Tage gehören nicht dazu: Ein offener Auftrag von gestern steht in den Aufträgen unter
// „Noch zu erledigen“, eingepackt wird für ihn nichts mehr. Geprüft in tests/packlisteAnsicht.test.ts.

export type PacklisteZeitraum = "heute" | "morgen" | "woche" | "naechste" | "14" | "alle";

export const PACKLISTE_ZEITRAEUME: { wert: PacklisteZeitraum; text: string }[] = [
  { wert: "heute", text: "Heute" },
  { wert: "morgen", text: "Morgen" },
  { wert: "woche", text: "Diese Woche" },
  { wert: "naechste", text: "Nächste Woche" },
  { wert: "14", text: "14 Tage" },
  { wert: "alle", text: "Alle anstehenden" },
];

// „Alle anstehenden“ reicht so weit (entschieden 26.10.2026: drei Monate). Weiter voraus ist kaum
// etwas gebucht, und die Liste würde nur länger, nicht nützlicher.
export const PACKLISTE_HORIZONT_TAGE = 92;

function plusTage(tag: string, n: number): string {
  const [j, m, t] = tag.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(j, m - 1, t + n)).toISOString().slice(0, 10);
}

// Montag = 0 … Sonntag = 6.
function wochentagAbMontag(tag: string): number {
  const [j, m, t] = tag.split("-").map((x) => parseInt(x, 10));
  return (new Date(Date.UTC(j, m - 1, t)).getUTCDay() + 6) % 7;
}

// Erster und letzter Tag des Zeitraums (jeweils einschließlich). „Diese Woche“ beginnt heute, nicht
// am Montag – was schon war, wird nicht mehr gepackt.
export function packlisteSpanne(zeitraum: PacklisteZeitraum, heute: string): { von: string; bis: string } {
  switch (zeitraum) {
    case "heute": return { von: heute, bis: heute };
    case "morgen": { const m = plusTage(heute, 1); return { von: m, bis: m }; }
    case "woche": return { von: heute, bis: plusTage(heute, 6 - wochentagAbMontag(heute)) };
    case "naechste": { const mo = plusTage(heute, 7 - wochentagAbMontag(heute)); return { von: mo, bis: plusTage(mo, 6) }; }
    case "14": return { von: heute, bis: plusTage(heute, 13) };
    case "alle": return { von: heute, bis: plusTage(heute, PACKLISTE_HORIZONT_TAGE - 1) };
  }
}

// Aus einer Chat-Karte „Packliste Do 30.10.“ (v174): Welcher Zeitraum zeigt diesen Tag? Ein vergangener Tag
// wird nicht mehr gepackt – dann die nächsten 14 Tage und ein Hinweis; ebenso jenseits des Horizonts.
export function packlisteZielZeitraum(tag: string, heute: string): { zeitraum: PacklisteZeitraum; sichtbar: boolean } {
  if (tag < heute) return { zeitraum: "14", sichtbar: false };
  if (tag <= packlisteSpanne("14", heute).bis) return { zeitraum: "14", sichtbar: true };
  return { zeitraum: "alle", sichtbar: tag <= packlisteSpanne("alle", heute).bis };
}

export type PacklisteSatz = { auftrag: Order; satz: TireStorage };
export type PacklisteVerkauf = { auftrag: Order; position: OrderArticle; reifen: Verkaufsreifen | null };

export type PacklisteTag = {
  datum: string;
  kw: number;
  auftraege: Order[];
  saetze: PacklisteSatz[];
  verkauf: PacklisteVerkauf[];
  liste: Packliste;
};

const offen = (o: Order) => !o.deleted_at && (o.status === "offen" || o.status === "in_arbeit");
const nachZeit = (a: Order, b: Order) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.order_number - b.order_number;

// Die Tage des Zeitraums, an denen offene Aufträge stehen – aufsteigend. `auftraege` ist schon nach
// Mitarbeiter gefiltert (das macht die Seite); hier wird nur nach Datum und Zustand ausgewählt.
export function packlisteTage(opts: {
  von: string;
  bis: string;
  auftraege: Order[];
  positionen: OrderArticle[];
  artikel: Article[];
  auftragFahrzeuge: AuftragFahrzeug[];
  fahrzeuge: Vehicle[];
  einlagerungen: TireStorage[];
  verkaufsreifen: Verkaufsreifen[];
}): PacklisteTag[] {
  const imZeitraum = opts.auftraege.filter((o) => offen(o) && o.order_date >= opts.von && o.order_date <= opts.bis);
  const daten = [...new Set(imZeitraum.map((o) => o.order_date))].sort();
  const vergeben = new Set<string>();
  return daten.map((datum) => {
    const auftraege = imZeitraum.filter((o) => o.order_date === datum).sort(nachZeit);
    const saetze: PacklisteSatz[] = [];
    for (const e of mitnehmenListe(datum, auftraege, opts.einlagerungen, opts.auftragFahrzeuge)) {
      for (const satz of e.saetze) {
        if (vergeben.has(satz.id)) continue;
        vergeben.add(satz.id);
        saetze.push({ auftrag: e.auftrag, satz });
      }
    }
    const ids = new Set(auftraege.map((o) => o.id));
    const verkauf: PacklisteVerkauf[] = opts.positionen
      .filter((p) => ids.has(p.order_id) && !p.deleted_at && !!p.verkaufsreifen_id)
      .map((p) => ({
        auftrag: auftraege.find((o) => o.id === p.order_id)!,
        position: p,
        reifen: opts.verkaufsreifen.find((r) => r.id === p.verkaufsreifen_id) ?? null,
      }))
      .sort((a, b) => nachZeit(a.auftrag, b.auftrag));
    return {
      datum,
      kw: kalenderwoche(datum),
      auftraege,
      saetze,
      verkauf,
      liste: packliste(datum, auftraege, opts.positionen, opts.artikel, opts.auftragFahrzeuge, opts.fahrzeuge),
    };
  });
}

export type PacklisteGesamt = {
  auftraege: number;
  saetze: (PacklisteSatz & { datum: string })[];
  verkauf: (PacklisteVerkauf & { datum: string })[];
  leistungen: { name: string; menge: number }[];
  wochen: number[];
  // Je Reifengröße die Autos je Kalenderwoche und in Summe – häufigste zuerst.
  groessen: { groesse: string; jeWoche: Record<number, number>; summe: number }[];
  ohneGroesse: number;
};

export function packlisteGesamt(tage: PacklisteTag[]): PacklisteGesamt {
  const mengen = new Map<string, number>();
  const groessen = new Map<string, { jeWoche: Record<number, number>; summe: number }>();
  const wochen: number[] = [];
  let ohneGroesse = 0;
  for (const t of tage) {
    if (!wochen.includes(t.kw)) wochen.push(t.kw);
    for (const l of t.liste.leistungen) mengen.set(l.name, (mengen.get(l.name) ?? 0) + l.menge);
    for (const g of t.liste.groessen) {
      const z = groessen.get(g.groesse) ?? { jeWoche: {}, summe: 0 };
      z.jeWoche[t.kw] = (z.jeWoche[t.kw] ?? 0) + g.autos;
      z.summe += g.autos;
      groessen.set(g.groesse, z);
    }
    ohneGroesse += t.liste.ohneGroesse;
  }
  return {
    auftraege: tage.reduce((n, t) => n + t.auftraege.length, 0),
    saetze: tage.flatMap((t) => t.saetze.map((s) => ({ ...s, datum: t.datum }))),
    verkauf: tage.flatMap((t) => t.verkauf.map((v) => ({ ...v, datum: t.datum }))),
    leistungen: [...mengen].map(([name, menge]) => ({ name, menge }))
      .sort((a, b) => b.menge - a.menge || a.name.localeCompare(b.name, "de")),
    wochen,
    groessen: [...groessen].map(([groesse, z]) => ({ groesse, ...z }))
      .sort((a, b) => b.summe - a.summe || a.groesse.localeCompare(b.groesse)),
    ohneGroesse,
  };
}

// Für „Im Lager vorbereiten“: nach Lager, dann Platz in natürlicher Reihenfolge (BC-2 vor BC-10),
// bei gleichem Platz nach Termin. So geht man einmal durchs Regal statt Tag für Tag zu suchen.
export function nachPlatz<T extends { satz: TireStorage; datum: string; auftrag: Order }>(
  zeilen: T[],
  platz: (slotId: string) => { lager: string; code: string },
): T[] {
  return [...zeilen].sort((a, b) => {
    const pa = platz(a.satz.storage_slot_id), pb = platz(b.satz.storage_slot_id);
    return pa.lager.localeCompare(pb.lager, "de")
      || pa.code.localeCompare(pb.code, "de", { numeric: true })
      || a.datum.localeCompare(b.datum)
      || nachZeit(a.auftrag, b.auftrag);
  });
}
