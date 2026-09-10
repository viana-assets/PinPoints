import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

// Entfernt die Push-Anmeldung eines Geräts. Nur die eigene – dafür sorgt zusätzlich die
// Row-Level-Security (Migration 26), nicht nur die Bedingung hier.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const { endpoint } = await request.json().catch(() => ({ endpoint: null }));
  if (typeof endpoint !== "string") {
    return NextResponse.json({ error: "Adresse fehlt." }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_geraete")
    .delete()
    .eq("endpoint", endpoint)
    .eq("profile_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
