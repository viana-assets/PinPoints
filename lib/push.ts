"use client";

// Client-Seite der Push-Benachrichtigungen (docs/benachrichtigungen-plan.md, Vortest).
//
// Was hier NICHT passiert: der Versand. Der läuft serverseitig über app/api/push/*, weil dafür
// der geheime VAPID-Schlüssel gebraucht wird – der darf nie ins Browser-Bündel.

// Der öffentliche VAPID-Schlüssel kommt zur Laufzeit vom Server und nicht als
// NEXT_PUBLIC_-Variable. Grund: NEXT_PUBLIC_-Werte werden beim Bauen fest eingebacken. Wer den
// Schlüssel in Vercel setzt und sich wundert, warum nichts passiert, hat schlicht noch nicht
// neu gebaut – ein Fehler, der schwer zu sehen ist. Über eine Route gelesen wirkt er sofort.
export async function oeffentlicherSchluessel(): Promise<string | null> {
  try {
    const antwort = await fetch("/api/push/schluessel");
    if (!antwort.ok) return null;
    const { schluessel } = await antwort.json();
    return typeof schluessel === "string" && schluessel.length > 0 ? schluessel : null;
  } catch {
    return null;
  }
}

// Der Browser will den Schlüssel als Byte-Folge, geliefert wird er als base64url-Text.
function base64UrlZuBytes(text: string): BufferSource {
  const fuellung = "=".repeat((4 - (text.length % 4)) % 4);
  const base64 = (text + fuellung).replace(/-/g, "+").replace(/_/g, "/");
  const roh = atob(base64);
  // Der Puffer wird ausdrücklich als ArrayBuffer angelegt: `new Uint8Array(n).buffer` ist für
  // TypeScript ein ArrayBufferLike und damit kein gültiger applicationServerKey.
  const puffer = new ArrayBuffer(roh.length);
  const bytes = new Uint8Array(puffer);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return puffer;
}

export type PushLage =
  | "nicht-unterstuetzt"   // Browser kann kein Push (oder iOS ohne Installation)
  | "nicht-installiert"    // iPhone/iPad: Push gibt es nur in der installierten App
  | "verweigert"           // Erlaubnis wurde abgelehnt – nur in den Systemeinstellungen zurückzunehmen
  | "aus"                  // möglich, aber dieses Gerät ist nicht angemeldet
  | "an";                  // dieses Gerät ist angemeldet

export async function pushLage(): Promise<PushLage> {
  if (typeof window === "undefined") return "nicht-unterstuetzt";

  const alsApp =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const istApfelMobil =
    /iPhone|iPod|iPad/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // Auf iOS gibt es Push ausschließlich in der auf dem Home-Bildschirm installierten App –
  // ab iOS 16.4. In Safari als normale Seite fehlt `PushManager` schlicht.
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return istApfelMobil && !alsApp ? "nicht-installiert" : "nicht-unterstuetzt";
  }
  if (istApfelMobil && !alsApp) return "nicht-installiert";
  if (Notification.permission === "denied") return "verweigert";

  const anmeldung = await navigator.serviceWorker.ready;
  const vorhanden = await anmeldung.pushManager.getSubscription();
  if (!vorhanden) return "aus";

  // Ein Abo im Browser allein heißt noch nicht, dass der Server das Gerät kennt – schlug das
  // Speichern fehl, stand hier trotzdem „angemeldet". Deshalb wird gegengeprüft. Antwortet der
  // Server gar nicht (offline), bleibt es bei „an": eine fehlende Verbindung ist kein Beleg
  // dafür, dass die Anmeldung weg ist.
  return (await serverKenntGeraet(vorhanden.endpoint)) === false ? "aus" : "an";
}

