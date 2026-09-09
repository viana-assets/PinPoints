import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

// Speichert die Push-Anmeldung EINES Geräts (docs/benachrichtigungen-plan.md).
//
// Ein Mensch kann mehrere Geräte haben, ein Gerät gehört zu genau einem Konto. Schlüssel ist
// deshalb die Adresse beim Push-Dienst (`endpoint`), nicht die Person: meldet sich auf
// demselben Handy ein anderer an, zieht die Zeile mit um, statt dass zwei entstehen und der
// Vorgänger weiter Benachrichtigungen bekommt.
// Kennung des Supabase-Projekts, mit dem diese Bereitstellung spricht (aus der URL
// `https://<kennung>.supabase.co`). Sie steht ohnehin im Browser-Bündel und ist kein Geheimnis.
// Sie gehört in die Fehlermeldung, weil genau hier der Verwechslungsfehler sitzt: eine Migration
// im falschen Projekt auszuführen sieht von außen genauso aus wie eine vergessene Migration.
function datenbankKennung(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const treffer = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return treffer ? treffer[1] : "unbekannt";
}

function tabelleFehltText(): string {
  return (
    "Die Tabelle push_geraete ist in der Datenbank dieser App nicht sichtbar (Projekt " +
    datenbankKennung() +
    "). Entweder wurde Migration 26 in einem anderen Supabase-Projekt ausgeführt, oder der " +
    "Schema-Zwischenspeicher ist veraltet – dann hilft: notify pgrst, 'reload schema';"
  );
}

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
  if (error) {
    // PGRST205 heißt: die Tabelle gibt es (noch) nicht. Das ist kein Rätsel, sondern eine
    // vergessene Migration – also auch so benennen, statt die rohe PostgREST-Meldung
    // durchzureichen.
    const fehlt = error.code === "PGRST205" || /push_geraete/.test(error.message);
    return NextResponse.json(
      {
        error: fehlt
          ? tabelleFehltText()
          : error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
