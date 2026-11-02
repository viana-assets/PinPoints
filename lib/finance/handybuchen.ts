// Buchen am Handy (v187, docs/finance.md Abschnitt 22, entschieden 30.10.2026): Foto zuerst, dann Betrag, wofür es war
// und womit bezahlt wurde – daraus macht Finance die Buchung (Konto, Gegenkonto, Vorsteuer) und zeigt sie vor dem
// Speichern. Hier die Regeln ohne React; die Maske ist components/finance/FinanceHandyBuchen.tsx, geprüft in
// tests/financeHandyBuchen.test.ts.
//
// Firmenkarte, Bar und Privat gehen über `fin_buchen()` (mit Transporter als KOST1), das Foto hängt danach an der
// Buchung (Migration 114). „Noch offen“ legt einen Beleg beim Lieferanten an und bucht ihn (Migration 90) – so steht
// er in den offenen Posten und im Zahlungsvorschlag.

import type { Kontenrahmen, Rechtsform } from "./einstellungen";
import type { FinBuchung, FinKonto, FinPosten } from "./buchung";
import { FIN_RECHNUNG_KONTEN } from "./rechnungen";
import { FIN_GELDTRANSIT } from "./bank";

// Die häufigen Kontierungen eines mobilen Reifenservice (Konten aus Migration 88).
export type HandyZweck = { key: string; text: string; konto: number };
export const FIN_HANDY_ZWECKE: { key: string; text: string; konto: Record<Kontenrahmen, number> }[] = [
  { key: "tanken", text: "Tanken", konto: { skr03: 4530, skr04: 6530 } },
  { key: "material", text: "Material", konto: { skr03: 3400, skr04: 5400 } },
  { key: "werkzeug", text: "Werkzeug", konto: { skr03: 4985, skr04: 6845 } },
  { key: "bewirtung", text: "Bewirtung", konto: { skr03: 4650, skr04: 6640 } },
  { key: "parken", text: "Parken", konto: { skr03: 4580, skr04: 6570 } },
];
// Wie viele gelernte Konten zusätzlich als Knopf erscheinen, und ab wie vielen Buchungen ein Konto „häufig“ ist.
export const FIN_HANDY_GELERNT = 3;
export const FIN_HANDY_HAEUFIG_AB = 2;

// Quellen, in denen jemand selbst kontiert hat (nicht Rechnung, Abschreibung, Abschluss, Vortrag).
const SELBST_KONTIERT: FinBuchung["quelle"][] = ["manuell", "beleg", "bank", "kasse"];

// Die Knöpfe „Wofür?“: die festen Zwecke nach Häufigkeit in diesem Betrieb, dazu bis zu drei weitere Aufwandskonten,
// die oft bebucht werden. Nur Konten, die es im Kontenrahmen gibt und die nicht ausgeblendet sind.
export function handyZwecke(buchungen: readonly FinBuchung[], konten: readonly FinKonto[], rahmen: Kontenrahmen): HandyZweck[] {
  const aktiv = new Map(konten.filter((k) => k.kontenrahmen === rahmen && k.aktiv).map((k) => [k.nummer, k]));
  const zahl = new Map<number, number>();
  for (const b of buchungen) {
    if (!SELBST_KONTIERT.includes(b.quelle) || b.storno_von || b.storniert_durch) continue;
    const gesehen = new Set<number>();
    for (const z of b.fin_buchungszeilen) {
      if (z.ist_steuer || z.seite !== "S" || aktiv.get(z.konto)?.kategorie !== "aufwand" || gesehen.has(z.konto)) continue;
      gesehen.add(z.konto);
      zahl.set(z.konto, (zahl.get(z.konto) ?? 0) + 1);
    }
  }
  const fest = FIN_HANDY_ZWECKE.map((z, i) => ({ key: z.key, text: z.text, konto: z.konto[rahmen], i }))
    .filter((z) => aktiv.has(z.konto))
    .sort((a, b) => (zahl.get(b.konto) ?? 0) - (zahl.get(a.konto) ?? 0) || a.i - b.i)
    .map(({ key, text, konto }) => ({ key, text, konto }));
  const belegt = new Set(fest.map((z) => z.konto));
  const gelernt = [...zahl.entries()]
    .filter(([k, n]) => !belegt.has(k) && n >= FIN_HANDY_HAEUFIG_AB)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, FIN_HANDY_GELERNT)
    .map(([k]) => ({ key: `k${k}`, text: kurzName(aktiv.get(k)?.bezeichnung ?? String(k)), konto: k }));
  return [...fest, ...gelernt];
}

