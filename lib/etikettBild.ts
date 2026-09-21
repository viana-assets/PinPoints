// Ein Etikett als Bilddatei – für Drucker, die kein AirPrint können (21.09.2026).
//
// WARUM ES DAS GIBT
//
// Gedruckt wird in dieser Anwendung über den Druckdialog des Geräts. Am Rechner findet der
// jeden Drucker, der als Systemdrucker eingerichtet ist; am iPhone findet er ausschließlich
// AirPrint-Drucker. Die kleinen Bluetooth-Etikettendrucker können das nicht – sie sprechen nur
// mit ihrer eigenen Hersteller-App. Ein Gerät, das beides kann (Akku UND AirPrint), kostet ein
// Vielfaches.
//
// Dieser Weg umgeht die Bedingung: Das Etikett wird als PNG in exakt seiner physischen Größe
// erzeugt und an das Teilen-Menü des Geräts übergeben. Von dort nimmt es die Drucker-App
// entgegen. Zwei Tipper mehr als „Drucken", dafür druckt jedes Bluetooth-Gerät.
//
// ZWEI DARSTELLUNGEN DESSELBEN ETIKETTS – MIT ABSICHT, UND DAS IST DER PREIS
//
// Auf dem Bildschirm und im Druck entsteht das Etikett aus HTML und CSS (`.etikett` in
// globals.css). Hier entsteht es ein zweites Mal, gezeichnet auf eine Leinwand. Das ist eine
// Dopplung, und sie widerspricht der Regel „eine Sache, eine Stelle".
//
// Sie ließ sich nicht vermeiden: Ein HTML-Element in ein Bild zu verwandeln, geht im Browser
// nur über Fremdbibliotheken oder über `foreignObject`, und beides ist in Safari unzuverlässig
// – ausgerechnet dort, wo dieser Weg gebraucht wird. Gezeichnet wird deshalb selbst.
//
// Was NICHT gedoppelt ist: der INHALT. Welche Zeilen auf dem Etikett stehen, entscheidet
// `ReifensatzEtikett.tsx` an einer Stelle und gibt das Ergebnis hier wie dort weiter. Gedoppelt
// ist allein die Geometrie – Schriftgrößen, Abstände, Anordnung. Wer das Etikett umgestaltet,
// muss beide Stellen anfassen; die Maße unten tragen deshalb dieselben Millimeterwerte wie die
// CSS-Regeln, damit der Abgleich durch Hinsehen möglich ist.

// 8 Punkte je Millimeter sind 203 dpi – die Auflösung, mit der diese Etikettendrucker
// arbeiten. Ein Bild in genau dieser Dichte muss vom Drucker nicht umgerechnet werden, und
// genau das Umrechnen ist es, was einen QR-Code unscharf und damit unlesbar macht.
export const PX_PRO_MM = 8;

export function mmZuPx(mm: number): number {
  return Math.round(mm * PX_PRO_MM);
}

// Die Maße. Dieselben Zahlen wie in den `.etikett`-Regeln in globals.css.
const RAND_MM = 1.5;
const SPALT_MM = 1.5;
const SCHRIFT_KOPF_MM = 2.6;   // .etikett-kunde
const SCHRIFT_ZEILE_MM = 2.1;  // .etikett-zeile
const SCHRIFT_GROSS_MM = 4.5;  // .etikett-pos
const ZEILENHOEHE = 1.25;
// Eine Schriftfamilie, die auf jedem Gerät vorhanden ist. Bewusst nicht die Hausschrift der
// Anwendung: Eine Webschrift ist auf einer Leinwand erst nutzbar, wenn sie geladen ist, und ob
// sie das im Moment des Zeichnens ist, kann man nicht zusichern. Ein Etikett, das je nach
// Zeitpunkt anders aussieht, ist schlimmer als eines in Arial.
const SCHRIFT = "Arial, Helvetica, sans-serif";

export type EtikettInhalt = {
  // Der QR-Code als Daten-URI. Kommt von außen, weil er dieselbe Adresse tragen muss wie der
  // auf dem Bildschirm – zweimal erzeugt wäre zweimal die Gelegenheit, sich zu vertun.
  qr: string;
  // Die große Zeile des Rad-Etiketts: links die Position, rechts die Profiltiefe.
  gross?: { links: string; rechts: string };
  // Die fette Kopfzeile des Satz-Etiketts (der Kundenname). Darf zwei Zeilen brauchen.
  kopf?: string;
  zeilen: string[];
};

export type EtikettMasse = { breiteMm: number; hoeheMm: number; qrMm: number };

// Text auf eine Breite kürzen. Passt er nicht, wird abgeschnitten und mit einem Auslassungs-
// zeichen versehen – NICHT stillschweigend beschnitten: Eine abgeschnittene Angabe, die wie
// eine vollständige aussieht, ist schlimmer als eine sichtbar gekürzte. Dieselbe Überlegung wie
// bei der Profiltiefe im Rad-Kopf, die einmal als „6,0 m" aus dem Drucker kam.
export function textKuerzen(
  text: string,
  maxBreite: number,
  messen: (t: string) => number
): string {
  if (maxBreite <= 0) return "";
  if (messen(text) <= maxBreite) return text;
  let kurz = text;
  while (kurz.length > 0 && messen(kurz + "…") > maxBreite) kurz = kurz.slice(0, -1);
  return kurz.length === 0 ? "" : kurz + "…";
}

