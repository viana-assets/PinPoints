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

export const metadata = {
  title: "Viana PinPoints",
  description: "Viana PinPoints",
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <HashSessionHandler />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
