// Die Systeme der App (v145, Finance Phase F0, docs/finance.md Abschnitt 1): FSM – die bisherige App –,
// Finance und später CRM. EINE Liste für Marke, Wechsler und Navigation (Konstanten-Regel).
//
// Die App startet IMMER in FSM (Einsatzplanung) – Wunsch Vitali 14.10.2026; v145–v148 merkten sich das
// zuletzt gewählte System je Gerät und öffneten danach immer Finance. Nur ein Link mit `?system=finance`
// öffnet direkt. Wer ein System nicht sehen darf, landet in FSM – entschieden wird das hier aus dem
// Recht, durchgesetzt von der Datenbank (RLS auf allen `fin_*`-Tabellen).

export type SystemKey = "fsm" | "finance" | "crm";

export type SystemEintrag = {
  key: SystemKey;
  // Steht unter der Marke: „MR Assistent · FSM“.
  kurz: string;
  name: string;
  beschreibung: string;
  // Recht zum Sehen; `null` = immer (FSM).
  recht: string | null;
  // Noch nicht gebaut: grau mit „bald“, nicht wählbar.
  bald?: boolean;
};

export const SYSTEME: SystemEintrag[] = [
  { key: "fsm", kurz: "FSM", name: "Field Service Management", beschreibung: "Aufträge, Einsatzplanung, Kunden, Lager, Rechnungen", recht: null },
  { key: "finance", kurz: "Finance", name: "Buchhaltung", beschreibung: "Rechnungen, Belege, Bank, Steuern – Pilot", recht: "finance" },
  { key: "crm", kurz: "CRM", name: "Kundenbeziehungen", beschreibung: "Leads, Angebote, Kampagnen", recht: null, bald: true },
];

export const SYSTEM_PARAMETER = "system";

// Was diese Person in der Auswahl sieht. „Bald“-Systeme nur, wenn es überhaupt etwas zu wechseln
// gibt – wer nur FSM hat, bekommt keinen Wechsler und keine Ankündigung.
export function sichtbareSysteme(darf: (recht: string) => boolean): SystemEintrag[] {
  const echte = SYSTEME.filter((s) => !s.bald && (s.recht === null || darf(s.recht)));
  if (echte.length < 2) return echte;
  return SYSTEME.filter((s) => s.bald || echte.includes(s));
}

export function istWechselbar(darf: (recht: string) => boolean): boolean {
  return sichtbareSysteme(darf).filter((s) => !s.bald).length > 1;
}

// Gewünschtes System → das, das tatsächlich läuft. Unbekannt, nicht erlaubt oder „bald“ → FSM.
export function aktivesSystem(gewuenscht: string | null | undefined, darf: (recht: string) => boolean): SystemKey {
  const s = SYSTEME.find((x) => x.key === gewuenscht);
  if (!s || s.bald || (s.recht !== null && !darf(s.recht))) return "fsm";
  return s.key;
}

// Startwert beim Laden: der Link (`?system=`), sonst FSM. Ohne Fenster (Server): FSM.
// `gemerkt` (v167): das System, in dem DIESES Fenster vor dem Neuladen stand (lib/ansichtMerker.ts). Ein Link mit
// `?system=` geht vor; ein neues Fenster hat keinen Merker und startet in FSM wie bisher.
export function systemStartwert(gemerkt?: string): SystemKey {
  if (typeof window === "undefined") return "fsm";
  const wert = new URLSearchParams(window.location.search).get(SYSTEM_PARAMETER);
  if (SYSTEME.some((s) => s.key === wert)) return wert as SystemKey;
  return SYSTEME.some((s) => s.key === gemerkt) ? (gemerkt as SystemKey) : "fsm";
}
