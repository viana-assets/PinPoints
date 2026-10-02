// Geokodierung über die eigene, gedrosselte Route /api/geocode (CLAUDE.md, Abschnitt 5).
//
// Bis v105 Teil von lib/helpers.ts (Fahrplan C5, v106: die Datei war auf über 1.100 Zeilen
// gewachsen). lib/helpers.ts reicht alles hier weiter, damit bestehende Importe gültig bleiben;
// neuer Code importiert direkt aus dieser Datei.

import { adresseOhneHausnummer, plzAus } from "./adresse";

// Region, die an eine Adresse ohne erkennbaren Stadtnamen angehängt wird, damit die
// kostenlose Nominatim/OpenStreetMap-Geokodierung eindeutige Treffer liefert – zentral hier
// benannt statt als literaler String in der Funktion (siehe docs/konstanten-register.md).
// Wächst das Geschäft über die Region hinaus, hier anpassen (perspektivisch: Einstellung
// statt Code-Konstante, siehe docs/roadmap.md).
export const DEFAULT_GEOCODE_REGION = "Nürnberg, Deutschland";

// Vergleich ohne Umlaute, damit "Nürnberg" und "Nuernberg" gleich behandelt werden – und
// damit der Stadtname NICHT ein zweites Mal als Literal im Code steht, sondern aus
// DEFAULT_GEOCODE_REGION abgeleitet wird (Konstanten-Regel, siehe docs/README.md).
function ohneUmlaute(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

// Geokodierung läuft seit Roadmap-Phase 8 über die eigene Serverroute /api/geocode statt
// direkt aus dem Browser gegen Nominatim: dort sitzen Zugriffsschutz, Drosselung, ein
// identifizierender User-Agent und ein Cache (Review-Befund A9). Signatur und Verhalten
// bleiben für die Aufrufer unverändert – null bedeutet weiterhin "keine Position gefunden",
// eine Ausnahme bedeutet "Dienst nicht erreichbar".
// Die Anfrage, die an den Kartendienst geht – und die Stelle, an der bis zum 14.09.2026 ein
// stiller Fehler saß.
//
// Die Absicht war gut: Steht in der Adresse kein Ort, hilft „, Nürnberg, Deutschland" dem
// Dienst auf die Sprünge. Die Bedingung war aber „enthält NICHT das Wort Nürnberg" – und
// damit bekam jede Adresse aus dem Umland diesen Zusatz:
//
//     „Strengenbergstraße 54, 90607 Rückersdorf"  →  „…, 90607 Rückersdorf, Nürnberg, Deutschland"
//
// Das ist ein Widerspruch: Rückersdorf liegt nicht in Nürnberg. Der Dienst findet daraufhin
// gar nichts – auch die Straße allein nicht. Betroffen war der halbe Umkreis: Rückersdorf,
// Zirndorf, Fürth, Schwabach, Büchenbach, Wendelstein, Heroldsberg. Genau die Kunden, die
// unter „Ohne Karte" hängen blieben, während die Adressprüfung daneben die Straße mühelos
// vorschlug – die fragt nämlich einen anderen Dienst, ohne diesen Zusatz.
//
// Die richtige Frage ist nicht „steht Nürnberg drin?", sondern „steht überhaupt ein Ort
// drin?". Eine Postleitzahl beantwortet das eindeutig: Wo eine steht, ist der Ort bestimmt,
// und jeder Zusatz kann die Sache nur verschlechtern.
export function geocodeAnfrage(address: string): string {
  const stadt = DEFAULT_GEOCODE_REGION.split(",")[0].trim();
  if (plzAus(address)) return address;
  if (ohneUmlaute(address).includes(ohneUmlaute(stadt))) return address;
  return address + ", " + DEFAULT_GEOCODE_REGION;
}

// Die Adressdienste sind gebremst (Migration 62, lib/fremdabfrage.ts). Eine eigene Fehlerart,
// damit ein Lauf über viele Adressen (GeokodierLauf) warten und weitermachen kann, statt die
// Adresse als Fehler zu zählen.
export class ZuVieleAbfragen extends Error {
  constructor(text: string) { super(text); this.name = "ZuVieleAbfragen"; }
}
async function fehlertextAus(resp: Response): Promise<string> {
  const daten = await resp.json().catch(() => null);
  return typeof daten?.error === "string" ? daten.error : "Zu viele Adressabfragen in kurzer Zeit.";
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; genauigkeit: "exakt" | "ungefaehr" } | null> {
  const ergaenzen = geocodeAnfrage;

  const resp = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: ergaenzen(address),
      // Der Rückfallweg wird HIER gebildet und nicht auf dem Server: Was eine Hausnummer ist,
      // weiß `hausnummerAus()`, und diese Regel soll es genau einmal geben (sie entscheidet
      // auch in der Adressprüfung, ob ein Vorschlag ärmer ist als die vorhandene Adresse).
      ohneHausnummer: (() => {
        const kurz = adresseOhneHausnummer(address);
        return kurz ? ergaenzen(kurz) : null;
      })(),
    }),
  });
  if (resp.status === 429) throw new ZuVieleAbfragen(await fehlertextAus(resp));
  if (!resp.ok) throw new Error("Geocoding fehlgeschlagen");
  const data = await resp.json();
  if (data == null || data.lat == null || data.lng == null) return null;
  return {
    lat: data.lat as number,
    lng: data.lng as number,
    genauigkeit: data.genauigkeit === "ungefaehr" ? "ungefaehr" : "exakt",
  };
}
