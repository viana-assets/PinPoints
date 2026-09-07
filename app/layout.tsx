import "./globals.css";
// Leaflet wird seit Roadmap-Phase 8 als npm-Paket gebündelt statt von cdnjs geladen: das
// frühere <script>/<link> auf ein fremdes CDN hatte kein integrity-Attribut, ein
// kompromittiertes Skript hätte mit vollen Rechten in jeder Sitzung laufen und den
// Supabase-Token abgreifen können (Review-Befund A6). Das JavaScript selbst lädt
// app/page.tsx bei Bedarf per dynamischem Import – nur das Stylesheet gehört hierher.
import "leaflet/dist/leaflet.css";
import HashSessionHandler from "./auth/HashSessionHandler";
import { Providers } from "./providers";
import { MARKE_FAVICON } from "@/components/icons";
import { PwaBereit } from "@/components/PwaBereit";
import type { Viewport } from "next";

export const metadata = {
  title: "Viana PinPoints",
  description: "Kunden, Termine und Aufträge im mobilen Reifenservice",
  // Macht die Anwendung installierbar (docs/pwa-plan.md, Stufe 1).
  manifest: "/manifest.webmanifest",
  // iOS liest weder Name noch Symbol aus dem Manifest – dafür sind diese Angaben da.
  // `statusBarStyle: "default"` ist bewusst gewählt: bei "black-translucent" rutscht der
  // Inhalt unter die Statusleiste und müsste überall um env(safe-area-inset-top) versetzt
  // werden. Das ist eine ganze Klasse von Fehlern, die wir uns hier sparen.
  appleWebApp: { capable: true, title: "PinPoints", statusBarStyle: "default" as const },
  icons: { apple: "/apple-touch-icon.png" },
};

// Eigener Export statt eines <meta>-Elements im Kopf: Next.js setzt beides zusammen und
// warnt, wenn man ihm dabei ins Handwerk pfuscht. `viewportFit: "cover"` lässt die Seite im
// installierten Zustand bis an die Bildschirmkanten laufen – die Navigationsleiste unten
// fängt den Bereich der Home-Anzeige über env(safe-area-inset-bottom) ab (globals.css).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F2EFE9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        {/* Bildmarke statt der früheren Flagge: nur der grüne Zielpunkt mit Haken, weil zwei
            Pins nebeneinander bei 16 px unleserlich wären. Der data:-URI wird aus denselben
            Konstanten gebaut wie die Marke selbst (components/icons.tsx), damit es keine
            zweite, still veraltende Kopie des Logos gibt. */}
        <link rel="icon" type="image/svg+xml" href={MARKE_FAVICON} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Karla:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <HashSessionHandler />
        <PwaBereit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
