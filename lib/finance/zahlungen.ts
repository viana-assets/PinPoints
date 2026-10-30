// Finance Stufe E Teil 2 (Migration 113, v186): Zahlungsvorschlag für fällige Lieferantenbelege und die
// SEPA-Überweisungsdatei (pain.001.001.09). Die Datei entsteht hier im Browser aus dem gespeicherten Zahlauftrag;
// hochgeladen und freigegeben wird sie im Online-Banking. Gebucht wird erst der Kontoauszug (Bank & Kasse).
// Geprüft in tests/financeZahlungen.test.ts.

import { belegRest, type FinBeleg, type FinLieferant } from "./belege";

export type FinZahlauftragPosten = {
  id: string; auftrag_id: string; beleg_id: string; lieferant_id: string; name: string; iban: string; bic: string | null;
  betrag: number; skonto: number; zweck: string; e2e: string;
};
export type FinZahlauftrag = {
  id: string; bankkonto_id: string; ausfuehrung: string; msg_id: string; anzahl: number; summe: number;
  status: "erstellt" | "verworfen"; verworfen_grund: string | null; erstellt_am: string;
  fin_zahlauftrag_posten: FinZahlauftragPosten[];
};

// Wie weit der Vorschlag vorausschaut: was bis heute plus so viele Tage fällig wird.
export const FIN_ZAHLUNG_VORLAUF_TAGE = 7;
// Das Datenformat der Datei – seit November 2023 das gültige DK-Format für SEPA-Überweisungen.
export const FIN_SEPA_FORMAT = "pain.001.001.09";

const cent = (n: number) => Math.round(n * 100) / 100;

export function plusTage(iso: string, tage: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

// Fälligkeit aus dem Zahlungsziel des Lieferanten (für einen neuen Beleg ohne eigenes Fälligkeitsdatum).
export function faelligVorschlag(l: Pick<FinLieferant, "zahlungsziel_tage"> | null | undefined, belegdatum: string): string | null {
  return l?.zahlungsziel_tage != null ? plusTage(belegdatum, l.zahlungsziel_tage) : null;
}

// Bis wann Skonto gilt – oder null, wenn der Lieferant keins gewährt.
export function skontoBis(l: Pick<FinLieferant, "skonto_prozent" | "skonto_tage"> | null | undefined, belegdatum: string): string | null {
  return l?.skonto_prozent && l.skonto_tage ? plusTage(belegdatum, l.skonto_tage) : null;
}

export type ZahlVorschlag = {
  beleg: FinBeleg; lieferant: FinLieferant | null; rest: number; faellig: string; skontoBis: string | null;
  skonto: number; betrag: number; grund: string | null;
};

// Die Belege, die bis zum Stichtag fällig sind – oder deren Skonto bis zur Ausführung noch gilt. Ohne Belege, die schon
// in einem nicht verworfenen Zahlauftrag stehen. `grund`: warum (noch) keine Überweisung geht.
export function zahlungsvorschlag(
  belege: readonly FinBeleg[], lieferanten: readonly FinLieferant[], auftraege: readonly FinZahlauftrag[], stichtag: string, ausfuehrung: string,
): ZahlVorschlag[] {
  const imAuftrag = new Set(auftraege.filter((a) => a.status === "erstellt").flatMap((a) => a.fin_zahlauftrag_posten.map((p) => p.beleg_id)));
  const liste: ZahlVorschlag[] = [];
  for (const b of belege) {
    if (b.status !== "gebucht" || b.bezahlt_am || imAuftrag.has(b.id)) continue;
    const rest = belegRest(b);
    if (rest <= 0) continue;
    const l = lieferanten.find((x) => x.id === b.lieferant_id) ?? null;
    const faellig = b.faellig_am ?? faelligVorschlag(l, b.belegdatum) ?? b.belegdatum;
    const bis = skontoBis(l, b.belegdatum);
    // Skonto nur auf den ganzen Beleg: nach einer Teilzahlung nicht mehr.
    const skonto = bis && ausfuehrung <= bis && !b.teilbezahlt && l?.skonto_prozent ? Math.min(cent(Number(b.brutto ?? 0) * l.skonto_prozent / 100), rest) : 0;
    if (faellig > stichtag && skonto === 0) continue;
    liste.push({
      beleg: b, lieferant: l, rest, faellig, skontoBis: skonto > 0 ? bis : null, skonto, betrag: cent(rest - skonto),
      grund: !l ? "ohne Lieferant" : !l.iban ? "keine IBAN beim Lieferanten" : null,
    });
  }
  return liste.sort((a, b) => (a.skontoBis ?? a.faellig).localeCompare(b.skontoBis ?? b.faellig) || a.faellig.localeCompare(b.faellig));
}

// Ein Zahlauftrag ist erledigt, wenn alle seine Belege bezahlt sind (der Kontoauszug ist zugeordnet).
export type AuftragZustand = "verworfen" | "offen" | "teilweise" | "erledigt";
export function auftragZustand(a: FinZahlauftrag, belege: readonly Pick<FinBeleg, "id" | "bezahlt_am">[]): AuftragZustand {
  if (a.status === "verworfen") return "verworfen";
  const bezahlt = a.fin_zahlauftrag_posten.filter((p) => belege.find((b) => b.id === p.beleg_id)?.bezahlt_am).length;
  return bezahlt === 0 ? "offen" : bezahlt === a.fin_zahlauftrag_posten.length ? "erledigt" : "teilweise";
}

// Für die Bank: welcher Posten eines offenen Zahlauftrags zu einer Abbuchung passt – gleicher Betrag und die
// Belegnummer bzw. der Name im Verwendungszweck/Empfänger. Bei einer Sammelbuchung der ganze Auftrag (Summe gleich).
export function zahlauftragTreffer(
  u: { betrag: number; zweck: string | null; name: string | null; iban: string | null },
  auftraege: readonly FinZahlauftrag[], belege: readonly Pick<FinBeleg, "id" | "bezahlt_am">[],
): { auftrag: FinZahlauftrag; posten: FinZahlauftragPosten[] } | null {
  if (u.betrag >= 0) return null;
  const betrag = cent(-u.betrag);
  const offen = auftraege.filter((a) => a.status === "erstellt");
  const kompakt = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const zweck = kompakt(u.zweck);
  for (const a of offen) {
    const frei = a.fin_zahlauftrag_posten.filter((p) => !belege.find((b) => b.id === p.beleg_id)?.bezahlt_am);
    const einzeln = frei.find((p) => cent(p.betrag) === betrag
      && ((u.iban && u.iban.replace(/\s/g, "").toUpperCase() === p.iban) || zweck.includes(kompakt(p.e2e)) || zweck.includes(kompakt(p.zweck).slice(0, 20))));
    if (einzeln) return { auftrag: a, posten: [einzeln] };
  }
  for (const a of offen) {
    const frei = a.fin_zahlauftrag_posten.filter((p) => !belege.find((b) => b.id === p.beleg_id)?.bezahlt_am);
    if (frei.length > 1 && cent(frei.reduce((s, p) => s + p.betrag, 0)) === betrag) return { auftrag: a, posten: frei };
  }
  return null;
}

// ---------------------------------------------------------------- SEPA-Datei
// Zeichen, die im SEPA-Verfahren erlaubt sind (lateinisch, DK-Zeichensatz); Umlaute werden umschrieben.
export function sepaText(s: string, max: number): string {
  const ersetzt = s
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/&/g, "+").replace(/[–—]/g, "-").replace(/[„“”"]/g, "'")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9/?:().,'+\- ]/g, " ").replace(/\s+/g, " ").trim();
  return ersetzt.slice(0, max).trim() || "-";
}

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;").replace(/"/g, "&quot;");
}

