import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabaseServer";
import { erinnerungFaellig, minutenAusUhrzeit } from "@/lib/helpers";
import { AUFTRAG_PARAMETER, VORLAUF_MINUTEN, ZEITZONE } from "@/lib/constants";

// Terminerinnerung: verschickt die Meldung „Termin in 5 Minuten" an die zugeordneten
// Techniker (docs/benachrichtigungen-plan.md, Teile 3 bis 5).
//
// Aufgerufen im Minutentakt von pg_cron (Migration 28), nicht von einem Menschen. Deshalb
// keine Anmeldung über Cookies, sondern ein gemeinsames Geheimnis im Kopffeld – und deshalb
// der Admin-Client: der Zeitgeber ist niemand, seine Abfrage kann sich nicht auf
// Row-Level-Security stützen.
//
// Die Doppelmeldungssperre ist bewusst nicht „erst prüfen, dann senden", sondern
// „erst eintragen, dann das Eingetragene senden": das Eintragen in push_versand läuft gegen
// einen eindeutigen Schlüssel (Migration 27) und gibt nur zurück, was WIRKLICH neu entstanden
// ist. Zwei gleichzeitige Läufe können sich damit nicht überholen.

export const runtime = "nodejs";        // web-push braucht Node-Krypto, nicht die Edge-Laufzeit.
export const dynamic = "force-dynamic"; // Nie vorberechnen: die Antwort hängt an der Uhrzeit.

// Wie lange nach dem eigentlichen Zeitpunkt eine Erinnerung noch nachgeholt wird. Fällt ein
// Lauf des Zeitgebers aus, holt der nächste sie nach; nach dem Fenster ist Schweigen besser
// als eine Erinnerung an einen Termin, der längst läuft.
const FENSTER_MINUTEN = VORLAUF_MINUTEN;

type Geraet = { endpoint: string; p256dh: string; auth: string };

// „Jetzt" in der Zeitzone des Betriebs. Termine stehen als Datum + HH:MM ohne Zeitzone in der
// Datenbank – gemeint ist immer die Uhr an der Wand in Nürnberg. Der Server läuft in UTC;
// ohne diese Umrechnung käme die Erinnerung im Sommer zwei Stunden zu früh.
function jetztVorOrt(): { datum: string; minuten: number } {
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZEITZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const wert = (art: string) => teile.find((t) => t.type === art)?.value ?? "00";
  return {
    datum: `${wert("year")}-${wert("month")}-${wert("day")}`,
    minuten: parseInt(wert("hour"), 10) * 60 + parseInt(wert("minute"), 10),
  };
}

