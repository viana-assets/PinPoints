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
import { ERSCHEINUNG } from "@/lib/erscheinung";

export const metadata = {
  title: `${ERSCHEINUNG.name} · Mobiler Reifenservice`,
  description: ERSCHEINUNG.beschreibung,
  // Macht die Anwendung installierbar (docs/pwa-plan.md, Stufe 1).
  manifest: "/manifest.webmanifest",
  // iOS liest weder Name noch Symbol aus dem Manifest – dafür sind diese Angaben da.
  // `statusBarStyle: "default"` ist bewusst gewählt: bei "black-translucent" rutscht der
  // Inhalt unter die Statusleiste und müsste überall um env(safe-area-inset-top) versetzt
  // werden. Das ist eine ganze Klasse von Fehlern, die wir uns hier sparen.
  //
  // Name und Symbol auf dem Homescreen kommen aus `lib/erscheinung.ts` – dort steht auch, warum
  // sie bis v87 „Settings" lauteten. Der Browser-Reiter trägt seit v88 „MR Assistent · Mobiler
  // Reifenservice".
  appleWebApp: { capable: true, title: ERSCHEINUNG.appleTitel, statusBarStyle: "default" as const },
  icons: { apple: ERSCHEINUNG.appleSymbol },
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
        {/* Das Signet des Mobilen Reifenservice (v88), als kleines Bild – die Vektorfassung ist
            mit 64 kB zu schwer für ein Favicon. */}
        <link rel="icon" type="image/png" href={MARKE_FAVICON} />
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
