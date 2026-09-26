/** @type {import('next').NextConfig} */

// Sicherheits-Header (Roadmap Phase 8, Review-Befund A6). Vorher lieferte die App gar keine –
// die Seite ließ sich in einen fremden Rahmen einbetten (Clickjacking), und es gab keine
// Beschränkung, von wo Skripte geladen werden dürfen.
//
// Zur CSP: `script-src` erlaubt bewusst 'unsafe-inline', weil Next.js seinen Bootstrap-Code
// als Inline-Skript einbettet. Der Gewinn liegt trotzdem im Ausschluss FREMDER Skript-Hosts:
// seit Leaflet als npm-Paket gebündelt wird (statt von cdnjs zu kommen), kann kein externes
// CDN mehr Code in die Sitzung einschleusen. Eine strengere, nonce-basierte CSP wäre der
// nächste Schritt – sie braucht eine Nonce-Erzeugung in middleware.ts und ist deshalb bewusst
// noch nicht Teil dieser Phase.
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  // 'unsafe-eval' nur in der Entwicklung (React Refresh / Fast Refresh braucht es).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Kartenkacheln: OpenStreetMap (Straße) und Esri/ArcGIS (Satellit) – siehe lib/mapStyles.ts.
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com",
  // Supabase (REST + Realtime). Die Geokodierung läuft seit Phase 8 über die eigene Route
  // /api/geocode, deshalb steht Nominatim hier bewusst NICHT mehr.
  // Neben Supabase stehen hier die Schrift-Hosts – und zwar wegen des Service Workers.
  // Befund vom 14.09.2026 aus der Browser-Konsole: Der Worker fängt die Schriftanfragen ab
  // (public/sw.js, SCHRIFT_HOSTS) und holt sie mit `fetch`. Ein fetch AUS dem Worker heraus
  // ist ein Verbindungsaufbau und fällt damit unter `connect-src` – nicht unter `style-src`
  // oder `font-src`, die beide längst offen waren. Ergebnis: Die Anfrage wurde blockiert, der
  // Worker warf einen unbehandelten Fehler, und die App lief still in Ersatzschriften statt in
  // Outfit und Karla. Ein Fehler, den man nur in der Konsole sieht – und an der Typografie,
  // wenn man weiß, wonach man schaut.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Kamera und Standort seit v79 für die eigene Seite erlaubt (`self`), fremde Rahmen bleiben
  // ausgeschlossen, und die Freigabe selbst erteilt weiterhin der Nutzer im Browser.
  //  - Standort: der Knopf „Mein Standort" auf der Karte. Der Standort wird nirgends gespeichert.
  //  - Kamera: der QR-Scanner in Lager und Einlagerung (components/QrScanner.tsx). Mit
  //    `camera=()` lehnte der Browser getUserMedia ab, BEVOR er den Nutzer fragen konnte – der
  //    Scanner meldete „Kein Zugriff auf die Kamera", und eine Erlaubnis im Browser half nicht.
  //    Gefunden am 26.09.2026 beim Standortknopf, der an derselben Zeile scheiterte.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig = {
  reactStrictMode: true,
  // Verrät nicht mehr die eingesetzte Next.js-Version.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Der Service Worker darf NIE aus dem Browser-Zwischenspeicher kommen. Sonst prüft das
      // Handy beim Start zwar pflichtgemäß auf eine neue Fassung, bekommt dabei aber die alte
      // Datei aus dem eigenen Speicher zurück – und die App bleibt beliebig lange auf einem
      // Stand von vor Wochen stehen, ohne dass irgendwo ein Fehler auftaucht. Genau das ist am
      // 10.09.2026 passiert (siehe docs/pwa-plan.md).
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
