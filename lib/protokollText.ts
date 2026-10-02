// Das Änderungsprotokoll lesbar machen: Werte, Felder, wer.
//
// Bis v105 Teil von lib/helpers.ts (Fahrplan C5, v106: die Datei war auf über 1.100 Zeilen
// gewachsen). lib/helpers.ts reicht alles hier weiter, damit bestehende Importe gültig bleiben;
// neuer Code importiert direkt aus dieser Datei.

import { formatDate, formatEUR } from "./format";

// ---------------------------------------------------------------- Protokoll
//
// Der Trigger (Migration 36) schreibt rohe jsonb-Werte: null, true, "2026-09-20",
// "3f2a8c1e-…", 12.50. Lesbar wird das erst hier. Die Regeln stehen in dieser Datei und nicht
// in der Anzeige, weil dasselbe Protokoll an zwei Stellen erscheint – im Adminbereich und im
// Auftragsfenster – und zwei Schreibweisen derselben Änderung zwei Wahrheiten wären.

// Ein einzelner Wert aus dem Protokoll, für Menschen.
//
// Für Kennungen (UUID) wird bewusst GEKÜRZT und nicht weggelassen: Eine volle UUID sagt
// niemandem etwas und verdrängt den Rest der Zeile, aber „auf irgendetwas verwiesen" wäre
// eine Auskunft weniger, als dasteht. Die vollständige Kennung gehört in den Tooltip.
export const IST_KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function protokollWert(wert: unknown, namen?: Map<string, string>): string {
  if (wert == null) return "—";
  if (typeof wert === "boolean") return wert ? "ja" : "nein";
  if (typeof wert === "number") return wert.toLocaleString("de-DE");
  if (typeof wert !== "string") return JSON.stringify(wert);

  if (/^\d{4}-\d{2}-\d{2}$/.test(wert)) return formatDate(wert);
  if (/^\d{4}-\d{2}-\d{2}T/.test(wert)) {
    const d = new Date(wert);
    if (!Number.isNaN(d.getTime())) {
      return `${d.toLocaleDateString("de-DE")}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
    }
  }
  if (IST_KENNUNG.test(wert)) {
    // Erst nachschlagen, dann kürzen. „Artikel: Reifenwechsel mobil" beantwortet die Frage,
    // „Artikel: c5cc3cb9…" beantwortet sie nicht. Steht der Name nicht im Verzeichnis (ein
    // gelöschter Datensatz, eine Tabelle, die nicht mitgeladen wird), bleibt die gekürzte
    // Kennung – weniger, als man will, aber wahr.
    return namen?.get(wert) ?? wert.slice(0, 8) + "…";
  }
  if (wert === "") return "—";
  return wert.length > 120 ? wert.slice(0, 120) + " …" : wert;
}

// Was hat sich geändert? Der Trigger (Migration 18) legt die VOLLSTÄNDIGE Zeile vorher und
// nachher ab; der Unterschied entsteht erst hier.
//
// Warum nicht in der Datenbank: Eine Aufzeichnung soll vollständig sein – wer später wissen
// will, wie ein gelöschter Datensatz insgesamt aussah, findet es nur, wenn alles dasteht.
// Eine ANZEIGE soll knapp sein. Beides zugleich geht nur, wenn die Verkürzung beim Lesen
// passiert und nicht beim Schreiben.
//
// Ausgelassen werden `updated_at` und `updated_by`: Die schreibt derselbe Trigger-Satz bei
// JEDER Änderung mit. Stünden sie in der Liste, hätte jeder Eintrag zwei Zeilen Rauschen –
// und ein reines „nur der Zeitstempel hat sich bewegt" sähe aus wie eine echte Änderung.
// Dazu `created_at` und `created_by`: Bei einem ANLEGEN stehen dort genau der Zeitpunkt und
// die Person, die schon in der Kopfzeile des Eintrags stehen. Zweimal dasselbe in zwei
// Schreibweisen – einmal als Klartext oben, einmal als rohe Kennung unten – ist kein
// zusätzlicher Beleg, sondern die Zeile, an der man zu lesen aufhört.
const PROTOKOLL_STILLE_FELDER = new Set([
  "updated_at", "updated_by", "id", "created_at", "created_by",
]);

// Felder, bei denen die nackte Zahl die falsche Auskunft ist. „Nettopreis 50" liest sich wie
// eine Stückzahl; „50,00 €" wie ein Preis. Die Einheit steht am FELD und nicht am Wert, weil
// die Datenbank nur Zahlen ablegt – und das ist dort auch richtig so.
const PROTOKOLL_GELD_FELDER = new Set([
  "net_price", "endpreis_netto", "netto", "steuer", "brutto",
]);
const PROTOKOLL_PROZENT_FELDER = new Set(["vat_rate", "discount_percent"]);

// Uhrzeitspalten liefert Postgres als „10:00:00" – gemeint und überall sonst gezeigt ist „10:00".
const PROTOKOLL_UHRZEIT_FELDER = new Set(["time", "end_time"]);

function protokollFeldwert(feld: string, wert: unknown, namen?: Map<string, string>): string {
  if (typeof wert === "string" && PROTOKOLL_UHRZEIT_FELDER.has(feld) && /^\d\d:\d\d:\d\d/.test(wert)) return wert.slice(0, 5);
  if (typeof wert === "number") {
    if (PROTOKOLL_GELD_FELDER.has(feld)) return formatEUR(wert);
    if (PROTOKOLL_PROZENT_FELDER.has(feld)) return `${wert.toLocaleString("de-DE")} %`;
  }
  return protokollWert(wert, namen);
}

export function protokollFelder(
  alt: Record<string, unknown> | null | undefined,
  neu: Record<string, unknown> | null | undefined,
  labels: Record<string, string>,
  // Kennung → Klartext. Fehlt es, bleibt es bei den gekürzten Kennungen wie bisher.
  namen?: Map<string, string>,
  // Felder, die schon in der Kopfzeile stehen (der Auftrag, der Kunde). Sie ein zweites Mal
  // aufzuführen kostet eine Zeile und sagt nichts Neues.
  schonOben?: Set<string>
): { feld: string; label: string; alt: string; neu: string; rohAlt: string; rohNeu: string }[] {
  const a = alt ?? {};
  const n = neu ?? {};
  const feldnamen = new Set([...Object.keys(a), ...Object.keys(n)]);
  const zeilen: { feld: string; label: string; alt: string; neu: string; rohAlt: string; rohNeu: string }[] = [];

  for (const feld of feldnamen) {
    if (PROTOKOLL_STILLE_FELDER.has(feld)) continue;
    if (schonOben?.has(feld)) continue;
    const vorher = a[feld];
    const nachher = n[feld];
    // JSON-Vergleich statt ===: Der Trigger liefert auch Objekte und Listen, und zwei gleiche
    // Objekte sind nie dasselbe Objekt.
    if (JSON.stringify(vorher ?? null) === JSON.stringify(nachher ?? null)) continue;
    zeilen.push({
      feld,
      label: labels[feld] ?? feld,
      alt: protokollFeldwert(feld, vorher, namen),
      neu: protokollFeldwert(feld, nachher, namen),
      rohAlt: vorher == null ? "" : String(vorher),
      rohNeu: nachher == null ? "" : String(nachher),
    });
  }

  // Alphabetisch nach Beschriftung, nicht in der Reihenfolge, in der Postgres die Spalten
  // liefert: Wer zwei Einträge untereinander vergleicht, soll dieselbe Zeile an derselben
  // Stelle finden.
  return zeilen.sort((x, y) => x.label.localeCompare(y.label, "de"));
}

// Wer war das? Eine Kennung ohne Namen ist keine Antwort, und „unbekannt" wäre falsch: Ohne
// angemeldeten Menschen war es tatsächlich das System (ein zeitgesteuerter Lauf, ein
// Datenbankbefehl). Das ist eine Auskunft, keine Lücke.
//
// Die Namensliste kommt aus `protokoll_personen()`; ein inzwischen gelöschter Zugang steht
// nicht mehr darin. Dann bleibt die gekürzte Kennung – weniger, als man will, aber wahr.
export function protokollWer(
  benutzerId: string | null | undefined,
  personen: { id: string; email: string | null }[] = []
): string {
  if (!benutzerId) return "System";
  const person = personen.find((p) => p.id === benutzerId);
  return person?.email || benutzerId.slice(0, 8) + "…";
}

// Die drei Vorgänge, wie der Trigger sie schreibt – und wie ein Mensch sie liest.
export const PROTOKOLL_AKTION_LABEL: Record<string, string> = {
  INSERT: "angelegt",
  UPDATE: "geändert",
  DELETE: "gelöscht",
};