// Einen Text auf höchstens `maxZeilen` Zeilen umbrechen, an Wortgrenzen. Was danach noch übrig
// ist, wird in der letzten Zeile gekürzt.
export function umbrechen(
  text: string,
  maxBreite: number,
  maxZeilen: number,
  messen: (t: string) => number
): string[] {
  const woerter = text.split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return [];
  const zeilen: string[] = [];
  let aktuell = "";
  let abgeschnitten = false;
  for (let i = 0; i < woerter.length; i++) {
    const versuch = aktuell ? `${aktuell} ${woerter[i]}` : woerter[i];
    if (messen(versuch) <= maxBreite || aktuell === "") {
      aktuell = versuch;
      continue;
    }
    zeilen.push(aktuell);
    if (zeilen.length === maxZeilen) {
      // Es sind noch Wörter übrig, für die kein Platz mehr ist.
      abgeschnitten = true;
      aktuell = "";
      break;
    }
    aktuell = woerter[i];
  }
  if (zeilen.length < maxZeilen && aktuell) zeilen.push(aktuell);

  const letzte = zeilen.length - 1;
  if (letzte < 0) return zeilen;
  // Die letzte Zeile wird gekürzt, wenn sie zu lang ist – UND sie bekommt das
  // Auslassungszeichen auch dann, wenn sie selbst passt, aber Wörter dahinter weggefallen
  // sind. Ein Name, der nach „Mobiler Reifenservice" endet, sieht sonst vollständig aus,
  // obwohl „Musterbetrieb GmbH" fehlt. Dieselbe Regel wie bei der Profiltiefe, die einmal
  // als „6,0 m" aus dem Drucker kam.
  zeilen[letzte] = abgeschnitten
    ? textKuerzen(zeilen[letzte] + " …", maxBreite, messen)
    : textKuerzen(zeilen[letzte], maxBreite, messen);
  return zeilen;
}

// Ein Dateiname, der im Teilen-Menü etwas aussagt. Ohne Umlaute und Sonderzeichen, weil nicht
// jede App damit umgeht, und mit einer laufenden Nummer, damit vier Rad-Etiketten vier
// unterscheidbare Dateien werden statt viermal derselbe Name.
export function dateiName(bezeichnung: string, nummer: number, gesamt: number): string {
  const rein = bezeichnung
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "etikett";
  return gesamt > 1 ? `${rein}-${nummer}.png` : `${rein}.png`;
}

