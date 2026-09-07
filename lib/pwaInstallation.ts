// Zustand rund um die Installation als App (PWA), an EINER Stelle.
//
// Warum ein eigenes Modul und kein React-Zustand: Der Browser feuert `beforeinstallprompt`
// EINMAL, kurz nach dem Laden der Seite – oft bevor der Einstellungen-Reiter überhaupt
// gezeichnet wurde. Wer erst dort zuhört, verpasst das Ereignis und der Knopf bliebe für
// immer wirkungslos. Deshalb hört die Anwendung ab dem ersten Rendern zu
// (components/PwaBereit.tsx im Grundgerüst) und legt die Aufforderung hier ab; der Knopf in
// den Einstellungen holt sie sich später von hier.
//
// Zweite Eigenheit: Die Aufforderung ist EINWEG. Nach `prompt()` ist sie verbraucht, ein
// zweiter Aufruf wirft. Deshalb wird sie nach Gebrauch verworfen.

type InstallationsAufforderung = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let aufforderung: InstallationsAufforderung | null = null;
let installiertGemeldet = false;
let hoertZu = false;
const zuhoerer = new Set<() => void>();

function melden() {
  zuhoerer.forEach((fn) => fn());
}

/** Einmalig im Grundgerüst aufrufen. Weitere Aufrufe sind wirkungslos. */
export function pwaInstallationBeobachten() {
  if (hoertZu || typeof window === "undefined") return;
  hoertZu = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Ohne preventDefault zeigt Chrome eine eigene Leiste am unteren Rand – wir wollen den
    // Zeitpunkt selbst bestimmen (Einstellungen → „App installieren").
    e.preventDefault();
    aufforderung = e as InstallationsAufforderung;
    melden();
  });
  window.addEventListener("appinstalled", () => {
    aufforderung = null;
    installiertGemeldet = true;
    melden();
  });
}

export function beiAenderung(fn: () => void): () => void {
  zuhoerer.add(fn);
  return () => { zuhoerer.delete(fn); };
}

export function installationMoeglich(): boolean {
  return aufforderung !== null;
}

export function alsAppGemeldet(): boolean {
  return installiertGemeldet;
}

/** Stößt die Installation an. Gibt zurück, was der Nutzer entschieden hat. */
export async function installationAnstossen(): Promise<"angenommen" | "abgelehnt" | "nicht-moeglich"> {
  if (!aufforderung) return "nicht-moeglich";
  const einweg = aufforderung;
  aufforderung = null;
  melden();
  await einweg.prompt();
  const { outcome } = await einweg.userChoice;
  return outcome === "accepted" ? "angenommen" : "abgelehnt";
}

export type Installationslage =
  | "installiert"      // läuft bereits als App
  | "knopf"            // Browser bietet die Installation an – ein Knopf genügt
  | "ios-safari"       // iPhone/iPad in Safari: nur von Hand über „Teilen"
  | "ios-fremd"        // iPhone/iPad in einem anderen Browser: geht dort gar nicht
  | "anleitung";       // sonstiger Browser ohne Angebot – Menüweg beschreiben

/** Erkennt, was dem Nutzer hier und jetzt möglich ist. Nur im Browser aufrufen. */
export function installationslage(): Installationslage {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "anleitung";

  // Läuft die Seite schon als installierte App? `standalone` ist Apples eigener Weg, die
  // Medienabfrage der Weg aller anderen – beide werden gebraucht.
  const alsApp =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (alsApp || installiertGemeldet) return "installiert";

  if (aufforderung) return "knopf";

  const kennung = navigator.userAgent;
  // iPadOS ab 13 meldet sich als Mac. Der Unterschied ist die Zahl der Berührungspunkte –
  // ein echter Mac hat keine.
  const istApfelMobil =
    /iPhone|iPod|iPad/.test(kennung) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!istApfelMobil) return "anleitung";

  // Auf dem iPhone laufen alle Browser auf Safaris Unterbau, aber NUR Safari selbst darf
  // „Zum Home-Bildschirm" anbieten. Chrome, Firefox, Edge und Opera erkennt man an ihrem
  // eigenen Kürzel in der Kennung.
  const fremderBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(kennung);
  return fremderBrowser ? "ios-fremd" : "ios-safari";
}
