import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabaseServer";
import { ANRUF_PARAMETER } from "@/lib/constants";

// „Auf dem Handy anrufen": Der Rechner schickt eine Meldung an die EIGENEN Geräte, das Antippen
// öffnet in der App ein kleines Fenster mit den Rufnummern dieses Kunden.
//
// WOZU DAS ÜBERHAUPT, wo doch ein Klick am PC über den Smartphone-Link schon wählt: Der Weg
// über Bluetooth setzt voraus, dass das Handy in Reichweite liegt und gekoppelt ist. Wer im
// Begriff ist loszufahren, will das Gespräch auf dem Gerät führen, das er mitnimmt.
//
// BEWUSST NUR AN DIE EIGENEN GERÄTE – dieselbe Grenze wie bei der Testnachricht. Eine Route,
// die an fremde Geräte senden kann, wäre eine Fernsteuerung für fremde Sperrbildschirme.
//
// DIE NUMMER STEHT NICHT IN DER ADRESSE, sondern nur die Kennung des Kunden. Eine Rufnummer in
// einem Adressparameter landet im Verlauf, in Lesezeichen und in jedem Protokoll, das die
// Adresse mitschreibt. Das Fenster schlägt sie beim Öffnen nach – dann sieht man ohnehin alle
// Nummern des Kunden und nicht nur die eine, die der Rechner geraten hat.

export const runtime = "nodejs"; // web-push braucht Node-Krypto, nicht die Edge-Laufzeit.

type Geraet = { endpoint: string; p256dh: string; auth: string };

export async function POST(request: Request) {
  const oeffentlich = process.env.VAPID_PUBLIC_KEY;
  const geheim = process.env.VAPID_PRIVATE_KEY;
  if (!oeffentlich || !geheim) {
    return NextResponse.json(
      { error: "Auf dem Server fehlen VAPID_PUBLIC_KEY und/oder VAPID_PRIVATE_KEY." },
      { status: 500 }
    );
  }

  let kundeId = "";
  try {
    const koerper = (await request.json()) as { kundeId?: unknown };
    kundeId = typeof koerper.kundeId === "string" ? koerper.kundeId : "";
  } catch {
    kundeId = "";
  }
  if (!kundeId) return NextResponse.json({ error: "Es wurde kein Kunde übergeben." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  // Der Kunde wird MIT der Anmeldung des Benutzers gelesen und nicht mit dem Admin-Zugang:
  // Damit gilt dieselbe Row-Level-Security wie in der Oberfläche. Wer einen Kunden nicht sehen
  // darf, kann sich über diese Route auch keine Meldung über ihn schicken lassen.
  const { data: kunde, error: kundenFehler } = await supabase
    .from("customers")
    .select("id,name,address,phone_mobile,phone_landline")
    .eq("id", kundeId)
    .maybeSingle();
  if (kundenFehler) return NextResponse.json({ error: kundenFehler.message }, { status: 500 });
  if (!kunde) return NextResponse.json({ error: "Dieser Kunde ist nicht zu finden." }, { status: 404 });

  const nummern = [kunde.phone_mobile, kunde.phone_landline].map((n) => (n || "").trim()).filter(Boolean);
  if (nummern.length === 0) {
    return NextResponse.json({ error: "Für diesen Kunden ist keine Rufnummer hinterlegt." }, { status: 400 });
  }

  const { data: geraete, error } = await supabase
    .from("push_geraete")
    .select("endpoint,p256dh,auth")
    .eq("profile_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!geraete || geraete.length === 0) {
    return NextResponse.json(
      { error: "Für dieses Konto ist kein Gerät angemeldet. In den Einstellungen am Handy anmelden." },
      { status: 400 }
    );
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:vhermann@samhammer.de", oeffentlich, geheim);

  const inhalt = JSON.stringify({
    titel: `Anrufen: ${kunde.name}`,
    // Die Nummern gehören in den Text: Auf dem Sperrbildschirm ist die Meldung oft das Einzige,
    // was gelesen wird – genau wie bei der Terminerinnerung.
    text: nummern.join(" · "),
    url: `/?${ANRUF_PARAMETER}=${kunde.id}`,
    // Gleiche Kennung: Wer zweimal auf denselben Kunden klickt, bekommt keine zweite Meldung
    // daneben, sondern die erste ersetzt.
    kennung: `anruf-${kunde.id}`,
  });

  let zugestellt = 0;
  const verwaist: string[] = [];
  await Promise.all(
    (geraete as Geraet[]).map(async (g) => {
      try {
        await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } }, inhalt);
        zugestellt++;
      } catch (e) {
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
      { error: "Kein Gerät hat die Meldung angenommen. Bitte in den Einstellungen erneut anmelden." },
      { status: 502 }
    );
  }
  return NextResponse.json({
    meldung: zugestellt === 1 ? "Auf dein Handy geschickt." : `An ${zugestellt} Geräte geschickt.`,
  });
}
