import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Schützt alle Seiten außer /login und /auth/callback: ohne gültige
// Supabase-Session wird auf /login umgeleitet. Damit gibt es keine
// öffentliche Registrierung – Zugang nur über einen Admin-Einladungslink.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const publicPaths = ["/login", "/auth"];
  const isPublic = publicPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  // Die PWA-Dateien müssen OHNE Anmeldung erreichbar sein. Ohne diese Ausnahmen liefert die
  // Middleware auf /sw.js eine Umleitung zur Anmeldeseite – der Browser lehnt die Anmeldung
  // des Service Workers dann ab (falscher Inhaltstyp), und zwar stillschweigend. Dasselbe
  // gilt für das Manifest, die Symbole und die Offline-Seite, die ja gerade dann gebraucht
  // wird, wenn nichts anderes geht.
  //
  // Ebenfalls ausgenommen: `api/push/senden`. Diese Route ruft kein Mensch auf, sondern der
  // Zeitgeber der Datenbank (Migration 28) – ohne Sitzung und ohne Cookies. Die Middleware
  // schickte ihn deshalb auf /login um, und weil eine Umleitung mit 307 die Methode behält,
  // kam dort ein POST auf einer Seite an, die nur GET kennt: Antwort 405, jede Minute, ohne
  // dass irgendwo ein Fehler zu sehen war. Die Route prüft sich selbst über das gemeinsame
  // Geheimnis im Kopffeld – das ist für einen Aufruf ohne Mensch die richtige Prüfung, eine
  // Sitzung kann es hier gar nicht geben.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|apple-touch-icon.png|icons/|api/push/senden).*)",
  ],
};
