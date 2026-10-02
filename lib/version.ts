// Die Fassung der App und was in jeder Fassung neu ist (26.09.2026).
//
// `APP_VERSION` ist die Fassung des PROGRAMMS, das gerade im Browser läuft. `FASSUNG` in
// public/sw.js ist die des Service Workers. Beide werden bei jeder Auslieferung gemeinsam
// hochgezählt; tests/version.test.ts prüft, dass sie gleich sind. Stehen sie am Gerät
// auseinander, ist nur eine der beiden Dateien hochgeladen worden (CLAUDE.md, Abschnitt 4) –
// deshalb zeigen die Einstellungen beide.
//
// Die Neuigkeiten stehen im Code und nicht in der Datenbank: Sie beschreiben genau dieses
// Programm und kommen mit ihm. Neueste zuerst. Geschrieben für das Büro, nicht für Entwickler.

export const APP_VERSION = "v105";

export type Neuigkeit = {
  version: string;
  datum: string; // JJJJ-MM-TT
  titel: string;
  punkte: string[];
};

export const NEUIGKEITEN: Neuigkeit[] = [
  {
    version: "v105", datum: "2026-10-02", titel: "Fotos und Unterschrift am Auftrag",
    punkte: [
      "Im Auftragsfenster gibt es die Karte „Fotos & Unterschrift“: Zustand vorher und nachher fotografieren, einen Schaden festhalten, auf Wunsch mit Beschriftung („Felge VL“). Die Fotos werden vor dem Hochladen verkleinert.",
      "Der Kunde unterschreibt mit dem Finger auf dem Handy – mit dem Satz „Arbeiten ausgeführt, Fahrzeug übernommen“ und seinem Namen. Fehlt die Unterschrift, erinnert der Fuß des Auftrags daran; abschließen geht trotzdem.",
      "Fotos und Unterschrift gehen nur mit Netz. Löschen kann nur, wer Aufträge löschen darf.",
    ],
  },
  {
    version: "v104", datum: "2026-10-02", titel: "Tagesroute, Stapel-Auslagern und Terminbestätigung",
    punkte: [
      "Tagesroute: In der Einsatzplanung zeigt „Route ›“ je Mitarbeiter die kürzeste Reihenfolge ab der Firmenadresse und zurück – mit den gesparten Kilometern und einem Knopf für Google Maps. Die Uhrzeiten bleiben, wie sie sind.",
      "Saisonwechsel: Im Mitnehmen-Fenster (oder Lager → „⋯“) lagert „Der Reihe nach auslagern“ die Sätze des Tages in der Reihenfolge des Regals aus – je Satz ein Tipp, die Lagergebühr kommt gleich auf den Auftrag.",
      "Terminbestätigung: Im Auftragsfenster schreibt „Bestätigen“ eine Bestätigung oder Erinnerung für den Kunden. Verschickt wird sie vom eigenen Handy per WhatsApp, SMS oder E-Mail.",
    ],
  },
  {
    version: "v103", datum: "2026-10-02", titel: "Dubletten, Auskunft, große Fächer und Reifenverkauf",
    punkte: [
      "Doppelt angelegte Kunden: „Neuer Kunde“ warnt jetzt auch bei gleicher Telefonnummer, E-Mail oder Name mit PLZ. Unter Admin → „Dubletten“ lassen sich zwei Kunden zu einem zusammenführen.",
      "Auskunft nach DSGVO: Im Kundenfenster unter „⋯“ stellt „Auskunft“ alles Gespeicherte zu einem Kunden zusammen – zum Drucken, als PDF oder als Datei (nur Admin).",
      "Lagerplätze können als „großes Fach“ markiert werden. Für SUV- und 20-Zoll-Reifen stehen die großen Fächer in der Auswahl oben; ein normales Fach gibt einen Hinweis.",
      "Lässt ein Kunde seine Reifen da, macht „Kunde lässt sie da · zum Verkauf“ im Lagerplatz daraus Verkaufsposten – Größe, DOT und Profil kommen mit. Verkaufsreifen bekommen ein Etikett mit QR-Code.",
      "Auswertungen: Der neue Reiter „Reifen“ zeigt Umsatz neu und gebraucht, Marge, Lagerwert im Verlauf und was seit über sechs Monaten liegt.",
    ],
  },
  {
    version: "v102", datum: "2026-10-02", titel: "Vorlagen, Telefonsuche und viele kleine Verbesserungen",
    punkte: [
      "Auftragsvorlagen: Unter „Artikel“ lassen sich Leistungspakete wie „Saisonwechsel mobil“ anlegen. Im Auftrag trägt „+ Vorlage“ alle Leistungen mit einem Tipp ein.",
      "Die Kundensuche findet jetzt auch Telefonnummern – egal ob mit Schrägstrich, Leerzeichen oder +49 geschrieben.",
      "Im Lager: Ist ein Lager zu 90 % voll, steht das deutlich da. Passt die Reifengröße eines gemessenen Rades nicht zum Fahrzeug, erscheint ein Hinweis.",
      "Ein stornierter Auftrag wird jetzt „wieder aufgenommen“ – mit dem Stornogrund vor Augen. Wer ohne eine einzige Leistung auf „Erledigt“ tippt, wird einmal gefragt.",
      "In der Einsatzplanung zeigt „Storniert“ die abgesagten Termine. Freie Lagerplätze sind nach Lager sortiert, große Aufkleberbögen werden in Teilen gedruckt.",
    ],
  },
  {
    version: "v101", datum: "2026-10-02", titel: "Arbeiten ohne Netz",
    punkte: [
      "Im Funkloch oder in der Tiefgarage lässt sich jetzt weiterarbeiten: Notiz, Titel und Beschreibung, Termin, Leistungen und die Radmessung werden auf dem Handy gespeichert und übertragen, sobald wieder Netz da ist.",
      "Unten steht dann „1 Änderung wartet auf Netz“, im Auftrag oben „auf dem Gerät gespeichert – noch nicht übertragen“. Antippen zeigt, was noch aussteht.",
      "Hat in der Zwischenzeit jemand dasselbe Feld geändert, fragt die App nach, welche Fassung gelten soll – nichts wird still überschrieben.",
      "Abschließen, Ein- und Auslagern und Kundendaten brauchen weiterhin Netz.",
    ],
  },
  {
    version: "v100", datum: "2026-10-02", titel: "Packliste, Löschschutz, IBAN-Prüfung",
    punkte: [
      "Neu im Dashboard: die Packliste für heute oder morgen – welche Leistungen anstehen (z. B. 8× Räderwechsel) und welche Reifengrößen die Autos fahren. Dieselbe Liste steht im Fenster hinter dem Abendhinweis.",
      "Ein abgerechneter Auftrag lässt sich nicht mehr löschen – über ihn findet man die Rechnung. Bei erledigten und stornierten Aufträgen fragt die App eigens nach.",
      "Die IBAN in den Betriebsdaten wird jetzt geprüft: Ein Tippfehler fällt schon beim Eintragen auf, nicht erst beim Kunden.",
      "Hinter den Kulissen: Listen mit gleichem Datum stehen immer in derselben Reihenfolge, und die Adresssuche ist gegen Dauerabfragen gebremst.",
    ],
  },
  {
    version: "v99", datum: "2026-10-02", titel: "Etiketten: Format wieder wählbar, Regalaufkleber für den Brother",
    punkte: [
      "Beim Etikett für den Reifensatz lässt sich das Format wieder wählen: 58 × 58 mm ist voreingestellt, 60 × 86 mm (groß) steht zur Auswahl.",
      "Die Aufkleber fürs Regal drucken jetzt ebenfalls auf dem Brother – 58 × 58 oder 60 × 86 mm, als PDF über „Drucken“ wie beim Reifensatz. Groß steht der Platz darauf, klein das Lager. Der A4-Bogen für den Bürodrucker bleibt als dritte Wahl.",
    ],
  },
  {
    version: "v98", datum: "2026-10-02", titel: "Profiltiefe: Umschalten löscht nichts mehr",
    punkte: [
      "Im Lager unter „Bearbeiten“ löschte schon das Antippen von „Je Rad messen“ den Wert für den Satz – auch ohne Speichern. Jetzt bleibt er, bis du „Zuordnung speichern“ tippst oder das erste Rad misst. Mit ✕ bleibt alles, wie es war.",
      "Im Auftragsfenster genauso: „Je Rad messen“ zeigt erst nur die Räder, der Satzwert bleibt bis zum ersten gemessenen Rad.",
      "Die Lagerliste zeigt jetzt, wie gemessen wurde: „Satzwert“ in der Zeile, bei Einzelmessung „je Rad 5,0 · 5,5 · 6,0 · 6,0“.",
    ],
  },
  {
    version: "v97", datum: "2026-10-02", titel: "Knöpfe besser erkennbar",
    punkte: [
      "„Nach neuer Version suchen“ in den Einstellungen ist jetzt ein orangefarbener Knopf.",
      "Weiße Knöpfe in Fenstern und Karten – etwa „Schließen“ beim Etikett, „Abbrechen“, „Zurück“ – haben jetzt einen Rand und sind als Knopf zu erkennen.",
    ],
  },
  {
    version: "v96", datum: "2026-10-02", titel: "Etiketten: immer 58 × 58 mm",
    punkte: [
      "Etiketten für Reifensatz und Einzelräder kommen jetzt immer im Format 58 × 58 mm – die Formatauswahl ist weg, die anderen Formate gibt es nicht mehr.",
      "Gedruckt wird wie bisher: „Drucken“, im Teilen-Menü „Drucken“, Drucker QL-820NWB, Papierformat 58 x 58 mm.",
    ],
  },
  {
    version: "v95", datum: "2026-10-02", titel: "Etiketten für den Brother: richtige Größe",
    punkte: [
      "Zwei neue Formate für den Brother QL-820NWBc, beide mit QR-Code oben: 60 × 86 mm (groß) und 58 × 58 mm (sparsam). 62 × 100 und 62 × 40 gibt es nicht mehr.",
      "„Drucken“ erzeugt jetzt ein PDF in genau der Etikettengröße – ohne Datum und „Seite 1 von 1“ unten und ohne Verkleinern. Im Teilen-Menü „Drucken“ wählen, Drucker QL-820NWB und das Papierformat, das im Fenster steht.",
      "Auf dem Satz-Etikett steht „eingelagert seit …“ jetzt in einer eigenen Zeile, nichts wird mehr abgeschnitten.",
    ],
  },
  {
    version: "v94", datum: "2026-10-01", titel: "Auftrag: anlegen und erledigt",
    punkte: [
      "Ein Auftrag hat jetzt nur noch zwei Schritte: Bei einem neuen Auftrag unten „Auftrag anlegen“, wenn die Arbeit getan ist „Auftrag erledigt“. „Arbeit beginnen“ gibt es nicht mehr.",
      "Wer einen neuen Auftrag schließt, ohne ihn anzulegen, wird gefragt: anlegen oder verwerfen. So bleibt kein halb angelegter Auftrag liegen.",
      "Beim neuen Auftrag steht oben kein „Speichern“ – das übernimmt „Auftrag anlegen“. Später, beim Ändern, erscheint „Speichern“ oben wie gewohnt.",
    ],
  },
  {
    version: "v93", datum: "2026-10-01", titel: "Auftrag anlegen – ein Knopf statt zwei",
    punkte: [
      "Unten im Auftragsfenster steht jetzt immer nur ein Knopf: bei einem neuen Auftrag „Auftrag anlegen“, danach „Arbeit beginnen“, in Arbeit „Auftrag abschließen“. „Direkt abschließen“ (zum Nachtragen) steht im Menü „⋯“.",
      "Ein Fahrzeug, das der Kunde schon hat, wird beim Eintippen des Kennzeichens nicht mehr ein zweites Mal angelegt. Schon doppelt angelegte stehen in der Auswahl als „(doppelt angelegt)“ und lassen sich im Kundenfenster löschen.",
      "Ein neu angelegtes Fahrzeug erscheint sofort in „+ weiteres Fahrzeug des Kunden“ – vorher fehlte es dort, obwohl das Lager es schon zeigte.",
    ],
  },
  {
    version: "v92", datum: "2026-09-30", titel: "Etiketten für den Brother-Drucker",
    punkte: [
      "Beim Etikett gibt es zwei neue Formate für den Brother QL-820NWBc mit der 62-mm-Rolle: 62 × 100 mm hoch (großer QR-Code, voreingestellt) und 62 × 40 mm quer. Der Drucker schneidet jedes Etikett einzeln ab.",
      "Am Handy: Wireless Direct am Drucker einschalten, das iPhone mit dem WLAN des Druckers verbinden und „Drucken“ – oder über Bluetooth „Als Bild teilen“ und in der App „Brother iPrint&Label“ drucken.",
      "Behoben: Beim Drucken kam vorher zuerst ein leeres Etikett heraus.",
    ],
  },
  {
    version: "v91", datum: "2026-09-30", titel: "Termin verschoben? Rückgängig bleibt da",
    punkte: [
      "Nach dem Verschieben eines Termins in der Einsatzplanung steht unten, wo er vorher war und wo er jetzt ist – mit einem leuchtenden Knopf „Rückgängig“. Der Hinweis bleibt, bis man ihn mit ✕ schließt. Mehrere Verschiebungen lassen sich nacheinander zurücknehmen.",
      "In der Historie des Auftrags (Menü „⋯“ → Historie) steht bei jeder Terminänderung direkt „von wann auf wann“, beim Anlegen der ursprüngliche Termin. Aufgeklappt holt „Termin von vorher übernehmen“ den alten Termin zurück ins Fenster – dann nur noch „Speichern“.",
    ],
  },
  {
    version: "v90", datum: "2026-09-30", titel: "Neues App-Symbol",
    punkte: [
      "Das Symbol auf dem Startbildschirm und in den Mitteilungen ist jetzt das ganze Logo „Mobiler Reifenservice – Wo auch immer Sie sind“ auf Schwarz.",
      "Auf dem Handy erscheint es meist erst, wenn die App einmal vom Startbildschirm entfernt und neu hinzugefügt wird. Die Anmeldung bleibt dabei erhalten; danach die Mitteilungen in den Einstellungen einmal neu einschalten.",
    ],
  },
  {
    version: "v89", datum: "2026-09-29", titel: "Profiltiefe je Rad: neues Radbild",
    punkte: [
      "Beim Einlagern (im Lager und im Auftrag) sind die vier Räder jetzt große Kacheln am Auto. Rad antippen, darunter den Wert eingeben – mit den Schnellwerten 1 bis 8 mm oder fein mit − und +.",
      "Es gibt keinen „Übernehmen“-Knopf mehr: Der Wert wird von selbst gespeichert. „Weiter zu VR ›“ springt zum nächsten Rad, „Für alle vier“ übernimmt einen Wert für alle.",
      "Felge, RDKS-Sensor, Größe, DOT und Bemerkung zu einem Rad stehen unter „Mehr zu diesem Rad“. Auch der Wert für den ganzen Satz hat jetzt die Schnellwerte.",
    ],
  },
  {
    version: "v88", datum: "2026-09-29", titel: "Neuer Name: MR Assistent",
    punkte: [
      "Die App heißt jetzt „MR Assistent“ und trägt das Zeichen des Mobilen Reifenservice – auf dem Startbildschirm, im Browser, bei der Anmeldung und in den Mitteilungen. Statt „Settings“ mit Zahnrad steht jetzt der Name und das Logo da.",
      "Auf dem Handy erscheint das neue Symbol oft erst, wenn die App einmal vom Startbildschirm entfernt und neu hinzugefügt wird. Die Anmeldung bleibt dabei erhalten; danach die Mitteilungen in den Einstellungen einmal neu einschalten.",
      "Im Lager lässt sich beim Einlagern und Bearbeiten eines Satzes jetzt wieder wählen: ein Wert für den ganzen Satz oder die Profiltiefe für jedes Rad einzeln – wie im Auftragsfenster.",
    ],
  },
  {
    version: "v87", datum: "2026-09-28", titel: "Auftrag: Termin und Team direkt im Fenster",
    punkte: [
      "Datum, Uhrzeit von–bis, Mitarbeiter und Transporter stehen jetzt direkt in der Karte „Termin & Team“ – ohne erst auf „Ändern“ zu tippen. So fällt sofort auf, wenn noch niemand eingeteilt ist.",
      "Gespeichert wird wie alles andere mit „Speichern“ – oben im Kopf oder direkt unter der Karte, sobald etwas geändert ist.",
    ],
  },
  {
    version: "v86", datum: "2026-09-26", titel: "Reifenverkauf aus dem Lager",
    punkte: [
      "Im Lager gibt es oben den neuen Reiter „Verkauf“: Neue und gebrauchte Reifen – auch Kompletträder – mit Größe, Hersteller, Saison, DOT, Profil, Preis und Einkaufspreis erfassen. Vier gleiche Reifen sind ein Eintrag mit Bestand 4. Das Lager „Zuhause“ geht auch ohne Plätze.",
      "Im Auftrag unter „Leistungen“: „Reifen aus dem Lager“ sucht beim Tippen – „235“, „235 55 17“ oder „Michelin“ – und steht schon auf der Reifengröße des Fahrzeugs. Stückzahl wählen, hinzufügen: Preis und Beschreibung kommen vom Reifen.",
      "Solange der Auftrag offen ist, sind die Reifen reserviert und für andere Aufträge gesperrt. Beim Abschließen werden sie aus dem Bestand gebucht; Position entfernen oder Auftrag stornieren gibt sie wieder frei.",
      "Neu im Artikelstamm: „Reifen neu“ und „Reifen gebraucht“. Plätze mit Verkaufsreifen sind in der Regalwand grün und nehmen keinen Kundensatz auf.",
    ],
  },
  {
    version: "v85", datum: "2026-09-26", titel: "Termine immer auf der Karte",
    punkte: [
      "In „Termine“ und in der Saisonliste zeigt die Karte jetzt immer alle Kunden der Auswahl – auch wenn in „Kunden“ ein Zustand wie „Termin“ ausgeblendet ist. Die Zustands-Knöpfe stehen dort nicht mehr.",
    ],
  },
  {
    version: "v84", datum: "2026-09-26", titel: "Termine auf der Karte",
    punkte: [
      "Behoben: Bei „7 Tage“, „Anstehend“ und „Alle“ blieb die Karte, wo sie war – lagen die Termine woanders, stand dort „Keine Kunden in diesem Ausschnitt“. Jetzt rückt die Karte auf die Termine, auch in der Saisonliste.",
      "Termine werden auf der Karte nicht mehr zu Bündeln zusammengefasst, damit jede Nadel mit ihrer Uhrzeit sichtbar bleibt.",
    ],
  },
  {
    version: "v83", datum: "2026-09-26", titel: "Große Bildschirme",
    punkte: [
      "Auf 22- bis 27-Zoll-Monitoren wird die App jetzt insgesamt größer dargestellt – Schrift, Knöpfe, Listen und Fenster wachsen gleichmäßig mit, statt klein in viel leerem Raum zu stehen. Am Notebook und am Handy bleibt alles, wie es ist.",
      "Behoben: In Admin → Nutzer lief die Rollenwahl über den Kartenrand hinaus.",
    ],
  },
  {
    version: "v82", datum: "2026-09-26", titel: "Wochenplan: ganze Woche und feste Tageszeile",
    punkte: [
      "Am Handy zeigt die Woche jetzt alle sieben Tage auf einen Blick, ohne seitliches Wischen. Ein Tipp auf einen Tag oben öffnet ihn als Tagesplan.",
      "Die Zeile mit den Tagen bleibt beim Herunterscrollen oben stehen, bis der Wochenplan zu Ende ist – auch am Rechner.",
    ],
  },
  {
    version: "v81", datum: "2026-09-26", titel: "Einstellungen: Uhrzeit des Abendhinweises",
    punkte: [
      "Behoben: Das Uhrzeitfeld des Abendhinweises nahm die ganze Zeile ein, der Text daneben stand ein Wort je Zeile.",
    ],
  },
  {
    version: "v80", datum: "2026-09-26", titel: "Handy: zurück aus der Karte",
    punkte: [
      "Behoben: War am Handy die Karte offen, blieb sie beim Tippen auf die untere Leiste stehen – jetzt öffnet jeder Menüpunkt wieder seine Seite, und „Kunden“ antippen führt zurück zur Liste.",
    ],
  },
  {
    version: "v79", datum: "2026-09-26", titel: "Karte und Nadeln neu",
    punkte: [
      "Neue Nadeln in den Farben der Kundenliste; Termine tragen ihre Uhrzeit direkt an der Nadel.",
      "Oben auf der Karte stehen die Zustände als Knöpfe mit Anzahl – antippen blendet aus und wieder ein.",
      "Weit weg werden nahe Nadeln zu Bündeln mit Anzahl; der Ring zeigt, wie viel davon offen ist. Antippen zoomt hinein.",
      "Eine Nadel antippen öffnet die Kundenkarte: Anrufen, Navigation, Kontakt, Auftrag – am Handy als Blatt von unten.",
      "Termine → Heute oder Morgen zeigt den Tag auf der Karte: nummerierte Stationen, je Mitarbeiter als Linie verbunden, unten zum Wischen.",
      "Neu: Suche auf der Karte (Handy), „Mein Standort“, Legende „Was bedeuten die Nadeln?“. Am Handy bleibt die untere Leiste jetzt auch bei offener Karte sichtbar.",
      "Behoben: Der QR-Scanner in Lager und Einlagerung bekam vom Browser keine Kamera – jetzt fragt er wie vorgesehen nach der Erlaubnis.",
    ],
  },
  {
    version: "v78", datum: "2026-09-26", titel: "Versionsanzeige und Testkunden",
    punkte: [
      "Die Fassung der App steht jetzt in den Einstellungen, dazu diese Seite „Was gibt es Neues“ für Admin und Superadmin.",
      "Der Superadmin kann beim Anlegen einen Kunden als Testkunden markieren. Seine Aufträge heißen T1, T2 …, seine Rechnungen T-RE1 … – die echten Auftrags- und Rechnungsnummern zählen dabei nicht weiter.",
      "Testkunden sind überall mit TEST gekennzeichnet und zählen in Auswertungen, DATEV-Export und Umsatz nicht mit.",
      "„Testkunde restlos löschen“ entfernt den Kunden mit allem, was an ihm hängt: Aufträge, Rechnungen, Fahrzeuge, Reifen, Kontakte und Protokoll.",
    ],
  },
  {
    version: "v77", datum: "2026-09-26", titel: "Alle übrigen Seiten im neuen Stil",
    punkte: [
      "Auftragsfenster in Karten: oben wer, wann, wo; „Termin & Team“ als eigenes Blatt; unten genau die Handlung, die gerade dran ist.",
      "Abschließen oder „Arbeit beginnen“ speichert ungesicherte Änderungen jetzt vorher mit.",
      "Kundenfenster mit vier Knöpfen (Anrufen, Navigation, Kontakt, Auftrag) und Reitern; Verlauf aus Kontakten und Aufträgen.",
      "Rechnungen nach Monaten mit „Noch nicht ausgestellt“, Artikel als Karten mit Preis-Zeitleiste.",
      "Neuer Kunde, Inaktive Kunden, Einstellungen, „Weitere“ und Admin (acht Reiter, Rechte je Rolle, Betrieb als Zeilen) neu gestaltet.",
    ],
  },
  {
    version: "v76", datum: "2026-09-26", titel: "Auswertungen und DATEV-Export",
    punkte: [
      "Fünf Reiter: Umsatz, Kunden, Einsatz, Lager, Artikel – mit Zeitraum, Vorjahresvergleich und Mitarbeiter-Filter.",
      "Export für den Steuerberater: DATEV-Buchungsstapel (SKR03, je Kunde ein Debitor), Debitoren- und Rechnungsliste.",
      "DATEV-Angaben unter Admin → Betrieb.",
    ],
  },
  {
    version: "v75", datum: "2026-09-26", titel: "Terminliste als Zeitleiste",
    punkte: [
      "Der Tag als Zeitleiste mit Jetzt-Linie und freien Lücken, Filter nach Mitarbeiter, „Als Nächstes“ bei Heute.",
    ],
  },
  {
    version: "v74", datum: "2026-09-26", titel: "Auftragsliste als Karten",
    punkte: ["Suche auch nach Auftragsnummer, Status-Pillen, Navigation und Anrufen an jeder Karte."],
  },
  {
    version: "v73", datum: "2026-09-26", titel: "Kundenliste neu",
    punkte: ["Karten mit Zustandsfarbe, Suche und Filter; Anrufen und Navigation direkt an der Zeile."],
  },
  {
    version: "v72", datum: "2026-09-26", titel: "Saisonliste neu",
    punkte: ["Wer hat welche Reifen bei uns liegen – als Anrufliste für den Saisonwechsel."],
  },
  {
    version: "v71", datum: "2026-09-26", titel: "Lager neu",
    punkte: ["Eine Seite für Regale, Plätze und eingelagerte Sätze, mit Suche und Belegung."],
  },
  {
    version: "v70", datum: "2026-09-25", titel: "Neues Dashboard",
    punkte: ["Was heute ansteht, was zu erledigen ist, und die Liste „Reifen mitnehmen“ zum Abhaken."],
  },
];

// Gibt es für diese Person etwas Ungelesenes? `gesehen` ist die zuletzt geöffnete Fassung
// (user_settings.neuigkeiten_gesehen, Migration 60). Nie gesehen = alles neu.
export function neuigkeitenUngelesen(gesehen: string | null | undefined, liste: Neuigkeit[] = NEUIGKEITEN): Neuigkeit[] {
  const i = gesehen ? liste.findIndex((n) => n.version === gesehen) : -1;
  // Nie gesehen oder eine Fassung, die hier nicht mehr steht: nur die neueste zeigen – nicht die
  // ganze Geschichte auf einmal.
  if (i === -1) return liste.slice(0, 1);
  return liste.slice(0, i);
}
