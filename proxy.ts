import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cspKopf, neueNonce } from "@/lib/csp";

// Zwei Aufgaben, in dieser Reihenfolge:
//
// 1. Die Content-Security-Policy mit einer Nonce je Aufruf (Fahrplan B4, v106, lib/csp.ts). Sie
//    steht hier und nicht mehr in next.config.mjs, weil nur hier jeder Aufruf seine eigene
//    Zufallszahl bekommen kann. Next.js liest sie aus dem Kopffeld der ANFRAGE und setzt sie an
//    seine Skripte; der Browser liest sie aus der ANTWORT. Beides muss dieselbe Zahl tragen.
//
// 2. Schützt alle Seiten außer /login und /auth/callback: ohne gültige Supabase-Session wird auf
//    /login umgeleitet. Damit gibt es keine öffentliche Registrierung – Zugang nur über einen
//    Admin-Einladungslink.

// Ohne Anmeldung erreichbar – und ohne Nonce, weil sie keine Seite sind oder kein Skript haben.
//
// Die PWA-Dateien: Ohne diese Ausnahme lieferte die Anmeldeprüfung auf /sw.js eine Umleitung zur
// Anmeldeseite – der Browser lehnt die Anmeldung des Service Workers dann ab (falscher
// Inhaltstyp), und zwar stillschweigend. Dasselbe gilt für das Manifest, die Symbole und die
// Offline-Seite, die ja gerade dann gebraucht wird, wenn nichts anderes geht.
//
// `api/push/senden`: Diese Route ruft kein Mensch auf, sondern der Zeitgeber der Datenbank
// (Migration 28) – ohne Sitzung und ohne Cookies. Früher landete er auf /login, und weil eine
// Umleitung mit 307 die Methode behält, kam dort ein POST auf einer Seite an, die nur GET kennt:
// Antwort 405, jede Minute, ohne dass irgendwo ein Fehler zu sehen war. Die Route prüft sich
// selbst über das gemeinsame Geheimnis im Kopffeld.
const OHNE_ANMELDUNG = [
  "/favicon.ico", "/manifest.webmanifest", "/sw.js", "/offline.html", "/apple-touch-icon.png", "/icons/", "/api/push/senden",
];

export async function proxy(request: NextRequest) {
  const dev = process.env.NODE_ENV === "development";
  const pfad = request.nextUrl.pathname;

  if (OHNE_ANMELDUNG.some((p) => pfad === p || (p.endsWith("/") && pfad.startsWith(p)))) {
    const antwort = NextResponse.next();
    // Der Service Worker bekommt seine CSP aus dem Kopf seiner eigenen Datei – ohne sie dürfte er
    // alles laden. Die Offline-Seite ebenso.
    antwort.headers.set("Content-Security-Policy", cspKopf(null, { dev }));
    return antwort;
  }

  const nonce = neueNonce();
  const csp = cspKopf(nonce, { dev });
  const anfrageKopf = new Headers(request.headers);
  anfrageKopf.set("x-nonce", nonce);
  anfrageKopf.set("Content-Security-Policy", csp);

  // Jede Antwort, die dieser Aufruf erzeugt, trägt dieselbe CSP – auch eine Umleitung.
  const mitCsp = (antwort: NextResponse) => {
    antwort.headers.set("Content-Security-Policy", csp);
    return antwort;
  };

  let response = NextResponse.next({ request: { headers: anfrageKopf } });

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
  const isPublic = publicPaths.some((p) => pfad.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    return mitCsp(NextResponse.redirect(loginUrl));
  }

  if (user && pfad === "/login") {
    return mitCsp(NextResponse.redirect(new URL("/", request.url)));
  }

  return mitCsp(response);
}

export const config = {
  // Alles außer den Programmteilen von Next.js (unveränderliche Dateien ohne eigene Seite) – auch
  // die PWA-Dateien, damit sie ihre CSP bekommen; die Anmeldung überspringen sie oben.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
