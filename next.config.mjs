/** @type {import('next').NextConfig} */

// Sicherheits-Header (Roadmap Phase 8, Review-Befund A6). Vorher lieferte die App gar keine –
// die Seite ließ sich in einen fremden Rahmen einbetten (Clickjacking), und es gab keine
// Beschränkung, von wo Skripte geladen werden dürfen.
//
// Die Content-Security-Policy steht seit v106 NICHT mehr hier, sondern in lib/csp.ts und wird in
// proxy.ts gesetzt (Fahrplan B4): mit einer Nonce je Aufruf statt `'unsafe-inline'`. Eine feste
// Zeile in dieser Datei kann keine Zufallszahl je Aufruf tragen – und zwei CSP-Kopfzeilen
// nebeneinander würden vom Browser BEIDE angewandt.

const securityHeaders = [
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