// „Wareneingang 19 % Vorsteuer (Reifen, Ventile, Material)“ → „Wareneingang 19 % Vorsteuer“ – passt auf einen Knopf.
export function kurzName(bezeichnung: string): string {
  const t = bezeichnung.replace(/\s*\(.*\)\s*$/, "").trim();
  return t.length > 24 ? t.slice(0, 23).trimEnd() + "…" : t;
}

// ---------------------------------------------------------------- Bezahlt mit
export type HandyZahlweg = "karte" | "bar" | "privat" | "offen";
export const FIN_HANDY_ZAHLWEGE: { wert: HandyZahlweg; text: string; hinweis: string }[] = [
  { wert: "karte", text: "Firmenkarte", hinweis: "Gebucht gegen Geldtransit – den Umsatz auf dem Kontoauszug unter Bank & Kasse demselben Konto zuordnen." },
  { wert: "bar", text: "Bar (Kasse)", hinweis: "Gebucht gegen die Kasse – erscheint im Kassenbuch." },
  { wert: "privat", text: "Privat ausgelegt", hinweis: "Gebucht als Privateinlage – das Geld kam aus eigener Tasche." },
  { wert: "offen", text: "Noch offen", hinweis: "Legt eine Verbindlichkeit beim Lieferanten an; bezahlt wird später über die Bank." },
];
// Privateinlage: SKR03 1890, SKR04 2180 (Migration 88).
export const FIN_PRIVATEINLAGE: Record<Kontenrahmen, number> = { skr03: 1890, skr04: 2180 };

// Welche Wege diese Person hier hat: Karte, Bar, Privat buchen direkt (Recht Buchungen), „Noch offen“ legt einen Beleg
// an (Recht Belege). Privat ausgelegt gibt es bei UG und GmbH nicht – dort ist es eine Forderung des Gesellschafters
// und gehört über den Steuerberater gebucht.
export function handyZahlwege(rechtsform: Rechtsform, rechte: { buchen: boolean; belege: boolean }): HandyZahlweg[] {
  return FIN_HANDY_ZAHLWEGE.map((w) => w.wert).filter((w) => {
    if (w === "offen") return rechte.belege;
    if (!rechte.buchen) return false;
    return w !== "privat" || (rechtsform !== "ug" && rechtsform !== "gmbh");
  });
}

export function handyGegenkonto(weg: HandyZahlweg, rahmen: Kontenrahmen): number | null {
  switch (weg) {
    case "karte": return FIN_GELDTRANSIT[rahmen];
    case "bar": return FIN_RECHNUNG_KONTEN[rahmen].kasse;
    case "privat": return FIN_PRIVATEINLAGE[rahmen];
    case "offen": return null;
  }
}

// Der Posten für `fin_buchen()` bzw. die Vorschau. Kleinunternehmer ziehen keine Vorsteuer.
export function handyPosten(d: { konto: number | null; gegen: number | null; betrag: number | null; mitSteuer: boolean; klein: boolean; kost1: string | null }): FinPosten {
  return { soll: d.konto, haben: d.gegen, betrag: d.betrag, steuer: d.mitSteuer && !d.klein ? "vst19" : null, kost1: d.kost1 || null };
}

// „Tanken · Shell“ – höchstens 200 Zeichen (fin_buchungen.text).
export function handyText(zweck: string, bei: string): string {
  const b = bei.trim().replace(/\s+/g, " ");
  return (b ? `${zweck} · ${b}` : zweck).slice(0, 200);
}

// Was fehlt, bevor gebucht werden kann – in der Reihenfolge der Maske.
export function handyMangel(d: { betrag: number | null; konto: number | null; weg: HandyZahlweg | null; lieferant: string }): string | null {
  if (d.betrag == null || !(d.betrag > 0)) return "Betrag eintragen.";
  if (d.konto == null) return "Wählen, wofür es war.";
  if (!d.weg) return "Wählen, womit bezahlt wurde.";
  if (d.weg === "offen" && !d.lieferant.trim()) return "Bei „Noch offen“ den Lieferanten eintragen.";
  return null;
}

// ---------------------------------------------------------------- Heute gebucht
// Datum eines Zeitstempels in der Zeit des Geräts (erstellt_am ist UTC).
export function lokalesDatum(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Die Buchungen, die diese Person heute angelegt hat (ohne Stornos), neueste zuerst.
export function heuteGebucht(buchungen: readonly FinBuchung[], ich: string | null, heute: string): FinBuchung[] {
  if (!ich) return [];
  return buchungen
    .filter((b) => b.erstellt_von === ich && !b.storno_von && lokalesDatum(b.erstellt_am) === heute && SELBST_KONTIERT.includes(b.quelle))
    .sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am) || b.nr - a.nr);
}
