// Finance F7 (Migration 95, v153): Anlagen und Abschreibungen – Regeln und Abschreibungsplan ohne Datenbank,
// geprüft in tests/financeAnlagen.test.ts. `afaBis()` ist der Spiegel von `fin_afa_bis()` (Migration 95); der Test
// vergleicht mit den Zahlen, die die Datenbank in pgtest/t95.sql liefert. Gebucht wird nur über die Datenbank.
//
// Stand Oktober 2026: GWG bis 800 € (§ 6 Abs. 2 EStG), Sammelposten über 250 € bis 1.000 € über fünf Jahre
// (§ 6 Abs. 2a, einheitlich je Wirtschaftsjahr), degressiv dreifach linear, höchstens 30 %, für Anschaffungen vom
// 01.07.2025 bis 31.12.2027 (§ 7 Abs. 2), E-Fahrzeuge im selben Zeitraum 75/10/5/5/3/2 % (§ 7 Abs. 2a).

import type { FinEinstellungen, Kontenrahmen } from "./einstellungen";

export type AfaArt = "linear" | "degressiv" | "gwg" | "sammelposten" | "e_fahrzeug";

export type FinAnlage = {
  id: string; bezeichnung: string; konto: number; art: AfaArt; anschaffung: string; ak: number; monate: number | null;
  satz: number | null; afa_konto: number; beleg_id: string | null; fahrzeug_id: string | null; abgang: string | null;
  abgang_buchung_id: string | null; notiz: string | null; erstellt_am: string;
};

export const FIN_GWG_GRENZE = 800;
export const FIN_SAMMELPOSTEN: { von: number; bis: number; jahre: number } = { von: 250, bis: 1000, jahre: 5 };
export const FIN_SONDER_AFA_ZEITRAUM: { von: string; bis: string } = { von: "2025-07-01", bis: "2027-12-31" };
export const FIN_DEGRESSIV_HOECHSTSATZ = 30;
export const FIN_E_FAHRZEUG_SAETZE = [75, 10, 5, 5, 3, 2];

export const FIN_AFA_ARTEN: { wert: AfaArt; text: string; hinweis: string }[] = [
  { wert: "linear", text: "Linear", hinweis: "Gleichmäßig über die Nutzungsdauer, monatsgenau ab dem Anschaffungsmonat." },
  { wert: "degressiv", text: "Degressiv", hinweis: "Bewegliche Güter, angeschafft 01.07.2025–31.12.2027: dreifach linear, höchstens 30 % vom Restwert; Wechsel zu linear, sobald höher." },
  { wert: "gwg", text: "Sofort (GWG)", hinweis: "Bis 800 € netto: ganz im Anschaffungsmonat." },
  { wert: "sammelposten", text: "Sammelposten", hinweis: "Über 250 € bis 1.000 €: je 20 % in fünf Jahren – nur, wenn für das Jahr gewählt." },
  { wert: "e_fahrzeug", text: "E-Fahrzeug", hinweis: "Rein elektrisch, angeschafft 01.07.2025–31.12.2027: 75 %, 10 %, 5 %, 5 %, 3 %, 2 %." },
];

// Vorschlag für die Nutzungsdauer in Jahren je Anlagekonto (AfA-Tabelle des BMF; Computer und Software seit 2021
// ein Jahr). Nur ein Vorschlag – für das einzelne Gut prüfen.
export const FIN_ND_VORSCHLAG: Record<Kontenrahmen, Record<number, number>> = {
  skr03: { 27: 1, 210: 10, 320: 6, 350: 9, 400: 8, 420: 13 },
  skr04: { 135: 1, 440: 10, 520: 6, 540: 9, 500: 8, 650: 13 },
};

const cent = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
export const monatIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

// Abschreibung bis einschließlich Monat t (t = Jahr * 12 + Monat - 1) – wie `fin_afa_bis()`.
export function afaBis(x: Pick<FinAnlage, "art" | "ak" | "monate" | "satz" | "anschaffung" | "abgang">, t: number): number {
  const a = monatIndex(x.anschaffung);
  const ja = Number(x.anschaffung.slice(0, 4));
  let bis = t;
  if (x.abgang && x.art !== "sammelposten") bis = Math.min(bis, monatIndex(x.abgang));
  if (bis < a) return 0;
  if (x.art === "gwg") return x.ak;
  if (x.art === "linear") return cent((x.ak * Math.min(bis - a + 1, x.monate ?? 1)) / (x.monate ?? 1));
  if (x.art === "sammelposten" || x.art === "e_fahrzeug") {
    let summe = 0;
    const letztes = x.art === "sammelposten" ? 4 : 5;
    for (let i = 0; i <= letztes; i++) {
      const y = ja + i;
      const afa = i === letztes ? x.ak - summe : x.art === "sammelposten" ? cent(x.ak * 0.2) : cent((x.ak * FIN_E_FAHRZEUG_SAETZE[i]) / 100);
      const erste = i === 0 && x.art === "e_fahrzeug" ? a : y * 12;
      const m = y * 12 + 11 - erste + 1;
      if (bis < erste) break;
      if (bis >= y * 12 + 11) summe += afa;
      else return cent(summe + (afa * (bis - erste + 1)) / m);
    }
    return cent(summe);
  }
  // degressiv mit Wechsel zur linearen AfA
  let summe = 0, buchwert = x.ak, y = ja;
  const n = x.monate ?? 0, satz = x.satz ?? 0;
  while (buchwert > 0) {
    const erste = Math.max(a, y * 12);
    const rest = n - (erste - a);
    if (rest <= 0) break;
    const m = Math.min(y * 12 + 11 - erste + 1, rest);
    const deg = (buchwert * satz / 100 * m) / 12;
    const lin = (buchwert * m) / rest;
    const afa = m === rest ? buchwert : cent(Math.max(deg, lin));
    if (bis < erste) break;
    if (bis >= erste + m - 1) { summe += afa; buchwert -= afa; }
    else return cent(summe + (afa * (bis - erste + 1)) / m);
    y++;
  }
  return cent(summe);
}

