import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

// Nimmt den Link aus der Supabase-Einladungs-E-Mail entgegen, tauscht den
// Code gegen eine Session und schickt den neuen Nutzer weiter, um ein
// eigenes Passwort zu setzen.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/auth/set-password`);
}
