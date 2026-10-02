import type { BelegArt, Customer, OrderStatus, Saison } from "./types";
import { BELEG_ART_LABEL, ORDER_STATUS_LABEL, SAISON_LABEL } from "./constants";
import { auftragsNr } from "./testkunde";

// Der Auskunftsauszug je Kunde (Fahrplan E10, v103) – „was ist über mich gespeichert?"
// (Art. 15 DSGVO). Die Daten kommen in EINEM Abruf aus `kunde_auskunft()` (Migration 64); hier
// steht, wie daraus ein lesbarer Auszug wird. Reine Funktionen, geprüft in tests/auskunft.test.ts.
//
// Was NICHT hineingehört: die Einträge des Änderungsprotokolls. Sie enthalten frühere Fassungen
// derselben Daten und interne Kennungen; der Auszug nennt, wie viele es gibt und wie lange sie
// aufbewahrt werden (B1: geschwärzt nach 36 Monaten).

export type AuskunftDaten = {
  erstellt_am: string;
  kunde: Customer & Record<string, unknown>;
  betrieb: { firma: string; inhaber: string; strasse: string; plz: string; ort: string; telefon: string; email: string } | null;
  kontakte: { datum: string; notiz: string | null }[];
  fahrzeuge: { kennzeichen: string | null; modell: string | null; reifengroesse: string | null; notiz: string | null; angelegt: string }[];
  auftraege: {
    nummer: number; datum: string; uhrzeit: string | null; titel: string; beschreibung: string | null; status: OrderStatus;
    notiz: string | null; storno_grund: string | null; geloescht: boolean; rechnung_noetig: boolean;
    positionen: { menge: number; artikel: string | null; text: string | null; netto: number; endpreis: number | null }[];
    fahrzeuge: { kennzeichen: string | null; kilometerstand: number | null }[];
  }[];
  reifensaetze: {
    eingelagert: string; ausgelagert: string | null; saison: Saison | null; lager: string | null; platz: string | null;
    fahrzeug: string | null; dot: string | null; profil_mm: number | null; anzahl_raeder: number; notiz: string | null;
    raeder: { position: string | null; groesse: string | null; dot: string | null; profil_mm: number | null; felge: string | null; bemerkung: string | null }[];
  }[];
  rechnungen: { nummer: string; art: "rechnung" | "storno"; datum: string; netto: number; brutto: number }[];
  protokoll: { eintraege: number; aeltester: string | null; neuester: string | null };
  // Seit Migration 65 (E3, v105): Fotos und Unterschriften an den Aufträgen. Optional, weil eine
  // Datenbank vor Migration 65 das Feld nicht liefert.
  belege?: { auftrag: number; art: BelegArt; beschriftung: string | null; aufgenommen: string }[];
};

export type Zeile = [string, string];