export type SepaAuftraggeber = { name: string; iban: string; bic: string | null };

// Die pain.001.001.09-Datei: eine Zahlung je Beleg, keine Sammelbuchung (jede Überweisung steht einzeln auf dem
// Kontoauszug und lässt sich dort dem Beleg zuordnen). Ohne eigene BIC „NOTPROVIDED“ (IBAN-only, in SEPA zulässig).
export function sepaXml(a: Pick<FinZahlauftrag, "msg_id" | "erstellt_am" | "ausfuehrung">, posten: readonly FinZahlauftragPosten[], von: SepaAuftraggeber): string {
  const summe = cent(posten.reduce((s, p) => s + p.betrag, 0)).toFixed(2);
  const name = xml(sepaText(von.name, 70));
  const agent = (bic: string | null) => (bic ? `<FinInstnId><BICFI>${xml(bic)}</BICFI></FinInstnId>` : "<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>");
  const zeilen = posten.map((p) => [
    "<CdtTrfTxInf>",
    `<PmtId><EndToEndId>${xml(sepaText(p.e2e, 35))}</EndToEndId></PmtId>`,
    `<Amt><InstdAmt Ccy="EUR">${cent(p.betrag).toFixed(2)}</InstdAmt></Amt>`,
    p.bic ? `<CdtrAgt>${agent(p.bic)}</CdtrAgt>` : "",
    `<Cdtr><Nm>${xml(sepaText(p.name, 70))}</Nm></Cdtr>`,
    `<CdtrAcct><Id><IBAN>${xml(p.iban)}</IBAN></Id></CdtrAcct>`,
    `<RmtInf><Ustrd>${xml(sepaText(p.zweck, 140))}</Ustrd></RmtInf>`,
    "</CdtTrfTxInf>",
  ].join(""));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${FIN_SEPA_FORMAT}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    "<CstmrCdtTrfInitn>",
    `<GrpHdr><MsgId>${xml(a.msg_id)}</MsgId><CreDtTm>${a.erstellt_am.slice(0, 19)}</CreDtTm><NbOfTxs>${posten.length}</NbOfTxs>`
      + `<CtrlSum>${summe}</CtrlSum><InitgPty><Nm>${name}</Nm></InitgPty></GrpHdr>`,
    `<PmtInf><PmtInfId>${xml(a.msg_id)}-1</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>false</BtchBookg><NbOfTxs>${posten.length}</NbOfTxs>`
      + `<CtrlSum>${summe}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>`
      + `<ReqdExctnDt><Dt>${a.ausfuehrung.slice(0, 10)}</Dt></ReqdExctnDt>`
      + `<Dbtr><Nm>${name}</Nm></Dbtr><DbtrAcct><Id><IBAN>${xml(von.iban)}</IBAN></Id></DbtrAcct><DbtrAgt>${agent(von.bic)}</DbtrAgt>`
      + "<ChrgBr>SLEV</ChrgBr>",
    ...zeilen,
    "</PmtInf>",
    "</CstmrCdtTrfInitn>",
    "</Document>",
    "",
  ].join("\n");
}

export function sepaDateiname(a: Pick<FinZahlauftrag, "ausfuehrung" | "msg_id">): string {
  return `SEPA-Ueberweisungen_${a.ausfuehrung.slice(0, 10)}_${a.msg_id.slice(-8)}.xml`;
}
