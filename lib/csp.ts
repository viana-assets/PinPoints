// Die Content-Security-Policy (Roadmap Phase 8, Befund A6; seit v106 mit Nonce, Fahrplan B4).
//
// Bis v105 stand hier – damals in next.config.mjs – `script-src 'self' 'unsafe-inline'`: Next.js
// bettet seinen Startcode als Inline-Skript ein, und ohne Nonce war das die einzige Erlaubnis, die
// ihn durchließ. Sie ließ aber auch JEDES andere Inline-Skript durch – genau das, was eine CSP gegen
// eingeschleusten Code verhindern soll.
//
// Jetzt erzeugt proxy.ts je Seitenaufruf eine Zufallszahl (Nonce) und setzt sie hier ein. Next.js
// liest sie aus dem Kopffeld der Anfrage und hängt sie an alle eigenen Skripte; ein Skript ohne die
// Zahl des aktuellen Aufrufs läuft nicht. `'strict-dynamic'` erlaubt, was ein solches Skript
// nachlädt (die Programmteile, Leaflet beim Öffnen der Karte). `'self'` bleibt für Browser, die
// `'strict-dynamic'` nicht kennen – moderne Browser ignorieren es neben einer Nonce.
//
// Dafür muss jede Seite beim Aufruf erzeugt werden (`dynamic = "force-dynamic"` in app/layout.tsx):
// Eine beim Bauen vorgefertigte Seite kennt die Zahl des Aufrufs nicht und bliebe weiß.
//
// Die übrigen Zeilen sind unverändert aus next.config.mjs übernommen, samt ihren Begründungen.
// Geprüft in tests/csp.test.ts.

export function cspKopf(nonce: string | null, { dev = false }: { dev?: boolean } = {}): string {
  const skripte = nonce
    // 'unsafe-eval' nur in der Entwicklung (React Refresh / Fast Refresh braucht es).
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`
    // Ohne Nonce (Service Worker, Offline-Seite – Dateien, die nicht durch proxy.ts laufen): gar
    // kein Inline-Skript. Beide haben keins.
    : `script-src 'self'${dev ? " 'unsafe-eval'" : ""}`;
  return [
    "default-src 'self'",
    skripte,
    // Stile bleiben mit 'unsafe-inline': React schreibt `style={…}` als Attribut, und dafür gibt es
    // keine Nonce. Ein eingeschleuster Stil kann nichts ausführen.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Kartenkacheln: OpenStreetMap (Straße) und Esri/ArcGIS (Satellit) – siehe lib/mapStyles.ts.
    // Seit v105 auch Supabase: Fotos und Unterschrift am Auftrag (E3) kommen als zeitlich
    // begrenzte Links aus dem privaten Speicher (`…supabase.co/storage/v1/object/sign/…`).
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.supabase.co",
    // Supabase (REST + Realtime). Die Geokodierung läuft seit Phase 8 über die eigene Route
    // /api/geocode, deshalb steht Nominatim hier bewusst NICHT.
    // Die Schrift-Hosts stehen hier wegen des Service Workers: Er holt die Schriften mit `fetch`,
    // und ein fetch aus dem Worker fällt unter `connect-src` (Befund 14.09.2026).
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

// 16 Zufallsbytes als Base64 – je Aufruf neu. `crypto.getRandomValues` gibt es in der Edge- wie in
// der Node-Laufzeit.
export function neueNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
