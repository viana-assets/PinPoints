import type { BestellFuer, BestellStatus, Bestellwunsch } from "./types";
import type { PushInhalt } from "./pushInhalt";

// Die Bestellliste (Migration 104, v173, Wunsch Vitali 29.10.2026, Mockup Claude outputs/Mockup_Bestellliste_v1.html):
// Techniker tragen vor Ort ein, was fehlt – als Freitext, weil es oft Dinge sind, die in keinem Katalog stehen.
// Das Büro bestellt und hakt ab. Reine Funktionen, geprüft in tests/bestellung.test.ts.
//
// Die Regeln, WER was darf, stehen in der Datenbank (`bestellwunsch_pruefen()`): Ändern und Löschen nur, wer
// eingetragen hat, und nur solange offen; den Stand nur, wer verwalten darf. `darfAendern()` hier sagt der
// Oberfläche dasselbe vorher – die Knöpfe erscheinen nur, wo sie wirken.

export const BESTELL_STATUS: BestellStatus[] = ["offen", "bestellt", "da", "nicht_noetig"];
export const BESTELL_STATUS_LABEL: Record<BestellStatus, string> = {
  offen: "Offen", bestellt: "Bestellt", da: "Da", nicht_noetig: "Nicht nötig",
};
export const BESTELL_FUER_LABEL: Record<BestellFuer, string> = {
  transporter: "Transporter", lager: "Lager", allgemein: "allgemein",
};
// Dieselben Grenzen wie die Prüfregeln der Tabelle (bw_text, bw_menge, bw_notiz/bw_grund).
export const BESTELL_GRENZEN = { text: 500, menge: 60, notiz: 300, grundMin: 3 } as const;
export const BESTELL_FOTO_BUCKET = "bestell-fotos";
// `/?bestellung=<id>` öffnet die Bestellliste an diesem Eintrag (Push-Meldung).
export const BESTELLUNG_PARAMETER = "bestellung";

const wort = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9ß]+/g, " ").split(" ").filter((w) => w.length >= 2);

// „Gibt es das schon?“ – offene oder bestellte Wünsche mit denselben Wörtern (ab zwei gemeinsamen, bei
// kurzer Eingabe einem). Zahlen zählen mit: „17“ unterscheidet die Nuss von der 19er.
export function aehnlicheWuensche(text: string, wuensche: Bestellwunsch[], ohneId?: string): Bestellwunsch[] {
  const w = [...new Set(wort(text))];
  if (w.length === 0 || text.trim().length < 3) return [];
  const noetig = Math.min(2, w.length);
  return wuensche
    .filter((x) => x.id !== ohneId && (x.status === "offen" || x.status === "bestellt"))
    .map((x) => ({ x, treffer: w.filter((a) => wort(x.text).includes(a)).length }))
    .filter((t) => t.treffer >= noetig)
    .sort((a, b) => b.treffer - a.treffer || b.x.created_at.localeCompare(a.x.created_at))
    .slice(0, 3)
    .map((t) => t.x);
}

// Vorschläge beim Tippen: frühere Texte (jeder nur einmal), die das Getippte enthalten. Freitext bleibt immer.
export function bestellVorschlaege(text: string, wuensche: Bestellwunsch[], hoechstens = 3): string[] {
  const q = text.trim().toLowerCase();
  if (q.length < 3) return [];
  const gesehen = new Set<string>();
  const aus: string[] = [];
  for (const x of [...wuensche].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const t = x.text.trim();
    const k = t.toLowerCase();
    if (k === q || gesehen.has(k) || !k.includes(q)) continue;
    gesehen.add(k);
    aus.push(t);
    if (aus.length >= hoechstens) break;
  }
  return aus;
}

// Reihenfolge der Liste: dringende offene zuerst, dann die neuesten.
export function bestellSortierung(a: Bestellwunsch, b: Bestellwunsch): number {
  const dringend = (x: Bestellwunsch) => (x.dringend && x.status === "offen" ? 0 : 1);
  return dringend(a) - dringend(b) || b.created_at.localeCompare(a.created_at);
}

export type BestellFilter = BestellStatus | "alle";
export function bestellZahlen(wuensche: Bestellwunsch[]): Record<BestellFilter, number> {
  const z: Record<BestellFilter, number> = { offen: 0, bestellt: 0, da: 0, nicht_noetig: 0, alle: wuensche.length };
  for (const x of wuensche) z[x.status]++;
  return z;
}

// Meine: selbst eingetragen oder „+1“ gedrückt.
export function istMeiner(x: Bestellwunsch, ich: string | null): boolean {
  return !!ich && (x.erstellt_von === ich || x.plus.includes(ich));
}

// Darf ich Text, Menge, Foto … ändern bzw. löschen? Spiegel von `bestellwunsch_pruefen()`.
export function darfAendern(x: Bestellwunsch, ich: string | null, verwalter: boolean): boolean {
  return verwalter || (!!ich && x.erstellt_von === ich && x.status === "offen");
}

// „Liste kopieren“: eine Zeile je Wunsch, für die Mail an den Lieferanten. Ohne Namen von Kunden.
export function bestellListeText(wuensche: Bestellwunsch[]): string {
  return wuensche.map((x) => `- ${x.text.trim().replace(/\s+/g, " ")}${x.menge?.trim() ? ` (${x.menge.trim()})` : ""}`).join("\n");
}

export function bestellFotoPfad(ich: string, zufall: string, zeit: Date, endung: "jpg" | "png" = "jpg"): string {
  const stempel = zeit.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `${ich}/${stempel}-${zufall}.${endung}`;
}

function kurz(t: string, max: number): string {
  const s = t.trim().replace(/\s+/g, " ");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Push-Meldungen (lib/bestellVersand.ts). Ohne Kundennamen – die Meldung steht auf dem Sperrbildschirm.
export function bestellPushDringend(x: Pick<Bestellwunsch, "id" | "text" | "menge">, vonName: string): PushInhalt {
  return {
    titel: `Dringend bestellen – ${vonName}`,
    text: kurz(`${x.text}${x.menge?.trim() ? ` (${x.menge.trim()})` : ""}`, 120),
    url: `/?${BESTELLUNG_PARAMETER}=${x.id}`,
    kennung: `bestellung-${x.id}`,
  };
}
export function bestellPushStand(x: Pick<Bestellwunsch, "id" | "text" | "status" | "grund" | "notiz">): PushInhalt {
  const da = x.status === "da";
  return {
    titel: da ? "Bestellung ist da" : "Bestellung nicht nötig",
    text: kurz(da ? `${x.text}${x.notiz?.trim() ? ` · ${x.notiz.trim()}` : ""}` : `${x.text} · ${x.grund ?? ""}`, 120),
    url: `/?${BESTELLUNG_PARAMETER}=${x.id}`,
    kennung: `bestellung-${x.id}`,
  };
}
