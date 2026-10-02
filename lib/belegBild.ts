import { BELEG_JPEG_QUALITAET, BELEG_MAX_KANTE_PX, zielMasse } from "./belege";

// Ein Foto vor dem Hochladen verkleinern (Fahrplan E3). Im Browser über ein Canvas; die Rechnung der
// Maße steht in lib/belege.ts und ist dort geprüft.
//
// `createImageBitmap(..., { imageOrientation: "from-image" })` dreht ein Hochkantfoto so, wie die
// Kamera es gemeint hat (EXIF). Ohne das stünde jedes zweite Handyfoto quer. Ältere Safari kennen die
// Option nicht – dann fällt es auf ein <img> zurück, das die Drehung seit iOS 13.4 selbst anwendet.
async function bildLesen(datei: Blob): Promise<{ quelle: CanvasImageSource; breite: number; hoehe: number; schliessen: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(datei, { imageOrientation: "from-image" });
      return { quelle: bmp, breite: bmp.width, hoehe: bmp.height, schliessen: () => bmp.close() };
    } catch {
      // weiter unten mit <img>
    }
  }
  const url = URL.createObjectURL(datei);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { quelle: img, breite: img.naturalWidth, hoehe: img.naturalHeight, schliessen: () => URL.revokeObjectURL(url) };
}

export async function bildVerkleinern(datei: Blob): Promise<{ blob: Blob; breite: number; hoehe: number }> {
  const bild = await bildLesen(datei);
  try {
    const ziel = zielMasse(bild.breite, bild.hoehe, BELEG_MAX_KANTE_PX);
    const leinwand = document.createElement("canvas");
    leinwand.width = ziel.breite;
    leinwand.height = ziel.hoehe;
    const ctx = leinwand.getContext("2d");
    if (!ctx) throw new Error("Das Foto konnte nicht verarbeitet werden.");
    ctx.drawImage(bild.quelle, 0, 0, ziel.breite, ziel.hoehe);
    const blob = await new Promise<Blob | null>((ok) => leinwand.toBlob(ok, "image/jpeg", BELEG_JPEG_QUALITAET));
    if (!blob) throw new Error("Das Foto konnte nicht verarbeitet werden.");
    return { blob, ...ziel };
  } finally {
    bild.schliessen();
  }
}
