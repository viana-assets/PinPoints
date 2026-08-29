// Kennung eines Lagerplatzes im QR-Aufkleber – Erzeugen und Zurücklesen an einer Stelle.
//
// Auf dem Aufkleber steht ein LINK auf die App, nicht bloß eine Zeichenkette. Das ist der
// entscheidende Unterschied im Alltag: der Aufkleber funktioniert damit auch mit der normalen
// Handy-Kamera – draufhalten, auf die Einblendung tippen, der Lagerplatz geht in der App auf.
// Stünde dort nur "a1b2c3…", zeigte die Kamera-App kryptischen Text und der Aufkleber wäre
// außerhalb dieser App wertlos.
//
// Als Kennung dient die vorhandene `storage_slots.id`. Bewusst KEINE zweite, kürzere Kennung:
// die müsste erzeugt, auf Eindeutigkeit geprüft und mit der Id synchron gehalten werden – drei
// Fehlerquellen für ein paar gesparte Zeichen im QR-Bild.
//
// Und es ist kein Geheimnis, das auf dem Regal klebt: wer den Link ohne Anmeldung öffnet, sieht
// nichts. Dafür sorgt unverändert die Row-Level-Security in der Datenbank.

export const LAGERPLATZ_PARAMETER = "lagerplatz";

const UUID_MUSTER = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Der Text, der als QR-Code auf den Aufkleber kommt.
export function lagerplatzUrl(lagerplatzId: string, basis: string): string {
  const ursprung = basis.replace(/\/+$/, "");
  return `${ursprung}/?${LAGERPLATZ_PARAMETER}=${lagerplatzId}`;
}

// Liest die Lagerplatz-Kennung aus einem gescannten Text zurück. Nimmt bewusst mehr als nur die
// eigene Adresszeile entgegen:
//   - den vollen Link vom Aufkleber (der Normalfall),
//   - einen Link von einer anderen Umgebung (Test- statt Produktivadresse),
//   - eine nackte Kennung, falls jemand sie abtippt oder ein alter Aufkleber nur sie enthält.
// Alles andere ergibt null – ein fremder QR-Code (Paketaufkleber, Reifenetikett) darf nicht
// versehentlich als Lagerplatz durchgehen.
export function lagerplatzIdAusCode(text: string): string | null {
  const roh = (text || "").trim();
  if (!roh) return null;

  try {
    const url = new URL(roh);
    const wert = url.searchParams.get(LAGERPLATZ_PARAMETER);
    if (wert && UUID_MUSTER.test(wert)) return wert.toLowerCase();
    // Ein Link OHNE den erwarteten Parameter ist keine Lagerplatz-Kennung, auch wenn irgendwo
    // im Pfad zufällig etwas UUID-Förmiges steht.
    return null;
  } catch {
    // Keine gültige Adresse – dann kommt nur noch eine nackte Kennung in Frage.
  }

  const treffer = roh.match(UUID_MUSTER);
  return treffer && treffer[0] === roh ? roh.toLowerCase() : null;
}
