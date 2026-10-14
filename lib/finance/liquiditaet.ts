// Finance: Liquiditätsvorschau (v158, Migration 100) – ohne Datenbank, geprüft in tests/financeLiquiditaet.test.ts.
// Aus dem, was Finance schon kennt (Geldkonten, offene Rechnungen und Belege, Aufträge ohne Rechnung, Umsatzsteuer)
// und den Planposten (`fin_planposten`) wird je Woche oder Monat gerechnet: Bestand am Anfang, Einzahlungen,
// Auszahlungen, Bestand am Ende. Eine Vorschau, keine Buchung – wer zahlt, zahlt nicht immer am Fälligkeitstag.

import type { FinKonto } from "./buchung";
import { MONATSNAMEN, type FinSaldo } from "./auswertungen";
import type { FinBankimport, FinBankkonto } from "./bank";
import type { FinBeleg } from "./belege";
import { belegRest, belegZustand } from "./belege";
import type { FinEinstellungen } from "./einstellungen";
import type { FinRechnungZeile, FinVorgang } from "./rechnungen";
import { FIN_ZAHLUNGSZIEL_TAGE, rechnungRest, rechnungZustand } from "./rechnungen";
import type { FinUstStand } from "./steuern";
import { ustFormular, ustFrist, ustZustand, zeitraumText } from "./steuern";

export type FinRhythmus = "einmal" | "monat" | "quartal" | "halbjahr" | "jahr";
// Wie `fin_pp_rhythmus` in Migration 100 (Test vergleicht). `monate`: Abstand zwischen zwei Terminen.
export const FIN_RHYTHMEN: { wert: FinRhythmus; text: string; monate: number }[] = [
  { wert: "einmal", text: "einmalig", monate: 0 },
  { wert: "monat", text: "monatlich", monate: 1 },
  { wert: "quartal", text: "vierteljährlich", monate: 3 },
  { wert: "halbjahr", text: "halbjährlich", monate: 6 },
  { wert: "jahr", text: "jährlich", monate: 12 },
];

export type FinPlanposten = {
  id: string; text: string; art: "ein" | "aus"; betrag: number; ab: string; rhythmus: FinRhythmus; bis: string | null;
  notiz: string | null; erstellt_am: string; geaendert_am: string | null;
};

const cent = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
const tag = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;
const iso = (t: number) => new Date(t * 86_400_000).toISOString().slice(0, 10);
const plus = (d: string, n: number) => iso(tag(d) + n);
const max = (a: string, b: string) => (a > b ? a : b);

// Termin `k` eines Rhythmus: gleicher Tag im Monat, am Monatsende abgeschnitten (31.01. → 28.02. → 31.03.).
function monatePlus(ab: string, monate: number): string {
  const [j, m, t] = ab.split("-").map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t, letzter));
  return ziel.toISOString().slice(0, 10);
}

// Alle Termine eines Planpostens zwischen `von` und `bis` (beide einschließlich).
export function planTermine(p: Pick<FinPlanposten, "ab" | "rhythmus" | "bis">, von: string, bis: string): string[] {
  const schritt = FIN_RHYTHMEN.find((r) => r.wert === p.rhythmus)?.monate ?? 0;
  const ende = p.bis && p.bis < bis ? p.bis : bis;
  if (schritt === 0) return p.ab >= von && p.ab <= bis ? [p.ab] : [];
  const out: string[] = [];
  for (let k = 0; k < 1200; k++) {
    const d = monatePlus(p.ab, k * schritt);
    if (d > ende) break;
    if (d >= von) out.push(d);
  }
  return out;
}

export type LiqQuelle = "rechnung" | "vorgang" | "beleg" | "ust" | "plan";
export const FIN_LIQ_QUELLEN: Record<LiqQuelle, string> = {
  rechnung: "Offene Rechnungen", vorgang: "Aufträge ohne Rechnung", beleg: "Offene Belege", ust: "Umsatzsteuer", plan: "Planposten",
};
// `betrag`: Einzahlung positiv, Auszahlung negativ. `ueberfaellig`: war schon fällig, steht auf heute.
export type LiqPosten = { datum: string; betrag: number; quelle: LiqQuelle; text: string; ueberfaellig: boolean };

export type LiqQuellen = {
  rechnungen: FinRechnungZeile[] | null;
  vorgaenge: FinVorgang[] | null;
  belege: FinBeleg[] | null;
  ust: { stand: FinUstStand; jahr: number; einstellungen: Pick<FinEinstellungen, "dauerfrist" | "besteuerung" | "start_datum"> } | null;
  plan: FinPlanposten[] | null;
};
export type LiqOptionen = { ueberfaellige: boolean; vorgaenge: boolean };

