import type { AuftragFahrzeug, Order, TireStorage } from "./types";
import { minutenAusUhrzeit } from "./helpers";
import { ABENDHINWEIS_UHRZEIT_STANDARD } from "./constants";

// „Reifen mitnehmen" – welche eingelagerten Sätze müssen morgen mit? (23.09.2026)
//
// EINE Rechnung für zwei Stellen: den Abendhinweis, den der Server verschickt
// (lib/abendhinweisVersand.ts), und das Fenster, das beim Antippen aufgeht
// (components/auftraege/MitnehmenFenster.tsx). Stünde die Regel zweimal da, zeigte das Fenster
// irgendwann etwas anderes als die Meldung, die zu ihm geführt hat.
//
// DIE REGEL (entschieden am 23.09.2026): Jeder offene oder begonnene Auftrag des Tages, dessen
// Kunde einen Satz im Regal hat. Bewusst NICHT an eine Wechselleistung gebunden – die Leistungen
// werden oft erst vor Ort eingetragen, und ein Hinweis, der daran hinge, bliebe genau dann
// stumm, wenn er gebraucht wird.
//
// Hängen Fahrzeuge am Auftrag, zählen nur die Sätze DIESER Fahrzeuge – ein Kunde mit zwei
// Autos, von denen morgen eines drankommt, braucht nicht beide Sätze. Sätze ohne Fahrzeug
// (Altbestand vor Migration 30) zählen dann trotzdem mit: Von ihnen weiß niemand, zu welchem
// Auto sie gehören, und ein Satz zu viel im Transporter ist billiger als einer zu wenig.
//
// Ein Satz, der AN DIESEM AUFTRAG eingelagert wurde, ist keiner zum Mitnehmen – er ist der, der
// zurückkommt. Und ein Satz erscheint nur einmal, auch wenn der Kunde morgen zwei Termine hat:
// beim ersten.

export type MitnehmenEintrag = {
  auftrag: Order;
  saetze: TireStorage[];
};

export function mitnehmenListe(
  datum: string,
  auftraege: Order[],
  einlagerungen: TireStorage[],
  auftragFahrzeuge: AuftragFahrzeug[]
): MitnehmenEintrag[] {
  const liegend = einlagerungen.filter((s) => !s.removed_at);
  const fahrzeugeJeAuftrag = new Map<string, Set<string>>();
  for (const af of auftragFahrzeuge) {
    const menge = fahrzeugeJeAuftrag.get(af.order_id) ?? new Set<string>();
    menge.add(af.vehicle_id);
    fahrzeugeJeAuftrag.set(af.order_id, menge);
  }

  const vergeben = new Set<string>();
  const ergebnis: MitnehmenEintrag[] = [];
  const tagesauftraege = auftraege
    .filter((o) => o.order_date === datum && !o.deleted_at && (o.status === "offen" || o.status === "in_arbeit"))
    // Nach Uhrzeit, ohne Uhrzeit ans Ende – in der Reihenfolge, in der gefahren wird.
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.order_number - b.order_number);

  for (const auftrag of tagesauftraege) {
    const fahrzeuge = fahrzeugeJeAuftrag.get(auftrag.id);
    const saetze = liegend.filter((s) =>
      s.customer_id === auftrag.customer_id
      && s.order_id !== auftrag.id
      && !vergeben.has(s.id)
      && (!fahrzeuge || fahrzeuge.size === 0 || !s.vehicle_id || fahrzeuge.has(s.vehicle_id))
    );
    if (saetze.length === 0) continue;
    saetze.forEach((s) => vergeben.add(s.id));
    ergebnis.push({ auftrag, saetze });
  }
  return ergebnis;
}

// Der Text der Meldung. Auf dem Sperrbildschirm ist er oft das Einzige, was gelesen wird –
// deshalb Name und Platz (entschieden am 23.09.2026), in der Reihenfolge der Fahrt.
//
//   Titel: „Morgen 3 Sätze mitnehmen"
//   Text:  „08:00 Müller (A-12) · 10:30 Schmidt (B-03, B-04) · Weber (A-07)"
export function mitnehmenText(
  eintraege: MitnehmenEintrag[],
  kundeName: (kundeId: string) => string,
  platzCode: (lagerplatzId: string) => string
): { titel: string; text: string } {
  const saetze = eintraege.reduce((n, e) => n + e.saetze.length, 0);
  const titel = `Morgen ${saetze} ${saetze === 1 ? "Satz" : "Sätze"} mitnehmen`;
  const text = eintraege
    .map((e) => {
      const plaetze = e.saetze.map((s) => platzCode(s.storage_slot_id)).join(", ");
      return `${e.auftrag.time ? `${e.auftrag.time} ` : ""}${kundeName(e.auftrag.customer_id)} (${plaetze})`;
    })
    .join(" · ");
  return { titel, text };
}

// Der Tag nach `datum` (YYYY-MM-DD), rein kalendarisch. Über UTC gerechnet, damit eine
// Zeitumstellung in der Nacht keinen Tag verschluckt oder doppelt zählt.
export function folgetag(datum: string): string {
  const [j, m, t] = datum.split("-").map((x) => parseInt(x, 10));
  const d = new Date(Date.UTC(j, m - 1, t + 1));
  return d.toISOString().slice(0, 10);
}

// Ist für diese Person jetzt der Abendhinweis dran? Ab der eingestellten Uhrzeit bis Mitternacht
// – ein Nachholfenster, falls der Zeitgeber um 20:00 gerade nicht lief. Dass er an einem Abend
// nur EINMAL geht, sichert die Tabelle `push_abendhinweis` (Migration 55), nicht diese Funktion.
//
// Ohne Einstellungszeile gilt die Vorgabe: an, 20:00. Eine unlesbare Uhrzeit fällt ebenfalls auf
// die Vorgabe zurück, statt den Hinweis still zu verschlucken.
export function abendhinweisFaellig(
  einstellung: { abendhinweis_aktiv?: boolean | null; abendhinweis_uhrzeit?: string | null } | undefined,
  jetztMinuten: number
): boolean {
  if (einstellung && einstellung.abendhinweis_aktiv === false) return false;
  const ab = minutenAusUhrzeit(einstellung?.abendhinweis_uhrzeit ?? null)
    ?? minutenAusUhrzeit(ABENDHINWEIS_UHRZEIT_STANDARD)!;
  return jetztMinuten >= ab;
}
