import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { DEFAULT_MAP_CENTER } from "@/lib/mapStyles";

// Adressvorschläge beim Tippen und für die Korrekturliste (Migration 25).
//
// WARUM EIN ZWEITER DIENST NEBEN NOMINATIM
// ----------------------------------------
// Nominatim (siehe ../geocode/route.ts) bleibt zuständig für die eine Frage „welche Koordinate
// hat genau diese Adresse". Für Vorschläge taugt es aus zwei Gründen nicht:
//
//   1. Die Nutzungsbedingungen von Nominatim untersagen Autovervollständigung ausdrücklich –
//      jeder Tastendruck eine Anfrage ist genau die Last, gegen die sie sich wehren.
//   2. Es ist nicht tippfehlertolerant. „Rehhostraße" liefert nichts; die Straße heißt
//      „Rehhofstraße". Genau solche Fälle sind der Anlass für diese Route: von 422
//      importierten Altkunden ließen sich rund 130 nicht auf der Karte verorten.
//
// Photon ist von komoot für diesen Zweck gebaut (Elasticsearch über denselben
// OpenStreetMap-Daten), kostenlos und fehlertolerant. Es ist damit ein weiterer Dritter, an
// den Adressbruchstücke gehen – zu behandeln wie Nominatim, siehe docs/kunden-und-karte.md.
//
// WAS DIESE ROUTE SCHÜTZT
// -----------------------
//   * nur angemeldete Nutzer (sonst wäre sie ein offener Geocoding-Dienst auf fremde Kosten),
//   * Mindest- und Höchstlänge der Eingabe,
//   * Drosselung je Server-Instanz,
//   * Zwischenspeicher: dieselbe Eingabe geht nie zweimal nach draußen,
//   * keine Weitergabe von Cookies oder Kundendaten – nur die Sucheingabe selbst.

const PHOTON = "https://photon.komoot.io/api/";
const USER_AGENT = "VianaPinPoints/1.0 (Kontakt: vhermann@samhammer.de)";

// Kürzer als die 1100 ms bei Nominatim: Photon ist für Tippabfragen gedacht und verlangt keine
// Sekundenpause. Ganz ohne Bremse bliebe die Route aber ein offenes Scheunentor, sobald jemand
// sie in einer Schleife aufruft.
const MIN_ABSTAND_MS = 250;

// Unter drei Zeichen ergibt eine Adresssuche nur Rauschen und kostet einen Fremdaufruf.
const MIN_LAENGE = 3;
const MAX_LAENGE = 200;
const MAX_TREFFER = 6;

let letzterAufruf = 0;

async function drosseln() {
  const wartezeit = letzterAufruf + MIN_ABSTAND_MS - Date.now();
  if (wartezeit > 0) await new Promise((r) => setTimeout(r, wartezeit));
  letzterAufruf = Date.now();
}

export type Adressvorschlag = {
  label: string;      // fertige Adresszeile, genau so wie sie ins Adressfeld geschrieben wird
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  lat: number;
  lng: number;
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
};

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

// Aus einem Photon-Treffer die Adresszeile bauen, die diese App überall verwendet:
// "Straße Hausnummer, PLZ Ort". Treffer ohne Straße (Orte, Gewässer, Sehenswürdigkeiten)
// fallen heraus – als Kundenadresse taugen sie nicht.
function alsVorschlag(f: PhotonFeature): Adressvorschlag | null {
  const p = f.properties || {};
  const koord = f.geometry?.coordinates;
  if (!Array.isArray(koord) || koord.length < 2) return null;

  const strasse = text(p.street) || text(p.name);
  const ort = text(p.city) || text(p.town) || text(p.village) || text(p.county);
  const plz = text(p.postcode);
  if (!strasse || !ort) return null;

  const hausnummer = text(p.housenumber);
  const zeile1 = [strasse, hausnummer].filter(Boolean).join(" ");
  const zeile2 = [plz, ort].filter(Boolean).join(" ");
  return {
    label: [zeile1, zeile2].filter(Boolean).join(", "),
    strasse, hausnummer, plz, ort,
    lng: koord[0], lat: koord[1],
  };
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const anfrage = body && typeof body.query === "string" ? body.query.trim() : "";
  if (anfrage.length < MIN_LAENGE) return NextResponse.json({ treffer: [] });
  if (anfrage.length > MAX_LAENGE) return NextResponse.json({ error: "Eingabe zu lang." }, { status: 400 });

  const schluessel = anfrage.toLowerCase().replace(/\s+/g, " ");

  const { data: gemerkt } = await supabase
    .from("adressvorschlag_cache")
    .select("treffer")
    .eq("query", schluessel)
    .maybeSingle();
  if (gemerkt) return NextResponse.json({ treffer: gemerkt.treffer });

  await drosseln();

  let treffer: Adressvorschlag[] = [];
  try {
    // Die Gewichtung auf den Kartenmittelpunkt sorgt dafür, dass bei "Hauptstraße" die
    // Nürnberger zuerst kommt und nicht eine gleichnamige in Schleswig-Holstein. Der
    // Mittelpunkt kommt aus derselben Konstante wie die Karte (Konstanten-Regel).
    const [lat, lon] = DEFAULT_MAP_CENTER;
    const url = `${PHOTON}?q=${encodeURIComponent(anfrage)}&lang=de&limit=${MAX_TREFFER}`
      + `&lat=${lat}&lon=${lon}&location_bias_scale=0.4`;
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!resp.ok) return NextResponse.json({ error: "Der Kartendienst hat nicht geantwortet." }, { status: 502 });
    const daten = await resp.json();
    const merkmale: PhotonFeature[] = Array.isArray(daten?.features) ? daten.features : [];
    const gesehen = new Set<string>();
    treffer = merkmale
      .map(alsVorschlag)
      .filter((v): v is Adressvorschlag => v !== null)
      // Photon liefert dieselbe Straße gern mehrfach (einmal je OSM-Abschnitt). Doppelte
      // Zeilen in einer Vorschlagsliste sehen nach Fehler aus, auch wenn sie keiner sind.
      .filter((v) => (gesehen.has(v.label) ? false : (gesehen.add(v.label), true)));
  } catch {
    return NextResponse.json({ error: "Der Kartendienst war nicht erreichbar." }, { status: 502 });
  }

  // Auch eine leere Liste wird gemerkt: eine Eingabe, zu der es nichts gibt, soll nicht bei
  // jedem Tastendruck erneut nach draußen gehen.
  await supabase
    .from("adressvorschlag_cache")
    .upsert({ query: schluessel, treffer }, { onConflict: "query" });

  return NextResponse.json({ treffer });
}
