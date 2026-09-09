import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

// Speichert die Push-Anmeldung EINES Geräts (docs/benachrichtigungen-plan.md).
//
// Ein Mensch kann mehrere Geräte haben, ein Gerät gehört zu genau einem Konto. Schlüssel ist
// deshalb die Adresse beim Push-Dienst (`endpoint`), nicht die Person: meldet sich auf
// demselben Handy ein anderer an, zieht die Zeile mit um, statt dass zwei entstehen und der
// Vorgänger weiter Benachrichtigungen bekommt.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const { abo, geraet } = await request.json().catch(() => ({ abo: null, geraet: null }));
  const endpoint = abo?.endpoint;
  const p256dh = abo?.keys?.p256dh;
  const auth = abo?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "Unvollständige Push-Anmeldung." }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_geraete")
    .upsert(
      {
        profile_id: user.id,
        endpoint,
        p256dh,
        auth,
        geraet: typeof geraet === "string" ? geraet.slice(0, 60) : null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
