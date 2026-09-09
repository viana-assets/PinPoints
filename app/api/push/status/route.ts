import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

// Gegenprobe: Kennt der Server dieses Gerät überhaupt?
//
// Der Browser weiß nur, dass ER ein Push-Abo hat. Ob es auch in der Datenbank steht, weiß er
// nicht – und genau diese Lücke hat in den Einstellungen „Dieses Gerät ist angemeldet"
// angezeigt, obwohl der Server die Anmeldung abgelehnt hatte. Deshalb wird die Anzeige nicht
// mehr allein aus dem Browser abgeleitet.
//
// Der Endpunkt kommt im Body und nicht in der Adresse: er ist eine persönliche Zustelladresse
// und hat in Server-Protokollen nichts verloren.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const { endpoint } = await request.json().catch(() => ({ endpoint: null }));
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return NextResponse.json({ error: "Kein Endpunkt übergeben." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("push_geraete")
    .select("endpoint")
    .eq("profile_id", user.id)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message, angemeldet: false }, { status: 500 });

  return NextResponse.json({ angemeldet: Boolean(data) });
}
