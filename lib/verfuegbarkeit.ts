import type { Employee, Verfuegbarkeit } from "./types";

// Verfügbarkeit der Mitarbeiter (Migration 68, v112).
//
// Die Techniker sind selbstständig und tragen vorher ein, an welchen Tagen sie eingesetzt werden
// können – ganzer Tag oder ein Zeitfenster. Nichts eingetragen heißt „unbekannt", nicht „hat keine
// Zeit". Die Einsatzplanung zeigt beim Einteilen zuerst die, die Zeit haben; wer trotzdem einen
// anderen wählt, bekommt einen Hinweis und keine Sperre – entscheiden tut immer das Büro.
//
// Reine Funktionen, geprüft in tests/verfuegbarkeit.test.ts.

// Wählbare Uhrzeiten im Zeitfenster: halbstündlich von 6 bis 21 Uhr. Feiner plant hier niemand.
export const VERFUEGBARKEIT_ZEITEN: string[] = Array.from({ length: 31 }, (_, i) => {
  const min = 6 * 60 + i * 30;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
});

// Das vorgeschlagene Zeitfenster, wenn jemand „nur ein Zeitfenster" wählt: der Vormittag.
export const VERFUEGBARKEIT_FENSTER_VORGABE = { von: "08:00", bis: "13:00" } as const;

export type Fenster = { von: string; bis: string } | null; // null = ganzer Tag

// „08:00:00" aus der Datenbank → „08:00".
export function hhmm(t: string | null | undefined): string | null {
  return t ? t.slice(0, 5) : null;
}

export function eintragAm(eintraege: Verfuegbarkeit[], employeeId: string, datum: string): Verfuegbarkeit | null {
  return eintraege.find((v) => v.employee_id === employeeId && v.datum === datum) ?? null;
}

export function fensterVon(v: Pick<Verfuegbarkeit, "von" | "bis">): Fenster {
  const von = hhmm(v.von), bis = hhmm(v.bis);
  return von && bis ? { von, bis } : null;
}

// „8–13", „8:30–13", oder „ganzer Tag".
export function fensterText(v: Pick<Verfuegbarkeit, "von" | "bis"> | null): string {
  if (!v) return "nicht eingetragen";
  const f = fensterVon(v);
  if (!f) return "ganzer Tag";
  const kurz = (t: string) => (t.endsWith(":00") ? String(Number(t.slice(0, 2))) : `${Number(t.slice(0, 2))}:${t.slice(3)}`);
  return `${kurz(f.von)}–${kurz(f.bis)}`;
}

// Wer an diesem Tag Zeit hat, in der Reihenfolge der Mitarbeiterliste.
export function verfuegbareAm(eintraege: Verfuegbarkeit[], employees: Employee[], datum: string): { employee: Employee; eintrag: Verfuegbarkeit }[] {
  const out: { employee: Employee; eintrag: Verfuegbarkeit }[] = [];
  for (const e of employees) {
    const v = eintragAm(eintraege, e.id, datum);
    if (v) out.push({ employee: e, eintrag: v });
  }
  return out;
}

// Passt ein Termin (Anfang, optional Ende) in den Eintrag? Ganzer Tag passt immer.
export function passtInsFenster(v: Pick<Verfuegbarkeit, "von" | "bis">, von: string | null, bis: string | null): boolean {
  const f = fensterVon(v);
  if (!f || !von) return true;
  const a = von.slice(0, 5), e = bis ? bis.slice(0, 5) : null;
  return a >= f.von && a < f.bis && (!e || e <= f.bis);
}

export type TeamHinweis = { employeeId: string; art: "nicht_eingetragen" | "ausserhalb"; text: string };

// Die Hinweise beim Einteilen: wer an dem Tag nichts eingetragen hat, und wessen Zeitfenster der
// Termin verlässt. Ein Hinweis, keine Sperre – manchmal ist es telefonisch abgesprochen.
export function teamHinweise(
  teamIds: string[], datum: string, von: string | null, bis: string | null,
  eintraege: Verfuegbarkeit[], employees: Employee[],
): TeamHinweis[] {
  const out: TeamHinweis[] = [];
  for (const id of teamIds) {
    const name = employees.find((e) => e.id === id)?.name ?? "Unbekannt";
    const v = eintragAm(eintraege, id, datum);
    if (!v) out.push({ employeeId: id, art: "nicht_eingetragen", text: `${name} hat sich für diesen Tag nicht eingetragen – vorher kurz abstimmen.` });
    else if (!passtInsFenster(v, von, bis)) out.push({ employeeId: id, art: "ausserhalb", text: `${name} ist an diesem Tag nur ${fensterText(v)} Uhr eingetragen.` });
  }
  return out;
}

// Wer an einem Termin eingeteilt ist, sich für den Tag aber nicht eingetragen hat – für die
// Warnmarke im Kalender.
export function nichtEingetragen(teamIds: string[], datum: string, eintraege: Verfuegbarkeit[]): string[] {
  return teamIds.filter((id) => !eintragAm(eintraege, id, datum));
}

// Die Tage, die eine Vorlage („jede Woche Mo–Fr") einträgt: von `ab` bis `bis`, nur die gewählten
// Wochentage (0 = Montag), nicht in der Vergangenheit und nicht, wo schon etwas steht.
export function vorlageTage(ab: string, bis: string, wochentage: boolean[], heute: string, vorhanden: Set<string>): string[] {
  const tage: string[] = [];
  if (!ab || !bis || ab > bis) return tage;
  const d = new Date(ab + "T12:00:00");
  const ende = new Date(bis + "T12:00:00");
  // Höchstens ein Jahr – länger plant niemand voraus, und die Datenbank räumt nach zwölf Monaten auf.
  for (let n = 0; d <= ende && n < 370; n++, d.setDate(d.getDate() + 1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const wt = (d.getDay() + 6) % 7;
    if (wochentage[wt] && ds >= heute && !vorhanden.has(ds)) tage.push(ds);
  }
  return tage;
}
