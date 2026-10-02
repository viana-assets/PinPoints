// Hausnummer und Postleitzahl aus der einzeiligen Adresse.
//
// Bis v105 Teil von lib/helpers.ts (Fahrplan C5, v106: die Datei war auf über 1.100 Zeilen
// gewachsen). lib/helpers.ts reicht alles hier weiter, damit bestehende Importe gültig bleiben;
// neuer Code importiert direkt aus dieser Datei.

// ---------------------------------------------------------------- Saisonliste
//
// Die Postleitzahl aus der einzeiligen Adresse („Rehhofstraße 16, 90482 Nürnberg"). Es gibt
// kein eigenes PLZ-Feld an den Kunden, und eines nachzurüsten hieße, 424 gewachsene Adressen
// zu zerlegen – für einen Filter, der mit dieser Zeile auskommt. Gesucht wird eine
// fünfstellige Zahl, die nicht Teil einer längeren Zahl ist; die Hausnummer davor stört
// deshalb nicht.
// Die Hausnummer aus der einzeiligen Adresse – gebraucht für eine einzige, aber wichtige
// Frage: Verliert ein Adressvorschlag sie?
//
// Der Kartendienst antwortet auf „Strengenbergstraße 54, 90607 Rückersdorf" bereitwillig mit
// „Strengenbergstraße, 90607 Rückersdorf" – er kennt die Straße, nur nicht das Haus. Dieser
// Vorschlag ist nicht falsch, aber er ist ÄRMER als das, was schon dasteht. Ihn unbeschriftet
// neben „Übernehmen" zu setzen heißt: mit einem Klick eine gute Adresse verschlechtern, und
// die Fahrt endet am Anfang der Straße.
//
// Gesucht wird im Straßenteil (alles vor dem ersten Komma bzw. vor der Postleitzahl) eine Zahl
// am Ende, optional mit Buchstabe: „16b", „54", „3-5". Eine Zahl IM Straßennamen („Straße des
// 17. Juni") steht nicht am Ende und stört deshalb nicht.
export function hausnummerAus(adresse: string | null): string | null {
  if (!adresse) return null;
  let strasse = adresse.split(",")[0];
  if (strasse === adresse) {
    const plz = adresse.match(/(?<!\d)\d{5}(?!\d)/);
    if (plz && plz.index != null) strasse = adresse.slice(0, plz.index);
  }
  const treffer = strasse.trim().match(/(\d+\s*[a-zA-Z]?)$/);
  return treffer ? treffer[1].replace(/\s+/g, "") : null;
}

// Dieselbe Adresse ohne die Hausnummer – der zweite Versuch beim Geokodieren.
// Aus „Allerheiligenweg 36b, 90530 Wendelstein" wird „Allerheiligenweg, 90530 Wendelstein".
// Gibt null zurück, wenn es gar keine Hausnummer gab: Dann wäre der zweite Versuch derselbe
// wie der erste, und eine zweite Anfrage an einen kostenlosen Fremddienst ohne Aussicht auf
// ein anderes Ergebnis ist schlicht unhöflich.
export function adresseOhneHausnummer(adresse: string | null): string | null {
  if (!adresse) return null;
  const nummer = hausnummerAus(adresse);
  if (!nummer) return null;
  const teile = adresse.split(",");
  const strasse = teile[0].replace(/\s*\d+\s*[a-zA-Z]?\s*$/, "").trim();
  if (!strasse) return null;
  return [strasse, ...teile.slice(1).map((t) => t.trim())].filter(Boolean).join(", ");
}

// Ist der Vorschlag in dieser einen Hinsicht schlechter als das, was schon dasteht?
export function vorschlagOhneHausnummer(bisher: string | null, vorschlag: string | null): boolean {
  return hausnummerAus(bisher) !== null && hausnummerAus(vorschlag) === null;
}

export function plzAus(adresse: string | null): string | null {
  if (!adresse) return null;
  const treffer = /(?<!\d)(\d{5})(?!\d)/.exec(adresse);
  return treffer ? treffer[1] : null;
}