// Alle Zahlungen von heute bis `bis`. Was überfällig ist, steht auf heute – oder bleibt mit `ueberfaellige: false`
// draußen und kommt in `ohne` (damit die Oberfläche sagen kann, was fehlt).
export function liqPosten(q: LiqQuellen, heute: string, bis: string, o: LiqOptionen): { posten: LiqPosten[]; ohne: { ein: number; aus: number } } {
  const posten: LiqPosten[] = [];
  const ohne = { ein: 0, aus: 0 };
  const dazu = (datum: string, betrag: number, quelle: LiqQuelle, text: string) => {
    const ueberfaellig = datum < heute;
    if (ueberfaellig && !o.ueberfaellige) {
      if (betrag > 0) ohne.ein += betrag; else ohne.aus -= betrag;
      return;
    }
    const d = ueberfaellig ? heute : datum;
    if (d > bis || betrag === 0) return;
    posten.push({ datum: d, betrag: cent(betrag), quelle, text, ueberfaellig });
  };

  const gesehen = new Set<string>();
  for (const r of q.rechnungen ?? []) {
    if (gesehen.has(r.rechnung_id) || (r.order_number != null && r.order_number < 0)) continue;
    gesehen.add(r.rechnung_id);
    const z = rechnungZustand(r, heute);
    if (z.art !== "offen" && z.art !== "ueberfaellig") continue;
    const rest = rechnungRest(r);
    if (rest > 0) dazu(z.faellig, rest, "rechnung", `${r.nummer_text} · ${r.kunde}`);
  }
  if (o.vorgaenge) {
    for (const v of q.vorgaenge ?? []) {
      if (v.order_number < 0 || !(Number(v.betrag) > 0)) continue;
      // Erst die Rechnung, dann das Zahlungsziel – frühestens ab heute gerechnet.
      dazu(plus(max(v.datum, heute), FIN_ZAHLUNGSZIEL_TAGE), Number(v.betrag), "vorgang", `Auftrag ${v.order_number} · ${v.kunde} (noch ohne Rechnung)`);
    }
  }
  const belegeGesehen = new Set<string>();
  for (const b of q.belege ?? []) {
    if (belegeGesehen.has(b.id)) continue;
    belegeGesehen.add(b.id);
    const z = belegZustand(b, heute);
    if (z.art !== "offen" && z.art !== "ueberfaellig") continue;
    const rest = belegRest(b);
    if (rest > 0) dazu(z.faellig, -rest, "beleg", [b.belegnummer, b.text].filter(Boolean).join(" · ") || "Beleg");
  }
  if (q.ust?.stand.eingerichtet) {
    const { stand, jahr, einstellungen: e } = q.ust;
    for (const z of stand.zeitraeume) {
      const s = ustZustand(z, e, heute);
      if (s.art === "vorher" || s.art === "kommt" || s.art === "keine") continue;
      const frist = ustFrist(z.bis, z.zeitraum, e.dauerfrist);
      if (!frist) continue;
      // Abgegeben und die Frist vorbei: gilt als bezahlt (Lastschrift oder Überweisung zur Frist).
      if ((s.art === "abgegeben" || s.art === "geaendert") && frist < heute) continue;
      const zahllast = ustFormular(z.kennzahlen).zahllast;
      dazu(frist, -zahllast, "ust", `Umsatzsteuer ${zeitraumText(z.zeitraum, jahr)}${s.art === "laeuft" ? " (bisher gebucht)" : ""}`);
    }
  }
  for (const p of q.plan ?? []) {
    for (const d of planTermine(p, heute, bis)) dazu(d, p.art === "ein" ? Number(p.betrag) : -Number(p.betrag), "plan", p.text);
  }
  posten.sort((a, b) => a.datum.localeCompare(b.datum) || b.betrag - a.betrag);
  return { posten, ohne: { ein: cent(ohne.ein), aus: cent(ohne.aus) } };
}

export type LiqArt = "woche" | "monat";
export type LiqPeriode = { von: string; bis: string; titel: string; anfang: number; ein: number; aus: number; ende: number; posten: LiqPosten[] };

function isoWoche(d: string): number {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const jahresanfang = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - jahresanfang) / 86_400_000 + 1) / 7);
}
const kurz = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

