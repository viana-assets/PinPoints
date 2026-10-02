import type { Betrieb, Customer, Order } from "./types";
import { telefonVergleich } from "./telefon";

// Terminbestätigung an den Kunden (Fahrplan E9, v104).
//
// Entschieden am 02.10.2026: KEIN eigener Versanddienst. Die App bereitet den Text vor, das Büro
// (oder der Techniker) schickt ihn mit dem eigenen Telefon oder Postfach ab – per E-Mail, SMS oder
// WhatsApp. Damit gibt es keinen weiteren Dienstleister, keine Absenderadresse, die eingerichtet
// werden müsste, und der Kunde antwortet dorthin, wo er den Betrieb ohnehin kennt.
//
// Diese Datei baut den Text und die Links. Reine Funktionen, geprüft in tests/terminBestaetigung.test.ts.

export type BestaetigungArt = "bestaetigung" | "erinnerung";

export const BESTAETIGUNG_ART_LABEL: Record<BestaetigungArt, string> = {
  bestaetigung: "Bestätigung",
  erinnerung: "Erinnerung",
};

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

// „Montag, 5. Oktober 2026"
export function datumLang(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  const d = new Date(j, m - 1, t);
  const monat = d.toLocaleDateString("de-DE", { month: "long" });
  return `${WOCHENTAGE[d.getDay()]}, ${t}. ${monat} ${j}`;
}

function uhr(t: string | null | undefined): string | null {
  const s = (t ?? "").trim();
  return s ? s.slice(0, 5) : null;
}

// „Guten Tag Herr Muster," – mit Anrede der Nachname, ohne Anrede der ganze Name.
export function anredeZeile(k: Pick<Customer, "anrede" | "name">): string {
  const name = k.name.trim();
  if (k.anrede && name) {
    const nachname = name.includes(",") ? name.split(",")[0].trim() : name.split(/\s+/).slice(-1)[0];
    return `Guten Tag ${k.anrede} ${nachname},`;
  }
  return name ? `Guten Tag ${name},` : "Guten Tag,";
}

export type BestaetigungDaten = {
  art: BestaetigungArt;
  auftrag: Pick<Order, "order_date" | "time" | "end_time">;
  // Der Kunde, wie ihn `kundeFuerAuftrag` liefert – bei der Laufkundschaft der Laufkunde.
  kunde: Pick<Customer, "anrede" | "name" | "address">;
  // Kennzeichen der Fahrzeuge am Auftrag.
  kennzeichen: string[];
  betrieb: Pick<Betrieb, "firma" | "telefon"> | null;
  // Für die Erinnerung: Ist der Termin heute oder morgen, heißt es so.
  heute: string;
};

export function bestaetigungText(d: BestaetigungDaten): string {
  const von = uhr(d.auftrag.time);
  const bis = uhr(d.auftrag.end_time);
  const wann = `${datumLang(d.auftrag.order_date)}${von ? `, ${bis ? `zwischen ${von} und ${bis} Uhr` : `um ${von} Uhr`}` : ""}`;
  const morgen = (() => {
    const [j, m, t] = d.heute.split("-").map(Number);
    const x = new Date(j, m - 1, t + 1);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  })();
  const wo = d.kunde.address.trim();
  const zeilen = [anredeZeile(d.kunde), ""];
  if (d.art === "bestaetigung") {
    zeilen.push(`hiermit bestätigen wir Ihren Termin am ${wann}${wo ? ` bei Ihnen in ${wo}` : ""}.`);
  } else {
    const wort = d.auftrag.order_date === d.heute ? "heute, " : d.auftrag.order_date === morgen ? "morgen, " : "am ";
    zeilen.push(`wir möchten Sie an Ihren Termin ${wort}${wann}${wo ? ` in ${wo}` : ""} erinnern.`);
  }
  if (d.kennzeichen.length > 0) zeilen.push(`Fahrzeug: ${d.kennzeichen.join(", ")}.`);
  zeilen.push("Bitte halten Sie den Fahrzeugschlüssel bereit.");
  zeilen.push(`Falls der Termin nicht passt, melden Sie sich bitte kurz${d.betrieb?.telefon?.trim() ? ` unter ${d.betrieb.telefon.trim()}` : ""}.`);
  zeilen.push("", "Viele Grüße");
  if (d.betrieb?.firma?.trim()) zeilen.push(d.betrieb.firma.trim());
  return zeilen.join("\n");
}

export function bestaetigungBetreff(d: Pick<BestaetigungDaten, "art" | "auftrag" | "betrieb">): string {
  const was = d.art === "bestaetigung" ? "Terminbestätigung" : "Terminerinnerung";
  const von = uhr(d.auftrag.time);
  const [j, m, t] = d.auftrag.order_date.split("-");
  return `${was} ${t}.${m}.${j}${von ? ` ${von} Uhr` : ""}${d.betrieb?.firma?.trim() ? ` – ${d.betrieb.firma.trim()}` : ""}`;
}

// Die Nummer für WhatsApp: nur Ziffern mit Ländervorwahl, ohne „+" (wa.me verlangt es so).
// Eine Nummer ohne Vorwahl ist für WhatsApp nicht eindeutig → null.
export function whatsappNummer(nummer: string | null | undefined): string | null {
  const v = telefonVergleich(nummer);
  return v && v.startsWith("+") && v.length >= 9 ? v.slice(1) : null;
}

export type Versandweg = "whatsapp" | "sms" | "email";

export function versandLink(weg: Versandweg, ziel: string | null | undefined, text: string, betreff: string): string | null {
  const t = encodeURIComponent(text);
  if (weg === "whatsapp") {
    const n = whatsappNummer(ziel);
    return n ? `https://wa.me/${n}?text=${t}` : null;
  }
  if (weg === "sms") {
    const n = telefonVergleich(ziel);
    // `?&body=` verstehen iOS und Android gleichermaßen.
    return n ? `sms:${n}?&body=${t}` : null;
  }
  const mail = (ziel ?? "").trim();
  return mail.includes("@") ? `mailto:${mail}?subject=${encodeURIComponent(betreff)}&body=${t}` : null;
}

// Die Mobilnummer zuerst – SMS und WhatsApp gehen nur ans Handy. Festnetz bleibt für den Anruf.
export function handynummer(k: Pick<Customer, "phone_mobile" | "phone_landline">): string | null {
  const m = (k.phone_mobile ?? "").trim();
  if (m) return m;
  // Eine 01…-Nummer im Festnetzfeld ist trotzdem ein Handy.
  const f = telefonVergleich(k.phone_landline);
  return f && /^\+491[5-7]/.test(f) ? (k.phone_landline ?? "").trim() : null;
}
