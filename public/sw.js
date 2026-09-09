/* Service Worker für Viana PinPoints – Stufe 2 des PWA-Ausbaus (docs/pwa-plan.md).
 *
 * WAS HIER ABSICHTLICH *NICHT* PASSIERT – bitte vor jeder Erweiterung lesen:
 *
 * Es landen ausschließlich Programmbestandteile im Zwischenspeicher: die von Next.js
 * erzeugten JS-/CSS-Bündel unter /_next/static/, die Symbole, das Manifest, die
 * Offline-Seite und die Google-Schriften. KEINE Antwort von Supabase, keine Kartenkachel,
 * kein /api/-Aufruf. Damit liegt zu keinem Zeitpunkt ein Kundenname, eine Adresse oder eine
 * Telefonnummer dauerhaft auf dem Gerät – genau das ist die Grenze, die Stufe 2 von Stufe 3
 * trennt, und der Grund, warum Stufe 2 ohne Anpassung der technisch-organisatorischen
 * Maßnahmen möglich ist. Wer hier Datenabfragen aufnimmt, verlässt diese Zusage.
 *
 * Aktualisierung: Dieser Worker ruft NICHT von sich aus skipWaiting(). Eine neue Fassung
 * wartet, bis die Seite ihm "UEBERNIMM" schickt (components/PwaBereit.tsx zeigt dafür einen
 * Hinweisbalken). Sonst tauscht sich die Anwendung mitten in einer Eingabe aus.
 */

// Bei jeder Änderung an dieser Datei hochzählen: der Name ist der Schlüssel des
// Zwischenspeichers, ein neuer Name wirft beim Aktivieren alle alten Bestände weg.
const FASSUNG = "v3";
const SPEICHER = `pinpoints-programm-${FASSUNG}`;
const OFFLINE_SEITE = "/offline.html";
const HUELLE = "/";

const SCHRIFT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (ereignis) => {
  ereignis.waitUntil(
    caches.open(SPEICHER).then((speicher) => speicher.add(OFFLINE_SEITE))
  );
});

