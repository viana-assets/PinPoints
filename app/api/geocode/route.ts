import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

// Serverseitige Geokodierung (Roadmap Phase 8, Review-Befund A9).
//
// Vorher rief der Browser jedes Nutzers Nominatim/OpenStreetMap direkt auf und schickte dabei
// die vollständige Kundenadresse an einen Dritten – ohne Vertrag, ohne den von Nominatim
// geforderten identifizierenden User-Agent und ohne die vorgeschriebene Drosselung auf eine
// Anfrage pro Sekunde. Beim Import echter Bestandskunden wäre das ein Massen-Geocoding gegen
// die Nutzungsbedingungen gewesen.
//
// Jetzt: nur eingeloggte Nutzer, ein Aufruf pro Sekunde, identifizierender User-Agent, und
// jedes Ergebnis landet in `geocode_cache` (Migration 17). Dieselbe Adresse wird dadurch nie
// zweimal abgefragt – bei einem Bestand mit vielen Kunden aus derselben Straße ist das der
// größte Hebel.
//
// Bewusste Einschränkung: die Drosselung wirkt pro Server-Instanz. Auf Vercel können mehrere
// Instanzen parallel laufen, dann greift sie nicht global. Für den heutigen Betrieb (einzelne
// Adressen bei der Kundenanlage) reicht das; für einen Massenimport gehört ein echter,
// zentraler Warteschlangen-Lauf gebaut (siehe docs/roadmap.md Phase 10).

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "VianaPinPoints/1.0 (Kontakt: vhermann@samhammer.de)";
const MIN_ABSTAND_MS = 1100;

let letzterAufruf = 0;

async function drosseln() {
  const wartezeit = letzterAufruf + MIN_ABSTAND_MS - Date.now();
  if (wartezeit > 0) await new Promise((r) => setTimeout(r, wartezeit));
  letzterAufruf = Date.now();
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const anfrage = body && typeof body.query === "string" ? body.query.trim() : "";
  if (!anfrage) {
    return NextResponse.json({ error: "Keine Adresse übergeben." }, { status: 400 });
  }
  if (anfrage.length > 300) {
    return NextResponse.json({ error: "Adresse zu lang." }, { status: 400 });
  }

  const schluessel = anfrage.toLowerCase().replace(/\s+/g, " ");

  const { data: treffer } = await supabase
    .from("geocode_cache")
    .select("lat, lng, gefunden")
    .eq("query", schluessel)
    .maybeSingle();

  if (treffer) {
    return NextResponse.json(treffer.gefunden ? { lat: treffer.lat, lng: treffer.lng } : { lat: null, lng: null });
  }

  await drosseln();

  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(anfrage)}`;
    const resp = await fetch(url, {
      headers: { "Accept-Language": "de", "User-Agent": USER_AGENT },
      // Kein Weiterreichen von Cookies o. ä. an den Drittdienst.
      cache: "no-store",
    });
    if (!resp.ok) {
      return NextResponse.json({ error: "Der Kartendienst hat nicht geantwortet." }, { status: 502 });
    }
    const daten = await resp.json();
    if (Array.isArray(daten) && daten.length > 0) {
      lat = parseFloat(daten[0].lat);
      lng = parseFloat(daten[0].lon);
    }
  } catch {
    return NextResponse.json({ error: "Der Kartendienst war nicht erreichbar." }, { status: 502 });
  }

  // Auch ein Nicht-Treffer wird gemerkt, damit dieselbe unauffindbare Adresse nicht bei jedem
  // Speichern erneut nach draußen geht.
  await supabase
    .from("geocode_cache")
    .upsert({ query: schluessel, lat, lng, gefunden: lat !== null }, { onConflict: "query" });

  return NextResponse.json({ lat, lng });
}