/** true/false vom Server, null wenn er nicht erreichbar war. */
async function serverKenntGeraet(endpoint: string): Promise<boolean | null> {
  try {
    const antwort = await fetch("/api/push/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    if (!antwort.ok) return antwort.status === 500 ? false : null;
    const { angemeldet } = await antwort.json();
    return Boolean(angemeldet);
  } catch {
    return null;
  }
}

/** Meldet dieses Gerät an. Muss aus einer Nutzergeste heraus aufgerufen werden. */
export async function geraetAnmelden(): Promise<{ ok: true } | { ok: false; grund: string }> {
  const schluessel = await oeffentlicherSchluessel();
  if (!schluessel) return { ok: false, grund: "Auf dem Server ist kein Push-Schlüssel hinterlegt." };

  // Die Erlaubnis MUSS aus einer Nutzergeste kommen – ein Aufruf im Hintergrund wird vom
  // Browser abgelehnt, ohne zu fragen.
  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== "granted") {
    return { ok: false, grund: "Ohne erteilte Erlaubnis kann dieses Gerät nichts empfangen." };
  }

  const anmeldung = await navigator.serviceWorker.ready;
  const abo =
    (await anmeldung.pushManager.getSubscription()) ??
    (await anmeldung.pushManager.subscribe({
      // Ohne diese Angabe verweigern die Browser die Anmeldung: jede Push-Nachricht muss dem
      // Nutzer angezeigt werden, stille Nachrichten sind nicht erlaubt.
      userVisibleOnly: true,
      applicationServerKey: base64UrlZuBytes(schluessel),
    }));

  const antwort = await fetch("/api/push/anmelden", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abo: abo.toJSON(), geraet: geraetName() }),
  });
  if (!antwort.ok) {
    const { error } = await antwort.json().catch(() => ({ error: null }));
    // Wichtig: das Abo im Browser wieder zurücknehmen. Sonst bliebe ein Abo bestehen, von dem
    // der Server nichts weiß – die Einstellungen meldeten „angemeldet", und beim Test käme nie
    // etwas an. Lieber ehrlich „nicht angemeldet" anzeigen.
    await abo.unsubscribe().catch(() => {});
    return { ok: false, grund: error || "Das Gerät konnte nicht gespeichert werden." };
  }
  return { ok: true };
}

/** Meldet dieses Gerät ab – im Browser UND auf dem Server. */
export async function geraetAbmelden(): Promise<void> {
  const anmeldung = await navigator.serviceWorker.ready;
  const abo = await anmeldung.pushManager.getSubscription();
  if (!abo) return;
  // Erst dem Server sagen, dann im Browser abbestellen: umgekehrt wäre die Adresse weg, bevor
  // der Server weiß, welche Zeile er löschen soll – und es bliebe eine Karteileiche zurück,
  // an die bis zum ersten Fehlversuch weiter gesendet wird.
  await fetch("/api/push/abmelden", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: abo.endpoint }),
  }).catch(() => {});
  await abo.unsubscribe();
}

/** Schickt eine Testnachricht an die Geräte des angemeldeten Nutzers. */
export async function testNachrichtSenden(): Promise<{ ok: boolean; text: string }> {
  const antwort = await fetch("/api/push/test", { method: "POST" });
  const daten = await antwort.json().catch(() => ({}));
  if (!antwort.ok) return { ok: false, text: daten.error || "Der Versand ist fehlgeschlagen." };
  return { ok: true, text: daten.meldung || "Testnachricht verschickt." };
}

// Grober Gerätename, damit man in der Liste erkennt, welches Handy gemeint ist. Bewusst kein
// Fingerabdruck – nur das, was ohnehin in jeder Anfrage steht.
function geraetName(): string {
  const k = navigator.userAgent;
  if (/iPhone/.test(k)) return "iPhone";
  if (/iPad/.test(k)) return "iPad";
  if (/Android/.test(k)) return "Android-Gerät";
  if (/Macintosh/.test(k)) return "Mac";
  if (/Windows/.test(k)) return "Windows-Rechner";
  return "Gerät";
}