export type AfaPlanZeile = { jahr: number; afa: number; buchwert: number };

// Jahr für Jahr bis zum Ende (oder Abgang).
export function afaPlan(x: Pick<FinAnlage, "art" | "ak" | "monate" | "satz" | "anschaffung" | "abgang">): AfaPlanZeile[] {
  const ja = Number(x.anschaffung.slice(0, 4));
  const plan: AfaPlanZeile[] = [];
  let vorher = 0;
  for (let j = ja; j < ja + 52; j++) {
    const bis = afaBis(x, j * 12 + 11);
    plan.push({ jahr: j, afa: cent(bis - vorher), buchwert: cent(x.ak - bis) });
    vorher = bis;
    if (bis >= x.ak || (x.abgang && x.art !== "sammelposten" && Number(x.abgang.slice(0, 4)) <= j)) break;
  }
  return plan;
}

export const buchwertEnde = (x: Pick<FinAnlage, "art" | "ak" | "monate" | "satz" | "anschaffung" | "abgang">, t: number) => cent(x.ak - afaBis(x, t));

// Satz der degressiven AfA wie in Migration 95: dreifach linear, höchstens 30 %.
export function degressivSatz(monate: number): number {
  return Math.min(cent((3 * 1200) / monate), FIN_DEGRESSIV_HOECHSTSATZ);
}

// Was gegen die Anlage spricht (wie `fin_anlage_speichern()`) – oder leer.
export function anlageMaengel(x: { bezeichnung: string; art: AfaArt; anschaffung: string; ak: number | null; monate: number | null },
  e: Pick<FinEinstellungen, "sammelposten"> | null, heute: string): string[] {
  const m: string[] = [];
  if (!x.bezeichnung.trim()) m.push("Die Bezeichnung fehlt.");
  if (!x.ak || x.ak <= 0) m.push("Die Anschaffungskosten fehlen.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.anschaffung)) m.push("Das Anschaffungsdatum fehlt.");
  else if (x.anschaffung > heute) m.push("Das Anschaffungsdatum liegt in der Zukunft.");
  if (!e) { m.push("Für das Anschaffungsjahr sind die Finance-Einstellungen noch nicht gespeichert."); return m; }
  const ak = x.ak ?? 0;
  if (e.sammelposten && ak > FIN_SAMMELPOSTEN.von && ak <= FIN_SAMMELPOSTEN.bis && x.art !== "sammelposten") {
    m.push("Für dieses Jahr ist der Sammelposten gewählt – Güter über 250 € bis 1.000 € kommen dort hinein.");
  }
  if (x.art === "sammelposten") {
    if (!e.sammelposten) m.push("Der Sammelposten ist für dieses Jahr nicht gewählt (Finance › Einstellungen).");
    else if (ak <= FIN_SAMMELPOSTEN.von || ak > FIN_SAMMELPOSTEN.bis) m.push("In den Sammelposten gehören Güter über 250 € bis 1.000 € (netto).");
  }
  if (x.art === "gwg" && ak > FIN_GWG_GRENZE) m.push("Sofort abschreiben lassen sich Güter bis 800 € (netto).");
  if ((x.art === "degressiv" || x.art === "e_fahrzeug") && (x.anschaffung < FIN_SONDER_AFA_ZEITRAUM.von || x.anschaffung > FIN_SONDER_AFA_ZEITRAUM.bis)) {
    m.push(`${x.art === "degressiv" ? "Die degressive Abschreibung" : "Die Sonderabschreibung für E-Fahrzeuge"} gibt es für Anschaffungen vom 01.07.2025 bis 31.12.2027.`);
  }
  if ((x.art === "linear" || x.art === "degressiv") && (!x.monate || x.monate < 12 || x.monate > 600)) m.push("Die Nutzungsdauer fehlt (1 bis 50 Jahre).");
  return m;
}

// Vorschlag der Art aus dem Betrag und der Wahl des Jahres.
export function artVorschlag(ak: number, e: Pick<FinEinstellungen, "sammelposten"> | null): AfaArt {
  if (e?.sammelposten && ak > FIN_SAMMELPOSTEN.von && ak <= FIN_SAMMELPOSTEN.bis) return "sammelposten";
  if (ak > 0 && ak <= FIN_GWG_GRENZE) return "gwg";
  return "linear";
}

// Was ein Abschreibungslauf bis `bisMonat` buchen würde: Soll laut Plan minus schon gebucht (je Anlage).
export function afaLaufVorschau(anlagen: FinAnlage[], gebucht: Record<string, number>, jahr: number, bisMonat: number): { anlage: FinAnlage; betrag: number }[] {
  const t = jahr * 12 + bisMonat - 1;
  const ende = `${jahr}-${String(bisMonat).padStart(2, "0")}-31`;
  return anlagen
    .filter((a) => a.anschaffung <= ende)
    .map((a) => ({ anlage: a, betrag: cent(afaBis(a, t) - afaBis(a, jahr * 12 - 1) - (gebucht[a.id] ?? 0)) }))
    .filter((x) => x.betrag !== 0);
}

export function artText(art: AfaArt): string {
  return FIN_AFA_ARTEN.find((a) => a.wert === art)?.text ?? art;
}
