import { NextResponse } from "next/server";

// Liefert den ÖFFENTLICHEN VAPID-Schlüssel an den Browser.
//
// Warum als Route und nicht als NEXT_PUBLIC_-Variable: NEXT_PUBLIC_-Werte werden beim Bauen
// fest eingebacken. Wer den Schlüssel in Vercel hinterlegt und sich wundert, warum die
// Anmeldung nicht geht, hat schlicht noch nicht neu gebaut – ein Fehler, den man dem Bildschirm
// nicht ansieht. Über eine Route gelesen wirkt eine geänderte Variable sofort.
//
// Der Schlüssel ist öffentlich; er steckt in jeder Push-Anmeldung im Browser. Geheim ist nur
// sein Gegenstück, und das verlässt den Server nie.
// Ohne diese Zeile backt Next.js die Antwort beim Bauen fest ein (die Route erschien im
// Build als "○ static") – und damit genau den Wert, den die Umgebungsvariable zur BAUZEIT
// hatte. Das ist derselbe Fehler, den der Verzicht auf NEXT_PUBLIC_ vermeiden sollte, nur
// eine Ebene tiefer versteckt.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ schluessel: process.env.VAPID_PUBLIC_KEY || "" });
}
