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
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
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
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig = {
  reactStrictMode: true,
  // Verrät nicht mehr die eingesetzte Next.js-Version.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
