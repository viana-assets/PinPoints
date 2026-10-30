// Finance Stufe G (Migration 115, v186): Plan und Ist. Der Plan steht je Konto und Monat als positiver Betrag; als
// „Salden“ verkleidet (Erlös im Haben, Aufwand im Soll) läuft er durch dieselbe BWA wie das Ist. Geprüft in
// tests/financePlan.test.ts.

import type { FinSaldo } from "./auswertungen";
import type { FinKonto } from "./buchung";

export type FinPlanWert = { konto: number; monat: number; betrag: number };

const cent = (n: number) => Math.round(n * 100) / 100;

// Plan als Salden – so rechnen bwa() und guv() den Plan genauso wie das Ist.
export function planAlsSalden(plan: readonly FinPlanWert[], konten: readonly FinKonto[]): FinSaldo[] {
  const kat = new Map(konten.map((k) => [k.nummer, k.kategorie]));
  return plan.flatMap((p) => {
    const k = kat.get(p.konto);
    if (k === "erloes") return [{ konto: p.konto, monat: p.monat, soll: 0, haben: p.betrag }];
    if (k === "aufwand") return [{ konto: p.konto, monat: p.monat, soll: p.betrag, haben: 0 }];
    return [];
  });
}

// Zwölf Monatswerte eines Kontos (0, wo nichts geplant ist).
export function planMonate(plan: readonly FinPlanWert[], konto: number): number[] {
  const m = Array<number>(12).fill(0);
  for (const p of plan) if (p.konto === konto && p.monat >= 1 && p.monat <= 12) m[p.monat - 1] = p.betrag;
  return m;
}

export type PlanIstZeile = {
  konto: number; bezeichnung: string; kategorie: "erloes" | "aufwand";
  plan: number; ist: number; abweichung: number; prozent: number | null;
  // Für die Farbe: mehr Erlös bzw. weniger Aufwand als geplant ist gut.
  gut: boolean;
};

// Plan gegen Ist je Konto in den Monaten von–bis: jedes Erlös- und Aufwandskonto mit Plan oder Ist.
export function planIst(salden: readonly FinSaldo[], plan: readonly FinPlanWert[], konten: readonly FinKonto[], von: number, bis: number): PlanIstZeile[] {
  const zeilen = new Map<number, { plan: number; ist: number }>();
  const zu = (konto: number) => zeilen.get(konto) ?? zeilen.set(konto, { plan: 0, ist: 0 }).get(konto)!;
  const kat = new Map(konten.map((k) => [k.nummer, k]));
  for (const s of salden) {
    if (s.monat < von || s.monat > bis) continue;
    const k = kat.get(s.konto);
    if (k?.kategorie === "erloes") zu(s.konto).ist += s.haben - s.soll;
    else if (k?.kategorie === "aufwand") zu(s.konto).ist += s.soll - s.haben;
  }
  for (const p of plan) {
    if (p.monat < von || p.monat > bis) continue;
    const k = kat.get(p.konto);
    if (k?.kategorie === "erloes" || k?.kategorie === "aufwand") zu(p.konto).plan += p.betrag;
  }
  return [...zeilen.entries()]
    .map(([konto, w]) => {
      const k = kat.get(konto)!;
      const plan = cent(w.plan), ist = cent(w.ist), abw = cent(ist - plan);
      return {
        konto, bezeichnung: k.bezeichnung, kategorie: k.kategorie as "erloes" | "aufwand", plan, ist, abweichung: abw,
        prozent: plan ? Math.round((abw / Math.abs(plan)) * 1000) / 10 : null,
        gut: k.kategorie === "erloes" ? abw >= 0 : abw <= 0,
      };
    })
    .filter((z) => z.plan !== 0 || z.ist !== 0)
    .sort((a, b) => (a.kategorie === b.kategorie ? a.konto - b.konto : a.kategorie === "erloes" ? -1 : 1));
}

// Eingabe von zwölf Monatsfeldern: leer = 0, Komma oder Punkt. Fehler als Text.
export function planEingabe(texte: readonly string[]): number[] | string {
  if (texte.length !== 12) return "Es braucht genau zwölf Monatswerte.";
  const werte: number[] = [];
  for (const [i, t] of texte.entries()) {
    const s = t.trim().replace(/\./g, "").replace(",", ".");
    if (!s) { werte.push(0); continue; }
    const n = Number(s);
    if (!Number.isFinite(n) || Math.abs(n) >= 1e10) return `Der Wert im Monat ${i + 1} ist keine Zahl.`;
    werte.push(cent(n));
  }
  return werte;
}

// Einen Jahresbetrag gleichmäßig auf zwölf Monate verteilen; der Rundungsrest landet im Dezember.
export function planVerteilen(jahr: number): number[] {
  const teil = Math.floor((jahr / 12) * 100) / 100;
  const m = Array<number>(12).fill(teil);
  m[11] = cent(jahr - teil * 11);
  return m;
}
