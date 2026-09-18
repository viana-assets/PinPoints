import type { MetadataRoute } from "next";
import { ERSCHEINUNG } from "@/lib/erscheinung";

// Das Manifest wird erzeugt statt als feste Datei ausgeliefert (18.09.2026).
//
// Vorher lag es als `public/manifest.webmanifest` daneben – und damit hätte der Name der
// Anwendung an ZWEI Stellen gestanden: einmal dort und einmal in `app/layout.tsx` für iOS.
// Zwei Stellen für eine Entscheidung heißt: Beim Zurückstellen wird eine davon vergessen, und
// dann heißt die App auf dem einen Telefon „Settings" und auf dem anderen „PinPoints".
//
// Hier kommt beides aus `lib/erscheinung.ts`.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: ERSCHEINUNG.name,
    short_name: ERSCHEINUNG.kurzname,
    description: ERSCHEINUNG.beschreibung,
    lang: "de",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F2EFE9",
    theme_color: "#F2EFE9",
    icons: [
      { src: ERSCHEINUNG.symbol192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ERSCHEINUNG.symbol512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: ERSCHEINUNG.symbolMaskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
