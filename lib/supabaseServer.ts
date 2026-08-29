// Schutzschild: dieser Import lässt den Build fehlschlagen, sobald diese Datei versehentlich
// aus einer Client-Komponente heraus importiert wird. Sie enthält mit createAdminClient() den
// Service-Role-Key-Pfad und war bisher nur durch Konvention serverseitig (Review-Befund A7).
import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Server-seitiger Supabase-Client für Server Components / Route Handler,
// liest/schreibt die Auth-Session über Cookies.
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // In Server Components darf nicht geschrieben werden – wird
            // vom Middleware-Refresh übernommen.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {}
        },
      },
    }
  );
}

// Admin-Client mit Service-Role-Key: NUR in serverseitigen Route Handlern
// verwenden (z.B. für Einladungen), NIE ins Client-Bundle gelangen lassen.
export function createAdminClient() {
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