export async function POST(request: Request) {
  const geheimnis = process.env.PUSH_GEHEIMNIS;
  const oeffentlich = process.env.VAPID_PUBLIC_KEY;
  const privat = process.env.VAPID_PRIVATE_KEY;
  if (!geheimnis || !oeffentlich || !privat) {
    return NextResponse.json(
      { error: "Auf dem Server fehlen PUSH_GEHEIMNIS und/oder die VAPID-Schlüssel." },
      { status: 500 }
    );
  }
  // Kein Vergleich mit `!==` allein: er bricht beim ersten falschen Zeichen ab und verrät über
  // die Antwortzeit, wie weit ein Ratender gekommen ist. Bei einem Aufruf pro Minute ist das
  // eher Prinzip als akute Gefahr – aber es kostet nichts.
  if (!zeichenweiseGleich(request.headers.get("x-push-geheimnis") || "", geheimnis)) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { datum, minuten } = jetztVorOrt();

  // Nur der heutige Tag: ein Termin um 00:02 würde eine Erinnerung um 23:57 des Vortages
  // brauchen und fiele durch dieses Raster. Für einen Reifenwechsel-Betrieb ist das kein
  // wirklicher Fall – falls doch, ist es hier zu erweitern und nicht anderswo.
  const { data: auftraege, error: auftragsFehler } = await supabase
    .from("orders")
    .select("id,title,order_date,time,customer_id")
    .eq("order_date", datum)
    .in("status", ["offen", "in_arbeit"])
    .is("deleted_at", null)
    .not("time", "is", null);
  if (auftragsFehler) return NextResponse.json({ error: auftragsFehler.message }, { status: 500 });

  const faellig = (auftraege || []).filter((a) => {
    const start = minutenAusUhrzeit(a.time);
    return start !== null && erinnerungFaellig(start, minuten, VORLAUF_MINUTEN, FENSTER_MINUTEN);
  });
  if (faellig.length === 0) return NextResponse.json({ faellig: 0, gesendet: 0 });

  const auftragsIds = faellig.map((a) => a.id);

  // Zugeordnete Mitarbeiter → deren Benutzerkonto. Wer keinem Konto zugeordnet ist (Migration
  // 07: `employees.profile_id`), kann nichts empfangen – das ist kein Fehler, sondern der
  // normale Zustand für Personen, die die App nicht benutzen.
  const { data: zuordnungen } = await supabase
    .from("order_employees")
    .select("order_id,employee_id")
    .in("order_id", auftragsIds);
  const mitarbeiterIds = Array.from(new Set((zuordnungen || []).map((z) => z.employee_id)));
  if (mitarbeiterIds.length === 0) return NextResponse.json({ faellig: faellig.length, gesendet: 0 });

  const { data: mitarbeiter } = await supabase
    .from("employees")
    .select("id,profile_id")
    .in("id", mitarbeiterIds)
    .not("profile_id", "is", null);
  const kontoZuMitarbeiter = new Map<string, string>();
  (mitarbeiter || []).forEach((m) => { if (m.profile_id) kontoZuMitarbeiter.set(m.id, m.profile_id); });

  // Tripel (Auftrag, Konto, Terminzeitpunkt) – ein Auftrag mit zwei Technikern erzeugt zwei
  // Erinnerungen, ein Techniker mit zwei Terminen um dieselbe Zeit bekommt zwei Meldungen.
  // Beides ist gewollt.
  //
  // Der Terminzeitpunkt gehört seit Migration 29 dazu: Wird ein Termin verschoben, ist das ein
  // neuer Eintrag und bekommt seine eigene Erinnerung. Ohne ihn blieb ein verschobener Termin
  // für immer stumm, weil zu diesem Auftrag schon einmal gesendet worden war.
  // Die Uhrzeit wird aus den geprüften Minuten wieder zusammengesetzt statt roh übernommen:
  // `orders.time` ist eine Textspalte, und ein „16:45:00" von Hand ergäbe sonst einen
  // ungültigen Zeitstempel.
  const zeitpunktVon = new Map(
    faellig.map((a) => {
      const m = minutenAusUhrzeit(a.time) ?? 0;
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      return [a.id, `${a.order_date}T${hh}:${mm}:00`];
    })
  );
  const paare: { order_id: string; profile_id: string; termin: string }[] = [];
  (zuordnungen || []).forEach((z) => {
    const konto = kontoZuMitarbeiter.get(z.employee_id);
    const termin = zeitpunktVon.get(z.order_id);
    if (!konto || !termin) return;
    if (paare.some((p) => p.order_id === z.order_id && p.profile_id === konto)) return;
    paare.push({ order_id: z.order_id, profile_id: konto, termin });
  });
  if (paare.length === 0) return NextResponse.json({ faellig: faellig.length, gesendet: 0 });

  // Eintragen und dabei erfahren, was neu ist. `ignoreDuplicates` macht daraus ein
  // "on conflict do nothing"; zurück kommen nur die tatsächlich geschriebenen Zeilen.
  const { data: neu, error: eintragFehler } = await supabase
    .from("push_versand")
    .upsert(paare, { onConflict: "order_id,profile_id,termin", ignoreDuplicates: true })
    .select("order_id,profile_id");
  if (eintragFehler) return NextResponse.json({ error: eintragFehler.message }, { status: 500 });
  if (!neu || neu.length === 0) return NextResponse.json({ faellig: faellig.length, gesendet: 0 });

  const { data: kunden } = await supabase
    .from("customers")
    .select("id,name,address")
    .in("id", Array.from(new Set(faellig.map((a) => a.customer_id))));
  const kundeNach = new Map((kunden || []).map((k) => [k.id, k]));

  const { data: geraete } = await supabase
    .from("push_geraete")
    .select("profile_id,endpoint,p256dh,auth")
    .in("profile_id", Array.from(new Set(neu.map((n) => n.profile_id))));
  const geraeteNach = new Map<string, Geraet[]>();
  (geraete || []).forEach((g) => {
    const liste = geraeteNach.get(g.profile_id) || [];
    liste.push({ endpoint: g.endpoint, p256dh: g.p256dh, auth: g.auth });
    geraeteNach.set(g.profile_id, liste);
  });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:vhermann@samhammer.de", oeffentlich, privat);

  let gesendet = 0;
  const verwaist: string[] = [];
  await Promise.all(
    neu.map(async (zeile) => {
      const auftrag = faellig.find((a) => a.id === zeile.order_id);
      if (!auftrag) return;
      const kunde = kundeNach.get(auftrag.customer_id);
      const inhalt = JSON.stringify({
        titel: `Termin ${auftrag.time} Uhr`,
        // Name und Adresse stehen im Text, weil eine Meldung auf dem Sperrbildschirm oft die
        // einzige Information ist, die jemand im Vorbeigehen liest.
        text: [kunde?.name, kunde?.address, auftrag.title].filter(Boolean).join(" · "),
        // Antippen führt direkt in das Auftragsfenster (app/page.tsx wertet den Parameter
        // aus): dort stehen Fahrzeug, Leistungen und die Knöpfe für Navigation und Anruf.
        url: `/?${AUFTRAG_PARAMETER}=${auftrag.id}`,
        // Gleiche Kennung ersetzt eine noch offene Meldung zum selben Auftrag.
        kennung: `termin-${auftrag.id}`,
      });
      await Promise.all(
        (geraeteNach.get(zeile.profile_id) || []).map(async (g) => {
          try {
            await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } }, inhalt);
            gesendet++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) verwaist.push(g.endpoint);
          }
        })
      );
    })
  );

  if (verwaist.length > 0) {
    await supabase.from("push_geraete").delete().in("endpoint", verwaist);
  }

  return NextResponse.json({ faellig: faellig.length, erinnerungen: neu.length, gesendet });
}

// Vergleich in immer gleicher Zeit: läuft über die volle Länge, egal wo der erste Unterschied
// sitzt.
function zeichenweiseGleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}
