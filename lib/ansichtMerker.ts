// Wo das Fenster gerade steht – über das Neuladen hinweg (v167).
//
// Wunsch Vitali (19.10.2026): Zwei Fenster der Einsatzplanung nebeneinander, in jedem ein anderer Mitarbeiter am
// selben Tag. Nach F5 stand jedes wieder auf „Einsatzplanung · Monat · alle“, und alles war neu einzustellen.
// Jetzt merkt sich jedes Fenster seinen Reiter, sein System (FSM/Finance) und in der Einsatzplanung Ansicht, Monat,
// Tag und Filter in `sessionStorage`. Das gilt je Fenster (zwei Fenster, zwei Merker), übersteht das Neuladen und ist
// mit dem Schließen des Fensters weg – ein neues Fenster startet wie bisher in der Vorgabe. Keine Kundendaten:
// nur Schlüssel, Datum und die Kennung des gefilterten Mitarbeiters/Fahrzeugs.
//
// Ein Sprung von außen (Push-Meldung, `?lagerplatz=`, `?system=`) geht weiter vor; er setzt den Reiter erst nach
// dem Laden. Geprüft in tests/ansichtMerker.test.ts.

export type PlanMerker = {
  ansicht?: "monat" | "woche" | "tag" | "verf";
  monat?: string;        // YYYY-MM
  tag?: string | null;   // YYYY-MM-DD
  mitarbeiter?: string;  // "all" oder Kennung
  fahrzeug?: string;     // "all" | "ohne" | Kennung
  status?: "all" | "offen" | "in_arbeit" | "storniert";
};
export type AnsichtMerker = { tab?: string; system?: string; finSeite?: string; plan?: PlanMerker };

const SCHLUESSEL = "mr-ansicht";
const ANSICHTEN = ["monat", "woche", "tag", "verf"];
const STATUS = ["all", "offen", "in_arbeit", "storniert"];
const kurz = (v: unknown, max = 80): string | undefined => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);

// Liest einen gespeicherten Text und lässt nur durch, was der Form nach passt – ein beschädigter oder alter Merker
// darf das Fenster nicht in einen Zustand bringen, den es sonst nicht gibt.
export function ansichtAusText(text: string | null | undefined): AnsichtMerker {
  if (!text) return {};
  let roh: unknown;
  try { roh = JSON.parse(text); } catch { return {}; }
  if (!roh || typeof roh !== "object") return {};
  const r = roh as Record<string, unknown>;
  const aus: AnsichtMerker = {};
  if (kurz(r.tab, 30)) aus.tab = r.tab as string;
  if (kurz(r.system, 30)) aus.system = r.system as string;
  if (kurz(r.finSeite, 30)) aus.finSeite = r.finSeite as string;
  if (r.plan && typeof r.plan === "object") {
    const p = r.plan as Record<string, unknown>;
    const plan: PlanMerker = {};
    if (typeof p.ansicht === "string" && ANSICHTEN.includes(p.ansicht)) plan.ansicht = p.ansicht as PlanMerker["ansicht"];
    if (typeof p.monat === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p.monat)) plan.monat = p.monat;
    if (p.tag === null) plan.tag = null;
    else if (typeof p.tag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.tag)) plan.tag = p.tag;
    if (kurz(p.mitarbeiter)) plan.mitarbeiter = p.mitarbeiter as string;
    if (kurz(p.fahrzeug)) plan.fahrzeug = p.fahrzeug as string;
    if (typeof p.status === "string" && STATUS.includes(p.status)) plan.status = p.status as PlanMerker["status"];
    aus.plan = plan;
  }
  return aus;
}

function speicher(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

export function ansichtLesen(): AnsichtMerker {
  const s = speicher();
  if (!s) return {};
  try { return ansichtAusText(s.getItem(SCHLUESSEL)); } catch { return {}; }
}

// Mischt `teil` in den Merker (beim Plan Feld für Feld). Fehler beim Schreiben sind egal – es ist nur ein Merker.
export function ansichtMerken(teil: AnsichtMerker): void {
  const s = speicher();
  if (!s) return;
  try {
    const alt = ansichtLesen();
    const neu: AnsichtMerker = { ...alt, ...teil, plan: teil.plan ? { ...alt.plan, ...teil.plan } : alt.plan };
    s.setItem(SCHLUESSEL, JSON.stringify(neu));
  } catch { /* nur ein Merker */ }
}

// „YYYY-MM“ → erster Tag des Monats (lokale Zeit), sonst null.
export function monatAusMerker(m: string | undefined): Date | null {
  if (!m) return null;
  const [j, mo] = m.split("-").map(Number);
  return j && mo ? new Date(j, mo - 1, 1) : null;
}
export function monatFuerMerker(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