// Das Bild eines Etiketts. Gibt die fertige Leinwand zurück; das Umwandeln in eine Datei
// übernimmt `etikettDatei` darunter.
export function etikettZeichnen(
  leinwand: HTMLCanvasElement,
  inhalt: EtikettInhalt,
  masse: EtikettMasse,
  qrBild: CanvasImageSource
): void {
  const b = mmZuPx(masse.breiteMm);
  const h = mmZuPx(masse.hoeheMm);
  leinwand.width = b;
  leinwand.height = h;
  const ctx = leinwand.getContext("2d");
  if (!ctx) return;

  // Weißer Grund und reines Schwarz: Ein Thermodrucker kennt nur „Punkt" und „kein Punkt".
  // Graustufen werden gerastert, und ein gerasterter QR-Code ist keiner mehr.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, b, h);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  const rand = mmZuPx(RAND_MM);
  const qrSeite = mmZuPx(masse.qrMm);
  // Hochformat: Ist das Etikett höher als breit, steht der QR-Code OBEN und der Text
  // darunter, beide über die volle Breite. Die Anordnung nebeneinander würde auf einem
  // 50 × 80 mm langen Etikett zwei Drittel der Fläche leer lassen – und der QR-Code bliebe
  // klein, obwohl gerade er von der Länge profitiert: Je größer er ist, desto weiter weg
  // kann man ihn scannen, und im Regal steht man selten davor.
  const hoch = masse.hoeheMm > masse.breiteMm;

  // Der QR-Code wird ohne Glättung gezeichnet: Interpolierte Kanten verwischen die Module,
  // und ab einer gewissen Unschärfe findet kein Lesegerät den Code mehr.
  ctx.imageSmoothingEnabled = false;
  if (hoch) {
    ctx.drawImage(qrBild, Math.round((b - qrSeite) / 2), rand, qrSeite, qrSeite);
  } else {
    ctx.drawImage(qrBild, rand, Math.max(rand, Math.round((h - qrSeite) / 2)), qrSeite, qrSeite);
  }
  ctx.imageSmoothingEnabled = true;

  const textLinks = hoch ? rand : rand + qrSeite + mmZuPx(SPALT_MM);
  const textBreite = b - textLinks - rand;
  if (textBreite <= 0) return;

  const messenMit = (schriftMm: number, fett: boolean) => (t: string) => {
    ctx.font = `${fett ? "700 " : ""}${mmZuPx(schriftMm)}px ${SCHRIFT}`;
    return ctx.measureText(t).width;
  };
  const schreiben = (t: string, y: number, schriftMm: number, fett: boolean) => {
    ctx.font = `${fett ? "700 " : ""}${mmZuPx(schriftMm)}px ${SCHRIFT}`;
    ctx.fillText(t, textLinks, y);
    return y + mmZuPx(schriftMm) * ZEILENHOEHE;
  };

  // Der Textblock sitzt senkrecht mittig, genau wie in der Bildschirmfassung
  // (`.etikett{align-items:center}`). Dafür muss seine Höhe vorher feststehen – bei oben
  // bündigem Text klebt eine dreizeilige Angabe am oberen Rand und lässt unten ein Drittel
  // leer, und das sieht nach Fehler aus, nicht nach Gestaltung.
  const zeilenHoehe = (mm: number) => mmZuPx(mm) * ZEILENHOEHE;
  let blockHoehe = 0;
  const kopfZeilen = inhalt.kopf
    ? umbrechen(inhalt.kopf, textBreite, 2, messenMit(SCHRIFT_KOPF_MM, true))
    : [];
  if (inhalt.gross) blockHoehe += mmZuPx(SCHRIFT_GROSS_MM) * 1.05;
  blockHoehe += kopfZeilen.length * zeilenHoehe(SCHRIFT_KOPF_MM);
  const sichtbareZeilen = inhalt.zeilen.filter(Boolean);
  blockHoehe += sichtbareZeilen.length * zeilenHoehe(SCHRIFT_ZEILE_MM);

  // Im Querformat sitzt der Textblock mittig neben dem Code; im Hochformat beginnt er direkt
  // unter ihm. Ihn dort ebenfalls zu zentrieren hieße, ihn vom Code wegzuschieben – und
  // zusammen gelesen werden sie allemal.
  let y = hoch
    ? rand + qrSeite + mmZuPx(SPALT_MM * 1.4)
    : Math.max(rand, Math.round((h - blockHoehe) / 2));

  if (inhalt.gross) {
    // Position groß links, Profiltiefe kleiner rechts daneben – dieselbe Aufteilung wie im
    // Stilblatt (`.etikett-rad-kopf`).
    const grossPx = mmZuPx(SCHRIFT_GROSS_MM);
    ctx.font = `700 ${grossPx}px ${SCHRIFT}`;
    const linksBreite = ctx.measureText(inhalt.gross.links).width;
    ctx.fillText(inhalt.gross.links, textLinks, y);
    const restBreite = textBreite - linksBreite - mmZuPx(1.2);
    const rechts = textKuerzen(inhalt.gross.rechts, restBreite, messenMit(SCHRIFT_KOPF_MM, true));
    ctx.font = `700 ${mmZuPx(SCHRIFT_KOPF_MM)}px ${SCHRIFT}`;
    // Auf die Grundlinie der großen Schrift ausgerichtet, nicht oben bündig – sonst schwebt
    // die kleinere Zahl über der Position.
    ctx.fillText(rechts, textLinks + linksBreite + mmZuPx(1.2), y + grossPx - mmZuPx(SCHRIFT_KOPF_MM));
    y += grossPx * 1.05;
  }

  for (const zeile of kopfZeilen) {
    y = schreiben(zeile, y, SCHRIFT_KOPF_MM, true);
  }

  for (const zeile of sichtbareZeilen) {
    // Was nicht mehr aufs Etikett passt, wird weggelassen statt über den Rand geschrieben.
    if (y + mmZuPx(SCHRIFT_ZEILE_MM) > h - rand) break;
    y = schreiben(textKuerzen(zeile, textBreite, messenMit(SCHRIFT_ZEILE_MM, false)), y, SCHRIFT_ZEILE_MM, false);
  }
}

// Ein Bild aus einem Daten-URI laden. `decode()` statt `onload`, weil Safari sonst gelegentlich
// eine noch nicht fertig dekodierte Grafik zeichnet – als weißen Fleck.
export function bildLaden(datenUri: string): Promise<HTMLImageElement> {
  return new Promise((erfuellen, ablehnen) => {
    const bild = new Image();
    bild.onload = () => bild.decode().then(() => erfuellen(bild)).catch(() => erfuellen(bild));
    bild.onerror = () => ablehnen(new Error("Der QR-Code konnte nicht geladen werden."));
    bild.src = datenUri;
  });
}

export async function etikettDatei(
  inhalt: EtikettInhalt,
  masse: EtikettMasse,
  name: string
): Promise<File> {
  const qrBild = await bildLaden(inhalt.qr);
  const leinwand = document.createElement("canvas");
  etikettZeichnen(leinwand, inhalt, masse, qrBild);
  const blob = await new Promise<Blob | null>((fertig) => leinwand.toBlob(fertig, "image/png"));
  if (!blob) throw new Error("Das Etikett konnte nicht in ein Bild umgewandelt werden.");
  return new File([blob], name, { type: "image/png" });
}
