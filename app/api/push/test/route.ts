import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabaseServer";

// Testnachricht an die eigenen Geräte (docs/benachrichtigungen-plan.md, Vortest).
//
// Zweck dieser Route: die eine Frage beantworten, die sich am Schreibtisch nicht beantworten
// lässt – kommt eine Benachrichtigung auf einem echten iPhone an, bei gesperrtem Bildschirm
// und im Fokus „Fahren"? Erst wenn das steht, lohnt der Bau der Terminerinnerung.
//
// Bewusst nur an die EIGENEN Geräte: eine Route, die an fremde Geräte senden kann, wäre eine
// Fernsteuerung für fremde Sperrbildschirme. Der spätere Terminversand läuft über einen
// eigenen, per Geheimnis geschützten Weg und nicht über diese Route.

export const runtime = "nodejs"; // web-push braucht Node-Krypto, nicht die Edge-Laufzeit.

type Geraet = { endpoint: string; p256dh: string; auth: string };

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

export async function POST() {
  const oeffentlich = process.env.VAPID_PUBLIC_KEY;
  const geheim = process.env.VAPID_PRIVATE_KEY;
  if (!oeffentlich || !geheim) {
    return NextResponse.json(
      { error: "Auf dem Server fehlen VAPID_PUBLIC_KEY und/oder VAPID_PRIVATE_KEY." },
      { status: 500 }
    );
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const { data: geraete, error } = await supabase
    .from("push_geraete")
    .select("endpoint,p256dh,auth")
    .eq("profile_id", user.id);
  if (error) {
    // Fehlt die Tabelle, ist keine Migration gelaufen – das gehört im Klartext gesagt, sonst
    // sucht man den Fehler beim Push-Dienst statt in der Datenbank.
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
  if (!geraete || geraete.length === 0) {
    return NextResponse.json({ error: "Für dieses Konto ist kein Gerät angemeldet." }, { status: 400 });
  }

  webpush.setVapidDetails(
    // Der Betreff ist Pflicht und dient den Push-Diensten als Rückkanal bei Problemen.
    process.env.VAPID_SUBJECT || "mailto:vhermann@samhammer.de",
    oeffentlich,
    geheim
  );

  const inhalt = JSON.stringify({
    titel: "PinPoints",
    text: "Testnachricht – wenn du das liest, funktioniert der Weg bis auf dein Gerät.",
    url: "/",
  });

  let zugestellt = 0;
  const verwaist: string[] = [];
  await Promise.all(
    (geraete as Geraet[]).map(async (g) => {
      try {
        await webpush.sendNotification(
          { endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } },
          inhalt
        );
        zugestellt++;
      } catch (e) {
        // 404/410 heißt: dieses Gerät gibt es nicht mehr (App gelöscht, Anmeldung erneuert).
        // Solche Karteileichen werden sofort entfernt, sonst wächst die Tabelle mit Adressen,
        // an die für immer vergeblich gesendet wird.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) verwaist.push(g.endpoint);
      }
    })
  );

  if (verwaist.length > 0) {
    await supabase.from("push_geraete").delete().in("endpoint", verwaist);
  }

  if (zugestellt === 0) {
    return NextResponse.json(
      { error: "Kein Gerät hat die Nachricht angenommen. Bitte in den Einstellungen erneut anmelden." },
      { status: 502 }
    );
  }
  return NextResponse.json({
    meldung:
      zugestellt === 1
        ? "Testnachricht an 1 Gerät verschickt."
        : `Testnachricht an ${zugestellt} Geräte verschickt.`,
  });
}
