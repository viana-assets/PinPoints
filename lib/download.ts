// Eine Datei aus dem Browser heraus speichern (Export, Sicherung, Auskunft). Seit v136 an einer
// Stelle – vorher stand dieselbe Funktion dreimal im Code (AlleDatenLoeschen, Auswertungen,
// Auskunft) und kam mit der Zeiterfassung ein viertes Mal dazu.
//
// Der Link wird erst nach zehn Sekunden freigegeben: Safari liefert sonst eine leere Datei, weil
// es den Download erst nach dem Klick annimmt (wie in components/lager/ReifensatzEtikett.tsx).
export function dateiHerunterladen(name: string, inhalt: BlobPart, typ: string): void {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
