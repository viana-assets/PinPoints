// Etiketten als PDF in exakt ihrer Größe (02.10.2026).
//
// WARUM ES DAS GIBT
//
// Am iPhone druckt Safari eine Webseite in der Breite des Bildschirms und verkleinert sie dann
// aufs Papier; dazu setzt es eine Fußzeile mit Adresse, Datum und „Seite 1 von 1“. Beides lässt
// sich von der Seite aus nicht abstellen – im Test mit dem Brother QL-820NWBc kam ein 62 × 100-
// Etikett mit einem QR-Code von knapp 3 statt 5 cm heraus, Fußzeile mitten auf dem Etikett.
//
// Ein PDF druckt das iPhone dagegen in der Größe, die darin steht, und ohne Fußzeile (getestet
// am 02.10.2026: Teilen → Drucken, Papierformat 60 x 86 mm bzw. 58 x 58 mm). Die Brother-App
// nimmt geteilte Dateien übrigens gar nicht an, weder Bilder noch PDFs – der Druckdialog ist
// deshalb der Weg.
//
// WIE
//
// Jede Seite ist EIN Bild: das Etikett, wie `etikettZeichnen()` es ohnehin für „Als Bild
// teilen“ malt, in der Auflösung des Druckers. Als 1-Bit-Bild (schwarz/weiß), unkomprimiert –
// ein Thermodrucker kennt nur Punkt oder kein Punkt, und ohne Komprimierung braucht es keine
// Bibliothek. Ein 60 × 86-Etikett bei 300 dpi sind rund 90 kB.
//
// Reine Funktionen, geprüft in tests/etikettPdf.test.ts (der Test liest das Ergebnis auch mit
// einem echten PDF-Werkzeug zurück).

export const PT_PRO_MM = 72 / 25.4;

// Helligkeit ab der ein Bildpunkt weiß bleibt. Geglättete Schriftkanten werden so zu klaren
// Punkten; 160 statt 128, damit dünne Striche nicht ausfransen.
export const SCHWARZ_SCHWELLE = 160;

// RGBA-Bildpunkte (wie aus `getImageData`) → 1 Bit je Punkt, zeilenweise, jede Zeile auf ganze
// Bytes aufgefüllt, höchstes Bit zuerst. 1 = weiß, 0 = schwarz (so liest PDF „DeviceGray“ 1 Bit).
export function einBitBild(rgba: ArrayLike<number>, breite: number, hoehe: number, schwelle = SCHWARZ_SCHWELLE): Uint8Array {
  const proZeile = Math.ceil(breite / 8);
  const aus = new Uint8Array(proZeile * hoehe);
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const i = (y * breite + x) * 4;
      // Durchsichtig zählt als weiß – die Leinwand ist ohnehin weiß hinterlegt.
      const a = rgba[i + 3] / 255;
      const hell = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a);
      if (hell >= schwelle) aus[y * proZeile + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return aus;
}

export type PdfSeite = {
  breiteMm: number;
  hoeheMm: number;
  pxBreite: number;
  pxHoehe: number;
  // Aus `einBitBild()`.
  bild: Uint8Array;
};

// Ein PDF mit einer Seite je Etikett, jede Seite genau so groß wie das Etikett.
export function etikettPdf(seiten: PdfSeite[]): Uint8Array {
  const teile: Uint8Array[] = [];
  const text = new TextEncoder();
  let laenge = 0;
  const offsets: number[] = [];
  const schreiben = (t: string | Uint8Array) => {
    const b = typeof t === "string" ? text.encode(t) : t;
    teile.push(b);
    laenge += b.length;
  };
  // Objektnummern: 1 Katalog, 2 Seitenbaum, dann je Seite drei: Seite, Inhalt, Bild.
  const seitenNr = (i: number) => 3 + i * 3;
  const objekt = (nr: number, inhalt: string | Uint8Array[], stream?: Uint8Array) => {
    offsets[nr] = laenge;
    schreiben(`${nr} 0 obj\n`);
    if (typeof inhalt === "string") schreiben(inhalt);
    if (stream) {
      schreiben("\nstream\n");
      schreiben(stream);
      schreiben("\nendstream");
    }
    schreiben("\nendobj\n");
  };
  const zahl = (n: number) => (Math.round(n * 1000) / 1000).toString();

  // Kopf mit Binärkommentar, damit Übertragungswege die Datei als binär behandeln.
  schreiben("%PDF-1.4\n%âãÏÓ\n");
  objekt(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objekt(2, `<< /Type /Pages /Count ${seiten.length} /Kids [${seiten.map((_, i) => `${seitenNr(i)} 0 R`).join(" ")}] >>`);
  seiten.forEach((s, i) => {
    const w = s.breiteMm * PT_PRO_MM;
    const h = s.hoeheMm * PT_PRO_MM;
    const nr = seitenNr(i);
    objekt(nr, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${zahl(w)} ${zahl(h)}] /Resources << /XObject << /Im${i} ${nr + 2} 0 R >> >> /Contents ${nr + 1} 0 R >>`);
    const inhalt = text.encode(`q ${zahl(w)} 0 0 ${zahl(h)} 0 0 cm /Im${i} Do Q`);
    objekt(nr + 1, `<< /Length ${inhalt.length} >>`, inhalt);
    objekt(nr + 2, `<< /Type /XObject /Subtype /Image /Width ${s.pxBreite} /Height ${s.pxHoehe} /ColorSpace /DeviceGray /BitsPerComponent 1 /Length ${s.bild.length} >>`, s.bild);
  });

  const anzahl = 3 + seiten.length * 3;
  const xref = laenge;
  let tabelle = `xref\n0 ${anzahl}\n0000000000 65535 f \n`;
  for (let nr = 1; nr < anzahl; nr++) tabelle += `${String(offsets[nr]).padStart(10, "0")} 00000 n \n`;
  schreiben(tabelle);
  schreiben(`trailer\n<< /Size ${anzahl} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const gesamt = new Uint8Array(laenge);
  let pos = 0;
  for (const t of teile) { gesamt.set(t, pos); pos += t.length; }
  return gesamt;
}