self.addEventListener("activate", (ereignis) => {
  ereignis.waitUntil(
    (async () => {
      const namen = await caches.keys();
      await Promise.all(
        namen.filter((name) => name.startsWith("pinpoints-") && name !== SPEICHER)
             .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (ereignis) => {
  if (ereignis.data === "UEBERNIMM") self.skipWaiting();
});

// ---------------------------------------------------------------- Benachrichtigungen
//
// Der Inhalt kommt verschlüsselt vom eigenen Server (app/api/push/*). Apple und Google leiten
// ihn nur weiter und können ihn nicht lesen; sichtbar wird er erst hier.
//
// `userVisibleOnly` ist bei der Anmeldung Pflicht: Jede empfangene Nachricht MUSS zu einer
// angezeigten Meldung führen. Wer hier nichts anzeigt, bekommt vom Browser irgendwann die
// Erlaubnis entzogen – deshalb steht am Ende immer ein showNotification, auch wenn die Daten
// unlesbar sind.
self.addEventListener("push", (ereignis) => {
  let daten = {};
  try {
    daten = ereignis.data ? ereignis.data.json() : {};
  } catch {
    daten = {};
  }
  const titel = daten.titel || "Viana PinPoints";
  ereignis.waitUntil(
    self.registration.showNotification(titel, {
      body: daten.text || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Die Zieladresse reist mit der Meldung und wird beim Antippen unten ausgewertet.
      data: { url: daten.url || "/" },
      // Gleiche Kennung ersetzt eine noch offene Meldung, statt eine zweite daneben zu legen –
      // zwei Erinnerungen zu demselben Termin wären nur Lärm.
      tag: daten.kennung || undefined,
    })
  );
});

// Antippen soll dort landen, wo man weiterarbeitet – nicht auf der Startseite. Ist die App
// schon offen, wird dieses Fenster nach vorn geholt, statt ein zweites zu öffnen: zwei Fenster
// derselben App nebeneinander sind eine sichere Quelle für Verwirrung.
//
// Die Zieladresse wird dem laufenden Fenster als NACHRICHT geschickt, nicht per
// `client.navigate()` angesteuert. Grund (gemessen am 09.09.2026 auf dem iPhone): In der
// installierten App auf iOS bewirkt `navigate()` nichts – die App kam einfach dort wieder hoch,
// wo sie zuletzt war, und die Meldung führte ins Leere. Eine Nachricht kommt dagegen überall
// an; die Anwendung öffnet daraufhin selbst das richtige Fenster, ohne neu zu laden. Das ist
// obendrein schneller und verliert keine halb ausgefüllte Eingabe.
self.addEventListener("notificationclick", (ereignis) => {
  ereignis.notification.close();
  const ziel = (ereignis.notification.data && ereignis.notification.data.url) || "/";
  ereignis.waitUntil(
    (async () => {
      const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const f of fenster) {
        if (new URL(f.url).origin === self.location.origin) {
          await f.focus();
          f.postMessage({ typ: "BENACHRICHTIGUNG_ZIEL", url: ziel });
          return;
        }
      }
      // Kein Fenster offen: Dann wird eines geöffnet, und die Anwendung liest das Ziel beim
      // Start aus der Adresszeile – derselbe Weg wie beim QR-Aufkleber am Lagerregal.
      await self.clients.openWindow(ziel);
    })()
  );
});

self.addEventListener("fetch", (ereignis) => {
  const anfrage = ereignis.request;
  if (anfrage.method !== "GET") return;

  let adresse;
  try { adresse = new URL(anfrage.url); } catch { return; }

  // ---- Seitenaufrufe: erst das Netz, dann die gespeicherte Hülle, dann die Offline-Seite.
  // Netz zuerst, damit nie eine veraltete Seite ausgeliefert wird, solange Empfang da ist.
  if (anfrage.mode === "navigate") {
    ereignis.respondWith(seiteLiefern(anfrage, adresse));
    return;
  }

  const eigen = adresse.origin === self.location.origin;
  const istBuendel = eigen && adresse.pathname.startsWith("/_next/static/");
  const istSymbol = eigen && (
    adresse.pathname.startsWith("/icons/") ||
    adresse.pathname === "/apple-touch-icon.png" ||
    adresse.pathname === "/manifest.webmanifest"
  );
  const istSchrift = SCHRIFT_HOSTS.includes(adresse.hostname);

  // Alles andere – Supabase, Kartenkacheln, /api/ – geht unberührt ans Netz.
  if (!istBuendel && !istSymbol && !istSchrift) return;

  ereignis.respondWith(ausSpeicherOderNetz(anfrage));
});

// Programmbestandteile sind unter ihrem Namen unveränderlich (Next.js hängt eine Prüfsumme
// an den Dateinamen), deshalb zuerst der Zwischenspeicher – das spart bei jedem Start das Netz.
async function ausSpeicherOderNetz(anfrage) {
  const speicher = await caches.open(SPEICHER);
  const treffer = await speicher.match(anfrage);
  if (treffer) return treffer;
  const antwort = await fetch(anfrage);
  if (antwort && (antwort.ok || antwort.type === "opaque")) {
    speicher.put(anfrage, antwort.clone()).catch(() => {});
  }
  return antwort;
}

async function seiteLiefern(anfrage, adresse) {
  try {
    const antwort = await fetch(anfrage);
    // Nur die Startseite und nur eine echte 200-Antwort ohne Umleitung aufheben. Eine
    // Umleitung ist hier immer die Anmeldeseite – die gehört nicht in den Speicher, sonst
    // sieht der nächste Start eine Anmeldemaske statt der App.
    if (adresse.origin === self.location.origin && adresse.pathname === HUELLE
        && antwort && antwort.ok && !antwort.redirected && antwort.type === "basic") {
      const speicher = await caches.open(SPEICHER);
      speicher.put(HUELLE, antwort.clone()).catch(() => {});
    }
    return antwort;
  } catch {
    const speicher = await caches.open(SPEICHER);
    // Ohne Netz die zuletzt gesehene Hülle zeigen: sie enthält nur Programmcode, die Daten
    // holt die Anwendung selbst – und meldet dann selbst, dass sie nicht durchkommt.
    const huelle = await speicher.match(HUELLE);
    if (huelle) return huelle;
    const offline = await speicher.match(OFFLINE_SEITE);
    if (offline) return offline;
    return Response.error();
  }
}
