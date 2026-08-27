"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

// Supabase-Einladungs-/Recovery-Links liefern die Session als Tokens im
// URL-Fragment (#access_token=...), nicht als ?code=... . Fragmente werden
// vom Browser nie an den Server geschickt, deshalb kann das nur clientseitig
// verarbeitet werden - unabhängig davon, auf welcher Seite die Tokens
// landen (z.B. wenn die Supabase-Konsole direkt auf die Site-URL verweist).
export default function HashSessionHandler() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.substring(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const type = params.get("type");

    if (!access_token || !refresh_token) return;

    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      // Tokens aus der URL entfernen, bevor irgendetwas anderes passiert.
      window.history.replaceState(null, "", window.location.pathname);
      if (!error) {
        if (type === "invite" || type === "recovery") {
          router.replace("/auth/set-password");
        } else {
          router.replace("/");
        }
        router.refresh();
      }
    });
  }, [router]);

  return null;
}