// Die Zeiträume ab heute: die laufende Woche (bis Sonntag) bzw. der laufende Monat, dann volle Wochen bzw. Monate.
export function liqZeitraeume(heute: string, art: LiqArt, anzahl: number): { von: string; bis: string; titel: string }[] {
  const out: { von: string; bis: string; titel: string }[] = [];
  let von = heute;
  for (let i = 0; i < anzahl; i++) {
    let bis: string;
    let titel: string;
    if (art === "woche") {
      const wt = new Date(von + "T00:00:00Z").getUTCDay() || 7;
      bis = plus(von, 7 - wt);
      titel = `KW ${isoWoche(von)} · ${kurz(von)}–${kurz(bis)}`;
    } else {
      const [j, m] = von.split("-").map(Number);
      bis = new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
      titel = `${MONATSNAMEN[m - 1]} ${j}`;
    }
    out.push({ von, bis, titel });
    von = plus(bis, 1);
  }
  return out;
}

export function liqPerioden(anfang: number, posten: LiqPosten[], zeitraeume: { von: string; bis: string; titel: string }[]): LiqPeriode[] {
  let stand = anfang;
  return zeitraeume.map((z) => {
    const p = posten.filter((x) => x.datum >= z.von && x.datum <= z.bis);
    const ein = cent(p.filter((x) => x.betrag > 0).reduce((s, x) => s + x.betrag, 0));
    const aus = cent(p.filter((x) => x.betrag < 0).reduce((s, x) => s - x.betrag, 0));
    const a = stand;
    stand = cent(stand + ein - aus);
    return { ...z, anfang: a, ein, aus, ende: stand, posten: p };
  });
}

// Der niedrigste Stand am Ende eines Zeitraums (oder der Anfang, wenn alles darüber liegt).
export function liqTiefpunkt(perioden: LiqPeriode[]): { betrag: number; periode: LiqPeriode | null } {
  let t: { betrag: number; periode: LiqPeriode | null } = { betrag: perioden[0]?.anfang ?? 0, periode: null };
  for (const p of perioden) if (p.ende < t.betrag) t = { betrag: p.ende, periode: p };
  return t;
}

// Stand der Geldkonten (Kasse und Bank) laut Buchhaltung bis einschließlich `bisMonat`.
export function geldBestand(salden: FinSaldo[], konten: FinKonto[], bisMonat: number): { summe: number; konten: { konto: number; bezeichnung: string; saldo: number }[] } {
  const geld = new Map(konten.filter((k) => k.kategorie === "geld").map((k) => [k.nummer, k.bezeichnung]));
  const je = new Map<number, number>();
  for (const s of salden) {
    if (!geld.has(s.konto) || s.monat > bisMonat) continue;
    je.set(s.konto, (je.get(s.konto) ?? 0) + Number(s.soll ?? 0) - Number(s.haben ?? 0));
  }
  const liste = [...je].map(([konto, saldo]) => ({ konto, bezeichnung: geld.get(konto) ?? "", saldo: cent(saldo) })).sort((a, b) => a.konto - b.konto);
  return { summe: cent(liste.reduce((s, k) => s + k.saldo, 0)), konten: liste };
}

// Startbestand laut Kontoauszug: je Bankkonto der Endsaldo des letzten Auszugs (wo es einen gibt), sonst der
// gebuchte Stand; Kasse und andere Geldkonten immer gebucht.
export function startLautAuszug(
  gebucht: ReturnType<typeof geldBestand>, bankkonten: FinBankkonto[], importe: FinBankimport[],
): { summe: number; zeilen: { text: string; betrag: number; am: string | null }[]; auszuege: number } {
  const zeilen: { text: string; betrag: number; am: string | null }[] = [];
  const ersetzt = new Set<number>();
  let auszuege = 0;
  for (const k of bankkonten) {
    const letzter = importe.filter((i) => i.bankkonto_id === k.id && i.endsaldo != null && i.endsaldo_am)
      .sort((a, b) => String(b.endsaldo_am).localeCompare(String(a.endsaldo_am)) || b.erstellt_am.localeCompare(a.erstellt_am))[0];
    if (!letzter) continue;
    auszuege++;
    ersetzt.add(k.konto);
    zeilen.push({ text: k.name, betrag: Number(letzter.endsaldo), am: letzter.endsaldo_am });
  }
  for (const g of gebucht.konten) if (!ersetzt.has(g.konto)) zeilen.push({ text: g.bezeichnung || String(g.konto), betrag: g.saldo, am: null });
  return { summe: cent(zeilen.reduce((s, z) => s + z.betrag, 0)), zeilen, auszuege };
}
