// Die Regeln hinter der Regalwand: Reihen aus dem Platzcode, DOT-Jahr, „hier ist etwas zu tun".
//
// Bis v105 Teil von lib/helpers.ts (Fahrplan C5, v106: die Datei war auf über 1.100 Zeilen
// gewachsen). lib/helpers.ts reicht alles hier weiter, damit bestehende Importe gültig bleiben;
// neuer Code importiert direkt aus dieser Datei.

import { profilText, satzProfilMm } from "./profiltiefe";

// ---------------------------------------------------------------- Regalwand
//
// Ab hier: die Regeln hinter der Lageransicht (docs/lager-ausbaukonzept.md, „Grafisch
// arbeiten"). Sie stehen bewusst hier und nicht in der Komponente – die Anordnung eines
// Lagers ist eine Aussage über die Daten, keine über die Darstellung, und sie wird an zwei
// Stellen gebraucht (Regalwand am Bildschirm, Reihenliste am Handy).

// Ein Lagerplatz-Code trägt seine Anordnung schon in sich: „BC-01" ist der erste Platz in
// Reihe BC. Genau so legt `buildSlotCodes` sie an – Präfix, Bindestrich, laufende Nummer.
// Deshalb braucht die Regalwand KEINE Migration und keine Koordinatenfelder: Was im Raum
// nebeneinander liegt, steht schon nebeneinander im Code.
//
// Toleranz gegenüber Handeingaben: Wer einen Platz einzeln über „+ Platz" anlegt, tippt
// vielleicht „A01" ohne Strich oder „7" ohne Präfix. Beides wird verstanden. Was gar keine
// Nummer enthält, landet in einer Reihe ohne Namen – sichtbar, aber nicht sortiert.
export function reiheAusCode(code: string): { reihe: string; nummer: number | null } {
  const roh = code.trim();
  const strich = roh.indexOf("-");
  if (strich > 0) {
    const rest = roh.slice(strich + 1).trim();
    return { reihe: roh.slice(0, strich).trim(), nummer: /^\d+$/.test(rest) ? parseInt(rest, 10) : null };
  }
  const geteilt = /^([^\d\s]+)[\s]*(\d+)$/.exec(roh);
  if (geteilt) return { reihe: geteilt[1], nummer: parseInt(geteilt[2], 10) };
  if (/^\d+$/.test(roh)) return { reihe: "", nummer: parseInt(roh, 10) };
  return { reihe: "", nummer: null };
}

// Die Plätze eines Lagers zu Reihen gebündelt, jede Reihe nach Nummer sortiert.
//
// Warum hier sortiert wird, obwohl die Datenbank schon `order("code")` liefert: alphabetisch
// steht „A-10" vor „A-2". Bei zweistelliger Nummerierung fällt das nicht auf, bei einstelliger
// sofort – und die Regalwand behauptet eine räumliche Anordnung. Eine falsche Reihenfolge
// wäre hier keine Schönheitsfrage, sondern eine Falschaussage über das Regal.
//
// Die Reihen selbst behalten die Reihenfolge ihres ersten Auftretens (Map merkt sie sich).
// Das ist die Reihenfolge, in der die Datenbank die Codes liefert – also alphabetisch.
export function nachReihen<T extends { code: string }>(plaetze: T[]): { reihe: string; plaetze: T[] }[] {
  const gruppen = new Map<string, T[]>();
  for (const platz of plaetze) {
    const { reihe } = reiheAusCode(platz.code);
    const liste = gruppen.get(reihe);
    if (liste) liste.push(platz);
    else gruppen.set(reihe, [platz]);
  }
  return [...gruppen.entries()].map(([reihe, liste]) => ({
    reihe,
    plaetze: liste.slice().sort((a, b) => {
      const na = reiheAusCode(a.code).nummer;
      const nb = reiheAusCode(b.code).nummer;
      if (na != null && nb != null) return na - nb;
      // Nummerierte Plätze zuerst, alles Übrige alphabetisch hinten dran.
      if (na != null) return -1;
      if (nb != null) return 1;
      return a.code.localeCompare(b.code, "de");
    }),
  }));
}

// Das DOT-Kürzel „2523" heißt: Kalenderwoche 25 des Jahres 2023. Uns interessiert nur das
// Jahr. Trennzeichen werden geschluckt, damit „25/23" dasselbe ergibt wie „2523".
//
// Die Grenze bei 60: Zweistellige Jahreszahlen über 60 stammen aus dem letzten Jahrhundert.
// Ein Reifen von 1995 ist absurd alt – aber wer ihn so einträgt, soll auch 1995 herausbekommen
// und nicht 2095, was jede Altersrechnung ins Negative kippen ließe.
export function dotJahr(dot: string | null | undefined): number | null {
  const ziffern = (dot ?? "").replace(/\D/g, "");
  if (ziffern.length !== 4) return null;
  const jj = parseInt(ziffern.slice(2), 10);
  if (Number.isNaN(jj)) return null;
  return jj > 60 ? 1900 + jj : 2000 + jj;
}

// Warum leuchtet an diesem Platz ein Punkt? Der Punkt sagt „etwas", diese Liste sagt „was" –
// im Tooltip an der Kachel und oben im Zuordnungsfenster.
//
// Es ist Absicht, dass die Gründe TEXTE sind und keine Kennungen: Sie werden nur gelesen,
// nirgends ausgewertet, und ein Text kann genau das sagen, was der Fall ist („Reifen von
// 2018 – 8 Jahre alt") statt einer Stufe, die man erst wieder übersetzen muss.
//
// Die Grenzen kommen von außen, nicht aus dieser Datei – dieselbe Aufteilung wie bei
// `profilLage`: Die Regel steht hier, die Zahlen in lib/constants.ts.
export function handlungsgruende(
  satz: {
    erfassungsart?: "sammel" | "einzeln";
    profiltiefe_mm: number | null;
    dot_date: string | null;
    created_at: string;
  },
  raeder: { profiltiefe_mm: number | null }[],
  grenzen: { kritischMm: number; dotJahre: number; liegtTage: number },
  heute: Date = new Date()
): string[] {
  const gruende: string[] = [];

  const mm = satzProfilMm(satz, raeder);
  if (mm == null) gruende.push("Profiltiefe nie gemessen");
  else if (mm < grenzen.kritischMm) gruende.push(`Profil ${profilText(mm)} – unter ${profilText(grenzen.kritischMm)}`);

  const jahr = dotJahr(satz.dot_date);
  if (jahr != null) {
    const alter = heute.getFullYear() - jahr;
    if (alter >= grenzen.dotJahre) gruende.push(`Reifen von ${jahr} – ${alter} Jahre alt`);
  }

  const eingelagert = new Date(satz.created_at);
  if (!Number.isNaN(eingelagert.getTime())) {
    const tage = Math.floor((heute.getTime() - eingelagert.getTime()) / 86_400_000);
    if (tage >= grenzen.liegtTage) {
      const monate = Math.floor(tage / 30);
      gruende.push(`liegt seit ${monate} Monaten unberührt`);
    }
  }

  return gruende;
}
