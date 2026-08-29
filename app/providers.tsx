"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Zwischenspeicher für alle Datenabfragen (Roadmap Phase 10, siehe lib/queries/hooks.ts).
//
// Der QueryClient wird in einem useState-Initialisierer erzeugt, nicht als Modul-Konstante:
// so gehört er zur Komponenteninstanz und kann sich zwischen zwei Server-Anfragen nicht
// versehentlich Daten teilen.
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Fehler werden zentral angezeigt (siehe app/page.tsx), nicht stillschweigend
            // wiederholt. Ein einziger erneuter Versuch fängt kurze Netzaussetzer ab.
            retry: 1,
            // Beim Zurückkehren ins Fenster nicht automatisch neu laden – die Anwendung wird
            // im Außendienst am Handy benutzt, dort ist jeder unnötige Abruf teuer.
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