function tag(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

function text(wert: unknown): string | null {
  if (wert === null || wert === undefined) return null;
  const s = String(wert).trim();
  return s ? s : null;
}

// Die Stammdaten als Zeilen „Feld – Wert". Nur gefüllte Felder: Ein Auszug, der zwanzig Zeilen
// „–" enthält, ist schwerer zu lesen und sagt nichts zusätzlich.
export function stammdatenZeilen(k: AuskunftDaten["kunde"]): Zeile[] {
  const zeilen: [string, string | null][] = [
    ["Kundennummer", k.kundennummer != null ? String(k.kundennummer) : null],
    ["Anrede", text(k.anrede)],
    ["Name", text(k.name)],
    ["Firma", text(k.company)],
    ["Anschrift", text(k.address)],
    ["Mobil", text(k.phone_mobile)],
    ["Festnetz", text(k.phone_landline)],
    ["E-Mail", text(k.email)],
    ["Notiz", text(k.note)],
    ["Kartenposition", k.lat != null && k.lng != null ? `${Number(k.lat).toFixed(5)}, ${Number(k.lng).toFixed(5)}` : null],
    ["Letzter Kontakt", k.last_contact ? tag(k.last_contact) : null],
    ["Wiedervorlage", k.wiedervorlage_am ? tag(k.wiedervorlage_am) : null],
    ["Angelegt am", typeof k.created_at === "string" ? tag(k.created_at) : null],
    ["Status", k.deleted_at ? "im Papierkorb" : k.active === false ? "deaktiviert" : "aktiv"],
  ];
  return zeilen.filter((z): z is Zeile => z[1] !== null);
}

export function auftragZeile(a: AuskunftDaten["auftraege"][number]): Zeile {
  const kopf = `${auftragsNr(a.nummer)} · ${tag(a.datum)}${a.uhrzeit ? " " + a.uhrzeit.slice(0, 5) : ""}`;
  const teile = [
    a.titel,
    ORDER_STATUS_LABEL[a.status] + (a.geloescht ? " (gelöscht)" : ""),
    a.fahrzeuge.length > 0 ? a.fahrzeuge.map((f) => [f.kennzeichen, f.kilometerstand != null ? `${f.kilometerstand.toLocaleString("de-DE")} km` : null].filter(Boolean).join(" ")).join(", ") : null,
    a.positionen.length > 0 ? a.positionen.map((p) => `${p.menge > 1 ? p.menge + "× " : ""}${p.text?.trim() || p.artikel || "Position"}`).join("; ") : null,
    text(a.beschreibung), text(a.notiz) ? `Notiz: ${a.notiz}` : null,
    text(a.storno_grund) ? `Storno: ${a.storno_grund}` : null,
  ];
  return [kopf, teile.filter(Boolean).join(" · ")];
}

export function satzZeile(s: AuskunftDaten["reifensaetze"][number]): Zeile {
  const kopf = `${tag(s.eingelagert)} – ${s.ausgelagert ? tag(s.ausgelagert) : "liegt noch"}`;
  const raeder = s.raeder.length > 0
    ? s.raeder.map((r) => [r.position, r.groesse, r.dot ? `DOT ${r.dot}` : null, r.profil_mm != null ? `${String(r.profil_mm).replace(".", ",")} mm` : null].filter(Boolean).join(" ")).join("; ")
    : null;
  const teile = [
    s.saison ? SAISON_LABEL[s.saison] : null,
    [s.lager, s.platz ? `Platz ${s.platz}` : null].filter(Boolean).join(" · ") || null,
    s.fahrzeug, `${s.anzahl_raeder} Räder`,
    s.dot ? `DOT ${s.dot}` : null,
    s.profil_mm != null ? `${String(s.profil_mm).replace(".", ",")} mm` : null,
    raeder, text(s.notiz),
  ];
  return [kopf, teile.filter(Boolean).join(" · ")];
}

// Ein Foto oder eine Unterschrift. Das Bild selbst steht nicht im Auszug – es liegt im privaten
// Speicher und wird auf Wunsch als Datei herausgegeben (docs/auftraege.md, „Fotos und Unterschrift").
export function belegZeile(b: NonNullable<AuskunftDaten["belege"]>[number]): Zeile {
  const was = b.art === "unterschrift"
    ? `Unterschrift${b.beschriftung ? ` (${b.beschriftung})` : ""}`
    : `Foto „${BELEG_ART_LABEL[b.art]}“${b.beschriftung ? ` – ${b.beschriftung}` : ""}`;
  return [`${auftragsNr(b.auftrag)} · ${tag(b.aufgenommen)}`, was];
}

// Wie viele Einträge in jedem Abschnitt stehen – für die Übersicht oben im Auszug.
export function auskunftUmfang(d: AuskunftDaten): Zeile[] {
  return [
    ["Kontakte", String(d.kontakte.length)],
    ["Fahrzeuge", String(d.fahrzeuge.length)],
    ["Aufträge", String(d.auftraege.length)],
    ["Reifensätze (eingelagert, auch frühere)", String(d.reifensaetze.length)],
    ["Rechnungen", String(d.rechnungen.length)],
    ...(d.belege ? [["Fotos und Unterschriften", String(d.belege.length)] as Zeile] : []),
    ["Einträge im Änderungsprotokoll", String(d.protokoll.eintraege)],
  ];
}

// Der Dateiname für Ausdruck und Datei. Ohne den Namen des Kunden: Dateinamen landen in Listen,
// Verläufen und Anhängen, wo niemand sie erwartet.
export function auskunftDateiname(d: Pick<AuskunftDaten, "erstellt_am" | "kunde">, endung: "pdf" | "json"): string {
  const nr = d.kunde.kundennummer != null ? String(d.kunde.kundennummer) : "ohne-nummer";
  return `auskunft-kd-${nr}-${d.erstellt_am.slice(0, 10)}.${endung}`;
}
