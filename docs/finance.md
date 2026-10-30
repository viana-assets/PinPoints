# Finance – Buchhaltung als zweites System neben FSM

Stand: 14.10.2026 · **Gebaut: F0 (v145, Migration 87)** – Systemwechsel, Rechte, Navigation, Übersicht,
Einstellungen –, **F1 (v146, Migration 88)** – Konten, Steuerschlüssel, Journal, Storno, Festschreibung – und
**F3 (v147, Migration 89)** – Rechnungen mit „Rechnung nötig“, Zahlungen, offene Posten –, **F2 (v148,
Migration 90)** – Belege und Lieferanten –, **F4 (v149, Migration 91)** – Bank & Kasse – und **F5 (v150, Migration
92)** – Umsatzsteuer-Voranmeldung als Probelauf –, dazu **Nachträge (v151, Migration 93)**: Teilzahlungen,
Kassensturz, § 13b Abs. 2, Fristerinnerung –, **F6 (v152, Migration 94)** – Auswertungen –, **F7 (v153,
Migration 95)** – Anlagen und Abschreibungen –, **F8 (v154, Migration 96)** – Jahresabschluss – und **F9 (v155, Migration 97)** – Export für die Kanzlei –, dazu **Nachträge (v156, Migration 98)**: Skonto, ZUGFeRD-PDF, Jahreswerte, das **Mahnwesen (v157, Migration 99)** und die **Liquiditätsvorschau mit BWA-Vorjahresvergleich (v158, Migration 100)** („So ist … gebaut“ in Abschnitt 7). Alles Weitere ist Konzept. Klickbarer Mockup:
`PinPoints\Claude outputs\Mockup_Finance_v3.html` (nur Beispieldaten).

Wunsch Vitali (13.10.2026): ein vollständiges Buchhaltungsmodul „wie Lexware oder DATEV“, zuerst
nur für den Superadmin sichtbar und später über die Rechtevergabe für andere freizuschalten. Es
steht **nicht** in der bisherigen Navigation, sondern ist ein eigenes System, in das man wechselt.
Das bisherige System heißt dann **FSM – Field Service Management**; später kommt ein **CRM** dazu.

**Pilot, additiv (entschieden 13.10.2026):** Finance kommt **zusätzlich** zu FSM – in FSM ändert sich
nichts, Umsatz, Auswertungen und Rechnungen dort bleiben genau wie heute. Finance erfasst im Pilot
bewusst nur einen **Teilbereich zum Testen**: die Vorgänge mit „Rechnung nötig“ (Abschnitt 4.2).
Finance ist damit im Pilot **nicht** die vollständige Buchhaltung des Betriebs; seine Zahlen (Umsatz,
BWA, EÜR, UStVA) gelten nur für diesen Teilbereich und sind nicht zur Abgabe gedacht. Die
Buchhaltung und die Steuererklärungen laufen bis auf Weiteres wie bisher. Ob und wann Finance
später den ganzen Betrieb abbildet, wird nach dem Pilot entschieden.

Entschieden (Rückfrage 13.10.2026):

| Frage | Entscheidung |
|---|---|
| Gewinnermittlung | **EÜR und Bilanzierung, wählbar ab Start** (je Wirtschaftsjahr in den Finance-Einstellungen) |
| Finanzamt / Steuerberater | **Die App rechnet** (UStVA, EÜR, Bilanz) und **exportiert für DATEV**; übermittelt wird über den Steuerberater oder das ELSTER-Portal. ELSTER direkt aus der App ist eine spätere Phase. |
| Bank | **Erst Datei-Import** (CAMT.053 / CSV aus dem Online-Banking), automatischer Abruf später |
| Mockup | HTML-Datei in `Claude outputs` |

Diese Datei beschreibt, **was** Finance können soll und **in welcher Reihenfolge** es entsteht. Die
offenen Punkte stehen zusätzlich als E21 in `docs/fahrplan.md`. Steuerliche Angaben unten sind der
Stand vom Oktober 2026 und vor der Umsetzung jeder Phase mit dem Steuerberater abzugleichen – die
App ersetzt keine Steuerberatung.

---

## 1. Systemwechsel: FSM · Finance · CRM

**Ein Knopf an der Marke.** Oben links steht wie bisher „Mobiler Reifenservice“, darunter
„MR Assistent“ – neu mit dem aktiven System dahinter: **„MR Assistent · FSM“** bzw.
**„MR Assistent · Finance“**. Ein Tipp auf diesen Block (am Handy: auf den Kopf der Seite) öffnet die
Systemauswahl:

| System | Inhalt | Sichtbar für |
|---|---|---|
| **FSM** – Field Service Management | alles, was es heute gibt: Dashboard, Kunden, Aufträge, Einsatzplanung, Lager, Rechnungen, Zeiterfassung … | wie bisher |
| **Finance** – Buchhaltung | Belege, Buchungen, Bank, Offene Posten, Steuern, Auswertungen, Anlagen, Einstellungen | Recht `finance` · lesen (Vorgabe: **nur Superadmin**) |
| **CRM** | später (Leads, Angebote, Kampagnen) | ausgegraut mit „bald“, bis es gebaut ist |

- **Jedes System hat seine eigene Navigation** (Seitenleiste am Rechner, untere Leiste am Handy).
  Nichts aus Finance taucht in der FSM-Navigation auf und umgekehrt.
- **Erkennbar, wo man ist:** eigener Akzent je System – FSM bleibt Sicherheits-Orange, Finance
  bekommt Petrol (die Markenfarbe `--marke`), CRM später Blau. Dazu der Name unter der Marke.
- **Wer nur ein System sehen darf, sieht keinen Wechsler**, nur den Namen. Der Techniker merkt von
  Finance also nichts.
- Das zuletzt gewählte System bleibt je Gerät gemerkt; ein Link (`?system=finance`) öffnet direkt.
- Technisch: `SYSTEME` als eine zentrale Liste (Konstanten-Regel), die Finance-Seiten als eigene Liste
  `FINANCE_SEITEN` (`lib/finance/seiten.ts`) – `MODULE` bleibt die Liste von FSM. `app/page.tsx` schaltet nur
  die Navigation und den Inhaltsbereich um. Finance-Seiten liegen unter `components/finance/`; Handlungen
  späterer Phasen kommen nach `app/_seite/useFinance*.ts`.

### So ist F0 gebaut (v145)

- `lib/systeme.ts`: `SYSTEME`, `sichtbareSysteme()`, `aktivesSystem()`, Startwert aus `?system=`, sonst FSM. Ohne
  Recht `finance` läuft immer FSM. Bis v148 merkte sich jedes Gerät das zuletzt gewählte System (`mr-system`) und
  öffnete danach immer Finance; seit v149 startet die App wieder immer in FSM › Einsatzplanung (Wunsch Vitali
  14.10.2026).
- `components/system/SystemMarke.tsx` (Marke mit Systemname, als Knopf nur bei mehr als einem System) und
  `SystemWahl.tsx` (Blatt mit FSM, Finance, CRM „bald“).
- `app/page.tsx`: In Finance stehen die Finance-Seiten in der Navigation (`FINANCE_SEITEN`, am Handy vier unten,
  der Rest unter „Weitere“ – seit v162 als Kacheln in Gruppen wie in FSM: Zahlungen, Buchführung, Steuern und
  Auswertungen, Jahresende und Kanzlei, System; `FINANCE_WEITERE_GRUPPEN`), der ganze FSM-Inhalt ist ausgehängt, `#app` trägt `vollseite sys-finance` (Petrol
  statt Orange). Springt die App von sich aus in einen FSM-Reiter (Push-Meldung, Sprung aus dem Chat), wechselt
  sie zurück nach FSM.
- `components/finance/FinanceBereich.tsx`: Pilot-Hinweis auf jeder Seite, Übersicht (Einrichtung, was kommt),
  Einstellungen (Abschnitt 3; speichern braucht `finance.einstellungen`), Platzhalter je Phase.
- Datenbank: Migration 87 (`fin_einstellungen`, Rechte). Fehlt sie, sagt die Seite „Migration 87 fehlt“.
- Noch nicht in F0: Steuernummer/USt-IdNr. werden aus Admin › Betrieb nur erwähnt, nicht angezeigt; Wirtschaftsjahr
  ist das laufende Kalenderjahr (ein abweichendes Wirtschaftsjahr wird mit F1 ausgewertet).

## 2. Rechte – zuerst nur der Superadmin

Neuer Bereich **`finance`** in `RECHTE_KATALOG` mit Unterrechten, nach dem Muster von Lager und
Zeiterfassung:

| Schlüssel | lesen | schreiben | löschen |
|---|---|---|---|
| `finance` | Finance öffnen, Übersicht | – | – |
| `finance.rechnungen` | Finance › Rechnungen, Offene Posten | Rechnung aus Finance ausstellen, „bar bezahlt“ (F3) | – |
| `finance.belege` | Belege sehen | Belege erfassen, buchen | Entwurf verwerfen (gebuchte nie) |
| `finance.bank` | Bankkonten, Umsätze | importieren, zuordnen | Import vor dem Zuordnen zurücknehmen |
| `finance.buchen` | Journal, Kontenblätter | manuelle Buchungen, Storno | – |
| `finance.steuer` | UStVA, Fristen | Voranmeldung als „abgegeben“ festhalten | – |
| `finance.abschluss` | Auswertungen, EÜR, Bilanz | Monat festschreiben, Abschlussbuchungen | – |
| `finance.einstellungen` | – | Besteuerung, Kontenrahmen, Wirtschaftsjahr | – |

- **Vorgabe: alle Rollenlisten leer** – der Superadmin darf ohnehin alles (`darf()`), alle anderen
  sehen nichts. Freischalten wie gewohnt in Admin › Rechte, z. B. „Finance lesen“ für Admin.
- Die Datenbank setzt das durch: jede `fin_*`-Tabelle mit RLS auf `darf('finance.…', …)`, nie
  `auth.role() = 'authenticated'`.
- Abhängigkeiten in `RECHTE_ABHAENGIG`: Wer Belege buchen darf, braucht „Buchungen lesen“; wer
  festschreibt, braucht „Buchungen schreiben“.

## 3. Finance-Einstellungen (vor der ersten Buchung)

Ein Assistent beim ersten Öffnen, danach unter Finance › Einstellungen. Änderungen, die rückwirken
würden, gelten **ab einem Wirtschaftsjahr** und nicht rückwirkend für festgeschriebene Zeiträume.

**Unternehmen**
- Rechtsform (Einzelunternehmen, GbR, UG/GmbH, …), Steuernummer, USt-IdNr., Finanzamt –
  vorbelegt aus Admin › Betrieb (Briefkopf), nicht doppelt gepflegt.
- Wirtschaftsjahr (Beginn-Monat; Vorgabe Kalenderjahr – `datev_wj_beginn_monat` gibt es schon).

**Gewinnermittlung** – je Wirtschaftsjahr wählbar:
- **EÜR** (§ 4 Abs. 3 EStG): Zufluss/Abfluss, Anlage EÜR.
- **Bilanzierung** (§§ 4 Abs. 1, 5 EStG / HGB): Forderungen, Verbindlichkeiten, Abgrenzungen,
  Bilanz und GuV.
- In beiden Fällen bucht die App **doppelt** (Soll an Haben). Die EÜR ist eine Auswertung derselben
  Buchungen nach Zahlungsdatum – so ist ein späterer Wechsel zur Bilanz ohne Neuerfassung möglich.

**Kontenrahmen**
- **SKR03** (Vorgabe, passt zum bestehenden DATEV-Export: 8400/8300/8100) oder **SKR04**.
- Eigene Konten ergänzbar. Die Kontenliste schreiben wir selbst (Nummernkreis nach SKR,
  Bezeichnungen eigene Formulierung) – keine Übernahme fremder Kontenplan-Texte.

**Umsatzsteuer** – das Kernstück der Einstellungen:

| Einstellung | Auswahl | Wirkung in der App |
|---|---|---|
| Besteuerungsform | **Regelbesteuerung** · **Kleinunternehmer (§ 19 UStG)** | Kleinunternehmer: keine Umsatzsteuer auf Ausgangsrechnungen (Hinweis „Gemäß § 19 UStG wird keine Umsatzsteuer berechnet“), kein Vorsteuerabzug, keine UStVA; Rechnungen in FSM folgen dieser Einstellung |
| Kleinunternehmer-Überwachung | automatisch | Grenzen Stand 2026: Vorjahr höchstens **25.000 €**, laufendes Jahr höchstens **100.000 €**. Die App zeigt den Stand als Balken; beim Überschreiten von 100.000 € endet die Regelung **ab diesem Umsatz** – Warnung schon vorher (z. B. ab 90 %) |
| Versteuerung | **Soll** (nach vereinbarten Entgelten) · **Ist** (nach vereinnahmten Entgelten) | Ist-Versteuerung auf Antrag bis 800.000 € Vorjahresumsatz (§ 20 UStG); bestimmt, ob eine Rechnung im Monat der Leistung oder der Zahlung in die UStVA fällt |
| Voranmeldungszeitraum | monatlich · vierteljährlich · keine (befreit) | nach Vorjahressteuer: über 9.000 € monatlich, über 2.000 € vierteljährlich, darunter Befreiung möglich; Gründungsjahr und Folgejahr in der Regel Pflicht |
| Dauerfristverlängerung | an/aus | Frist +1 Monat; bei monatlicher Abgabe Sondervorauszahlung 1/11 der Vorjahres-Vorauszahlungen – die App rechnet sie aus und verrechnet sie in der Dezember-Voranmeldung |
| § 13b als Leistungsempfänger | an/aus je Lieferant | Eingangsrechnungen ohne Umsatzsteuer, z. B. **Dienstleistungen** von Unternehmern aus dem EU-Ausland (Software-Abo, Wartung) oder bestimmte inländische Leistungen: die App bucht die Steuer selbst geschuldet **und** zugleich als Vorsteuer (Kz. 46/47 bzw. 84/85, Vorsteuer Kz. 67) – unterm Strich null. **Auch Kleinunternehmer** schulden diese Steuer, dürfen sie aber nicht als Vorsteuer abziehen. Warenkäufe im EU-Ausland sind dagegen innergemeinschaftlicher Erwerb (nächste Zeile) |
| § 13b als Leistender | je Ausgangsrechnung | Rechnung ohne Steuer mit Hinweis „Steuerschuldnerschaft des Leistungsempfängers“ (für den Reifenservice selten – Privatkunden sind nie betroffen) |
| Innergemeinschaftlicher Erwerb / Lieferung | je Partner (USt-IdNr.) | Erwerb: Steuer + Vorsteuer (Kz. 89/93/61); Lieferung: steuerfrei, Zusammenfassende Meldung |

Hinweis zum Begriff: „Unternehmen nach § 13b“ gibt es so nicht – § 13b regelt einzelne Umsätze, bei
denen der Empfänger die Steuer schuldet. Die Frage „muss das Unternehmen überhaupt Umsatzsteuer
zahlen?“ beantwortet die **Besteuerungsform** (Regelbesteuerung oder Kleinunternehmer § 19).
Deshalb sind es oben zwei getrennte Einstellungen.

## 4. Funktionsumfang

### 4.1 Belege (Eingangsrechnungen, Quittungen)
- Hochladen: Foto am Handy (Tankquittung vor Ort), PDF, **E-Rechnung** (XRechnung / ZUGFeRD) –
  der Empfang muss seit 01.01.2025 möglich sein; strukturierte Daten werden ausgelesen statt abgetippt.
- Erfassen: Lieferant (Kreditor), Datum, Belegnummer, Beträge je Steuersatz, Fälligkeit, Skonto.
- **Kontovorschlag** aus Regeln („Tankstelle → 4530 Kfz-Betriebskosten“) und aus der letzten Buchung
  desselben Lieferanten.
- Status: Entwurf → gebucht → bezahlt. Gebuchte Belege sind unveränderbar; Korrektur nur per Storno.
- Ablage der Bilddatei unveränderbar (eigener Speicher-Bucket, Löschen gesperrt), Aufbewahrung 8/10 Jahre.

### 4.2 Rechnungen – der Haken „Rechnung nötig“ bringt den Vorgang nach Finance

Entschieden 13.10.2026 (Vitali): **Die Rechnungsstellung bleibt in FSM.** Finance bekommt **nur die
Vorgänge, an denen in FSM „Rechnung nötig“ angehakt ist** – und zwar sofort mit dem Haken, nicht erst
beim Erledigen. Alle anderen Aufträge und Rechnungen bleiben in FSM und gehen nicht nach Finance.

| In FSM am Auftrag | In Finance |
|---|---|
| „Rechnung nötig“ **angehakt**, Auftrag offen oder in Arbeit | erscheint unter Rechnungen › **Vorgemerkt** („kommt“) |
| „Rechnung nötig“ angehakt, Auftrag **erledigt**, noch keine Rechnung | Rechnungen › **Zu erstellen** – mit Zahl an „Rechnungen“ und unter „Zu erledigen“ in der Übersicht |
| Rechnung dazu **ausgestellt** (in Finance **oder** in FSM) | Rechnungen › Ausgestellt, **gebucht** als Umsatz, offener Posten beim Kunden |
| Haken wieder **entfernt**, bevor eine Rechnung existiert | verschwindet aus Finance |
| **ohne** „Rechnung nötig“ (auch eine FSM-Rechnung dazu) | nichts – bleibt vollständig in FSM |

**Weg eines Vorgangs mit Haken**

1. **FSM:** „Rechnung nötig“ wird angehakt → der Vorgang steht in Finance als vorgemerkt (Kunde,
   Auftrag, Datum, voraussichtlicher Betrag aus den Leistungen).
2. **Erledigt** → er rückt nach „Zu erstellen“ (Regel wie heute, `rechnungOffen()` in
   `lib/helpers.ts`: erledigt, Rechnung nötig, noch keine Rechnung).
3. **Rechnung erstellen** – wahlweise aus Finance (Knopf am Vorgang) oder wie bisher in FSM; es ist
   dieselbe Rechnung (ein Nummernkreis, eine Tabelle `rechnungen`, eine Druckansicht). Positionen aus
   den Leistungen des Auftrags, Steuer aus den Finance-Einstellungen:
   - Regelbesteuerung: Steuersätze je Position (19 % / 7 %).
   - Kleinunternehmer § 19: ohne Steuer, mit dem Pflichthinweis „Gemäß § 19 UStG wird keine
     Umsatzsteuer berechnet“.
   - § 13b als Leistender (selten): ohne Steuer, Hinweis „Steuerschuldnerschaft des Leistungsempfängers“,
     USt-IdNr. des Kunden Pflicht.
4. **Ausstellen** (eine Transaktion in der Datenbank, egal ob aus Finance oder FSM):
   - lückenlose Rechnungsnummer (vorhandener Nummernkreis, `vergib_rechnungsnummer()`), Snapshot wie heute;
   - **Buchung** Forderung an Erlöse je Steuersatz und an Umsatzsteuer – bei Kleinunternehmer Erlöse
     § 19 ohne Steuer – **nur wenn der Auftrag „Rechnung nötig“ trägt**;
   - **offener Posten** beim Debitor mit Fälligkeit (Zahlungsziel aus Betriebsdaten);
   - in FSM steht der Auftrag danach wie heute als „Rechnung erstellt“ mit Nummer.
   Scheitert ein Teil, entsteht nichts – keine Rechnung ohne Buchung, keine Buchung ohne Rechnung.
5. **Umsatzsteuer:** Bei Soll-Versteuerung zählt die Rechnung im Monat der Leistung in die UStVA, bei
   Ist-Versteuerung im Monat des Zahlungseingangs (aus dem Bankabgleich).
6. **Versand** wie heute: PDF, E-Mail an den Kunden, Girocode. Später E-Rechnung (XRechnung/ZUGFeRD)
   für Geschäftskunden – Pflicht ab 2027 bei mehr als 800.000 € Vorjahresumsatz, ab 2028 für alle
   B2B; Privatkunden und Kleinbeträge bis 250 € sind ausgenommen.
7. **Bezahlt:** Der Bankabgleich (4.3) bucht Bank an Forderung, der offene Posten ist weg, FSM zeigt
   „bezahlt“.
8. **Storno:** Stornorechnung mit eigener Nummer (wie heute) und Gegenbuchung; nach Festschreibung des
   Monats landet die Gegenbuchung im laufenden Monat.

**Reiter in Finance › Rechnungen:** Zu erstellen · Vorgemerkt · Ausgestellt (offen / überfällig /
bezahlt) · Storniert. Später Mahnstufen.

**Abgrenzung im Pilot:** Aufträge ohne „Rechnung nötig“ übernimmt Finance nicht – sie bleiben mit
ihrem Umsatz in FSM (Auswertungen, Rechnungsbuch, DATEV-Export wie heute). Weil Finance im Pilot nur
diesen Teilbereich enthält, zeigt jede Finance-Auswertung oben „Pilot · nur Vorgänge mit Rechnung
nötig“, und UStVA/EÜR aus Finance sind als **Probelauf** gekennzeichnet, nicht als Abgabe.

### 4.3 Bank und Kasse
- Bankkonten anlegen (IBAN, Konto 1200 bzw. 1800), **Import CAMT.053 oder CSV**; doppelte Umsätze
  werden beim zweiten Import erkannt.
- **Abgleich:** Vorschläge nach Betrag, Rechnungsnummer im Verwendungszweck und Name; ein Tipp
  bestätigt. Regeln für Wiederkehrendes (Miete, Leasing, Versicherung).
- **Kassenbuch** für Bargeld vor Ort (bestätigt 13.10.2026: es gibt Barzahlungen beim Kunden):
  fortlaufend, tagesgenau, ohne nachträgliche Änderung, Kassensturz. Im Pilot: Wird eine Rechnung zu
  einem Vorgang mit „Rechnung nötig“ bar bezahlt, bucht „bar bezahlt“ an der Rechnung Kasse an
  Forderung und schließt den offenen Posten – sonst bliebe sie offen, obwohl das Geld da ist.
- Später: automatischer Abruf über einen Bankdienst (PSD2/FinTS) – Kontodaten gingen dann an diesen
  Dienst; braucht Vertrag und Datenschutzprüfung.

### 4.4 Buchen (Journal)
- Buchungsmaske Soll / Haben / Betrag / Steuerschlüssel / Beleg; Splitbuchungen; die Datenbank
  lehnt jede Buchung ab, deren Soll und Haben nicht gleich sind.
- Steuerschlüssel rechnen Vorsteuer bzw. Umsatzsteuer automatisch heraus (19 %, 7 %, 0 %, § 13b,
  innergemeinschaftlich).
- **Festschreibung je Monat:** danach unveränderbar, nur Storno mit Gegenbuchung. Lückenlose
  Buchungsnummern wie bei den Rechnungen (Zähler mit Sperre, keine Sequence).
- Wiederkehrende Buchungen, Privatentnahmen/-einlagen.
- **Anfangsbestände nachtragbar** (entschieden 13.10.2026): Finance startet ohne Eröffnungswerte. Bank-
  und Kassenstand zeigen bis dahin „ohne Anfangsbestand“; Eröffnungsbuchungen (Kontostände, offene
  Posten von vorher, Anlagen) lassen sich jederzeit zum Starttag nachtragen, ohne die Buchungen
  danach anzufassen. Ob ältere Daten (frühere Rechnungen) übernommen werden, wird später geprüft.

### 4.5 Anlagen
- Anlagenverzeichnis mit Anschaffung, Nutzungsdauer, linearer AfA (monatsgenau).
- Geringwertige Wirtschaftsgüter: Sofortabschreibung bis 800 € netto, wahlweise **Sammelposten**
  250–1.000 € über 5 Jahre (Wahl je Wirtschaftsjahr einheitlich). Verzeichnis für alles über 250 €.
- Die Firmenfahrzeuge (Transporter) aus FSM als Anlagen übernehmbar.

### 4.6 Steuern
- **UStVA** je Zeitraum mit allen benötigten Kennzahlen (81, 86, 66, 83, bei Bedarf 46/47, 84/85,
  89/93/61, 41, 21), Gegenprobe gegen die Konten, Fristenkalender (10. des Folgemonats bzw. mit
  Dauerfristverlängerung einen Monat später), Erinnerung per Push an den Superadmin.
- Ausgabe als Übersicht/PDF für Steuerberater oder ELSTER-Portal; „abgegeben am …“ festhalten,
  danach ist der Zeitraum gesperrt.
- Zusammenfassende Meldung, Werte für die Umsatzsteuer-Jahreserklärung.
- Später: Übermittlung direkt per ELSTER (ERiC-Bibliothek auf einem Server, Zertifikat).

### 4.7 Auswertungen und Abschluss
- Summen- und Saldenliste, Kontenblätter, Offene-Posten-Listen, **BWA** (kurz, monatlich, Vorjahresvergleich).
- **EÜR** nach den Zeilen der Anlage EÜR; **Bilanz und GuV** nach HGB-Gliederung (Kleinst-/kleine
  Kapitalgesellschaft), Abschlussbuchungen (Abgrenzungen, Rückstellungen), Jahresübernahme.
- Liquiditätsvorschau aus offenen Posten und wiederkehrenden Zahlungen.

### 4.8 Export
- **DATEV-Buchungsstapel** (EXTF) – der heutige Export aus Auswertungen wird zum Export des ganzen
  Journals, mit Debitoren/Kreditoren-Stammdaten und Beleglinks.
- GoBD-Datenexport für die Betriebsprüfung (Datenträgerüberlassung), Verfahrensdokumentation als Vorlage.

## 5. Grundsätze für die Umsetzung

- **Unveränderbarkeit (GoBD):** gebucht ist gebucht. Korrektur nur per Storno, Festschreibung je
  Monat, jede Änderung im Protokoll. Durchsetzung in BEFORE-Triggern mit Klartext (CLAUDE.md, Abschnitt 2).
- **Snapshot-Prinzip** wie bei den Rechnungen: Eine Buchung speichert Konto, Steuersatz und Beleg-
  angaben selbst, nicht nur Verweise.
- **Testdaten getrennt:** Testkunden/-rechnungen (negative Nummern) erzeugen keine Finance-Buchungen.
- **„Alle Daten löschen“ löscht Finance mit** (entschieden 13.10.2026): alle `fin_*`-Tabellen samt
  Finance-Einstellungen, wie jede Fachtabelle. Keine `fin_*`-Tabelle kommt in `alle_daten_behalten()`.
  Vorher bietet die App die Sicherung an; „Alle Daten sichern“ (v143) gibt es auch für sich allein.
- **Datenschutz:** Belege und Bankumsätze enthalten Personendaten Dritter – nur für Rollen mit Recht,
  nicht in Push-Texten, nicht in Fehlermeldungen. Keine Bankdaten an Dritte ohne eigene Entscheidung.
- **Eigenbau:** Die App ist kein zertifiziertes Buchhaltungsprogramm. Jede Phase wird vor dem echten
  Einsatz mit dem Steuerberater durchgesprochen; der DATEV-Export bleibt der sichere Weg.

## 6. Datenmodell (Skizze)

| Tabelle | Inhalt |
|---|---|
| `fin_einstellungen` | eine Zeile je Wirtschaftsjahr: Gewinnermittlung, Kontenrahmen, Besteuerungsform, Soll/Ist, Zeitraum, Dauerfristverlängerung |
| `fin_konten` | Kontenplan (Nummer, Bezeichnung, Art, Steuerschlüssel-Vorgabe, EÜR-Zeile, Bilanz-Position) |
| `fin_steuerschluessel` | Satz, Vorsteuer-/USt-Konto, UStVA-Kennzahlen |
| `rechnungen` (vorhanden) | bekommt `buchung_id` (die Erlösbuchung, nur bei „Rechnung nötig“) und `bezahlt_am`; der Nummernkreis bleibt |
| `fin_partner` | Kreditoren (neu) und Debitoren (Verweis auf `customers`), USt-IdNr., § 13b |
| `fin_belege` | Eingangsbelege mit Datei, Beträgen, Status |
| `fin_buchungen` / `fin_buchungszeilen` | Buchungskopf (Nummer, Datum, Beleg, Festschreibung) und Zeilen (Konto, Soll/Haben, Betrag, Steuer) |
| `fin_perioden` | Monate mit Festschreibung, UStVA „abgegeben am“ |
| `fin_bankkonten` / `fin_bankumsaetze` | Konten, importierte Umsätze, Zuordnung |
| `fin_kasse` | Kassenbuch |
| `fin_anlagen` | Anlagenverzeichnis, AfA-Plan |
| `fin_regeln` | Kontierungs- und Bankregeln |

## 7. Phasen

Jede Phase ist eine eigene Lieferung mit Migration, Rücknahme, Tests und Doku – wie bisher.

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **F0** | Systemwechsel FSM/Finance/CRM, Rechte `finance.*` (nur Superadmin), leere Finance-Oberfläche, Einstellungs-Assistent (Abschnitt 3) | Wechsler sichtbar, Einstellungen speicherbar |
| **F1** | Kontenrahmen SKR03/SKR04, Steuerschlüssel, Journal mit manuellen Buchungen, Soll=Haben-Prüfung, Festschreibung, Storno | Man kann von Hand buchen |
| **F2** | Belege und Kreditoren: Upload, E-Rechnung lesen, Kontovorschlag, Buchen | Eingangsrechnungen erfasst |
| **F3** | Rechnungen: Vorgänge mit „Rechnung nötig“ aus FSM als Vorgemerkt/Zu erstellen, Rechnung aus Finance oder FSM, Ausstellen bucht sofort Umsatz und offenen Posten, Storno mit Gegenbuchung; ohne Haken nichts | Rechnung und Umsatz in einem Schritt |
| **F4** | Bank-Import CAMT/CSV, Abgleich mit Vorschlägen, Kassenbuch | Zahlungen zugeordnet, OP aktuell |
| **F5** | UStVA, Fristen, § 13b, innergem. Erwerb, Kleinunternehmer-Überwachung, Sondervorauszahlung | Voranmeldung aus der App |
| **F6** | Summen- und Saldenliste, Kontenblätter, BWA, EÜR | Monats- und Jahreszahlen |
| **F7** | Anlagen und AfA, GWG, Sammelposten | Abschreibungen automatisch |
| **F8** | Bilanz und GuV, Abschlussbuchungen, Jahresübernahme | Jahresabschluss vorbereitet |
| **F9** | DATEV-Export des ganzen Journals, GoBD-Export, Verfahrensdokumentation | Übergabe an Steuerberater |
| später | Bankabruf, ELSTER direkt, E-Rechnung-Ausgabe, Mahnwesen, Liquiditätsplanung, CRM | – |

### So ist F1 gebaut (v146, Migration 88)

Bewusst schlank, damit F3 (Rechnungen) bald folgt:

- **Konten** (`fin_konten`): je 72 Konten für SKR03 und SKR04, Nummern nach DATEV-Standard, Bezeichnungen eigene
  Formulierung – **vor dem Echtbetrieb mit dem Steuerberater abgleichen**. Eigene Konten anlegen und Konten
  ausblenden (Recht `finance.einstellungen`); gelöscht wird nie. Nummer und Art eines Kontos stehen fest.
- **Steuerschlüssel** (`fin_steuerschluessel`): USt 19/7, Vorsteuer 19/7, § 13b 19 (Empfänger), ig. Erwerb 19,
  ig. Lieferung, steuerfrei, Kleinunternehmer. Welche angeboten werden, folgt den Einstellungen (Kleinunternehmer:
  keine USt/VSt; § 13b und ig. nur, wenn eingeschaltet).
- **Buchen** (`fin_buchen()`): Datum, Beleg, Text und ein oder mehrere Posten (Soll, Haben, Betrag, Schlüssel).
  Die Datenbank rechnet die Steuer und schreibt die Zeilen:
  - USt/Vorsteuer: Betrag **brutto**, die Steuer wird herausgerechnet und auf der Seite des Erlös-, Aufwands- oder
    Anlagekontos abgespalten (Rechnung 119 € → 1400 an 8400 100 € + 1776 19 €; Gutschrift umgekehrt).
  - § 13b / ig. Erwerb: Betrag **netto**, die Steuer kommt als USt und Vorsteuer dazu; Kleinunternehmer ohne
    Vorsteuer (die Steuer wird Aufwand).
  - Soll = Haben wird geprüft; Nummern lückenlos je Jahr (eine abgelehnte Buchung verbraucht keine).
  - Das Fenster zeigt vorher dieselbe Rechnung (`lib/finance/buchung.ts`).
- **Kein Ändern, kein Löschen** (GoBD): korrigiert wird mit **Storno** – Gegenbuchung mit vertauschten Seiten,
  Grund Pflicht, im festgeschriebenen Monat mit heutigem Datum.
- **Festschreiben** je Monat (Recht `finance.abschluss`): danach wird dort nicht mehr gebucht; nicht rücknehmbar.
- **Konten mit Saldo** (Soll, Haben, Saldo im Jahr) – eine erste Summen- und Saldenliste.
- Ist ein Jahr bebucht, lassen sich Kontenrahmen und Beginn des Wirtschaftsjahres nicht mehr umstellen. Ein vom
  Kalenderjahr abweichendes Wirtschaftsjahr bucht F1 noch nicht.
- „Alle Daten löschen“ leert Journal und Festschreibungen; Konten und Steuerschlüssel bleiben.
- Noch nicht in F1: Anfangsbestände als eigener Assistent (bis dahin von Hand gegen 9000 „Saldenvorträge“),
  Splitbuchungen über mehrere Konten auf einer Seite, Debitoren/Kreditoren (kommen mit F3/F2), Export (F9).

### So ist F3 gebaut (v147, Migration 89)

- **Finance › Rechnungen**, drei Reiter: *Zu erstellen* (erledigt, Haken, keine Rechnung – mit „Rechnung
  erstellen“), *Vorgemerkt* (Haken, Auftrag läuft noch; Betrag als Schätzung aus den Leistungen), *Ausgestellt*
  (Rechnungen des Jahres mit Zustand). Anderswo abgerechnete Aufträge stehen als Hinweis darunter.
- **Rechnung erstellen** öffnet das gewohnte Rechnungsfenster von FSM – dieselbe Rechnung, derselbe Nummernkreis.
- **Gebucht wird in der Datenbank** beim Ausstellen (Trigger an `rechnungen`), egal von wo: Forderung (1400/1200)
  an Erlöse je Steuersatz (8400/8300/8200, Kleinunternehmer 8195 bzw. SKR04 4400/4300/4200/4185) und Umsatzsteuer.
  Die Summen müssen zum Beleg passen. Fällig nach 14 Tagen. Eine Stornorechnung storniert die Buchung mit.
- **FSM wird nie aufgehalten** (Pilot): Klappt die Buchung nicht – Einstellungen fehlen, Monat festgeschrieben,
  Konto ausgeblendet, Summen passen nicht –, entsteht die Rechnung trotzdem. Finance zeigt „nicht gebucht“ mit dem
  Grund und „Jetzt buchen“. Abweichend vom ursprünglichen Konzept („keine Rechnung ohne Buchung“), weil FSM im
  Pilot unverändert bleiben soll.
- **Bezahlt:** „Bar bezahlt“ (Kasse an Forderung) oder „Überweisung eingegangen“ (Bank an Forderung), ganzer
  Betrag mit Datum; „Zahlung zurücknehmen“ mit Grund (Gegenbuchung). Teilzahlungen und der Bankabgleich kommen mit F4.
- Buchungen aus Rechnungen und Zahlungen lassen sich unter Buchungen nicht von Hand stornieren – das geht über die
  Rechnung bzw. „Zahlung zurücknehmen“.
- **Offene Posten:** gebucht, nicht bezahlt, nicht storniert – Summe und überfällig. Lieferanten kommen mit F2.
- **Übersicht › Zu erledigen:** Rechnungen zu erstellen, nicht gebucht, überfällig.
- Ältere Rechnungen (vor Migration 89) werden nicht automatisch nachgebucht; je Rechnung „Jetzt buchen“.

### So ist F2 gebaut (v148, Migration 90)

- **Finance › Belege**, Reiter Entwürfe · Offen · Bezahlt · Storniert · Lieferanten; „Beleg erfassen“.
- **Entwurf:** Lieferant (wählen oder neu – entsteht beim Speichern), Belegdatum, Beleg-Nr., „Was“, Fälligkeit,
  ein oder mehrere Posten (Konto aus Aufwand/Anlagen, Betrag, Steuer) und eine **Datei**: Foto (wird verkleinert),
  PDF oder E-Rechnung. Speichern als Entwurf jederzeit; verwerfen mit Recht „löschen“.
- **E-Rechnung:** Eine XML-Datei nach EN 16931 (XRechnung in UBL oder CII, auch das XML aus ZUGFeRD/Factur-X)
  füllt Lieferant (gefunden über USt-IdNr. oder Name, sonst neu), Nummer, Datum, Fälligkeit und je Steuersatz einen
  Posten; Kategorie AE → § 13b, K → innergemeinschaftlicher Erwerb. Ein ZUGFeRD-**PDF** wird abgelegt, sein
  XML-Anhang aber noch nicht gelesen (später).
- **Kontovorschlag:** das am Lieferanten hinterlegte Konto, sonst das des letzten gebuchten Belegs. Regeln
  („Tankstelle → 4530“) entstehen so von selbst; eine eigene Regeltabelle gibt es nicht.
- **Buchen:** Aufwand an Verbindlichkeiten (1600/3300) über dieselbe Steuerlogik wie F1 – Vorsteuer aus brutto,
  § 13b netto mit USt und VSt, Kleinunternehmer ohne Vorsteuer. Auf Wunsch im selben Schritt „bar bezahlt“ (Kasse)
  oder „per Bank bezahlt“. Fälligkeit ohne Angabe = Belegdatum.
- **Danach:** unveränderbar; Zahlung erfassen/zurücknehmen, Storno (Gegenbuchung, nicht bei erfasster Zahlung).
  Die Datei eines gebuchten Belegs bleibt im Speicher und lässt sich nicht löschen (GoBD).
- **Offene Posten** zeigen jetzt beide Seiten: Kunden (F3) und Lieferanten (F2).
- „Alle Daten löschen“ leert Belege und Lieferanten und entfernt die Dateien (`app/api/alle-daten/fotos`).

### So ist F4 gebaut (v149, Migration 91)

- **Finance › Bank & Kasse**, Reiter Offen · Zugeordnet · Kasse · Konten & Importe.
- **Bankkonten:** Name, IBAN (geprüft, je IBAN ein Konto) und Sachkonto aus „Kasse und Bank“ (Vorgabe 1200 bzw.
  1800; ein zweites Konto bekommt ein eigenes Sachkonto, unter Buchungen › Konten anzulegen). Ausblenden statt löschen.
- **Kontoauszug einlesen:** CAMT.053 (XML) oder CSV aus dem Online-Banking, höchstens 5 MB und 5.000 Umsätze. Gelesen
  wird im Browser (`lib/finance/bank.ts`): CAMT nur gebuchte Umsätze (vorgemerkte übersprungen), Sammelbuchungen
  einzeln, Endsaldo laut Bank; CSV mit Kopfzeile (Spalten am Namen erkannt, auch getrennte Soll/Haben-Spalten,
  deutsche Zahlen und Daten, UTF-8 oder Windows-1252, Vorspann mit IBAN). Vorschau mit Summen und Zeitraum, das Konto
  wird an der IBAN erkannt. Doppelte Umsätze erkennt die Datenbank (Prüfsumme aus Datum, Betrag, Zweck, Name, IBAN,
  Referenz – Groß/Klein und Leerzeichen egal; gleiche Umsätze im selben Auszug zählen einzeln).
- **Abgleich:** je Umsatz Vorschläge – Eingänge aus offenen Rechnungen, Abbuchungen aus offenen Belegen; Nummer im
  Zweck zählt 3, gleicher Betrag 2, Name 1. Zuordnen nur bei gleichem Betrag (Teilzahlungen später): Bank an Forderung
  bzw. Verbindlichkeit an Bank, Rechnung/Beleg gilt als bezahlt. Sonst **auf ein Konto** (Gebühren, Miete, Privat,
  Umbuchung) mit Steuerschlüssel – derselbe Weg wie eine Buchung von Hand. Wurde ein Umsatz desselben Namens schon
  auf ein Konto gebucht, stehen Konto und Steuer schon da (eine eigene Regeltabelle gibt es nicht). Oder
  **ignorieren** mit Grund (z. B. schon von Hand gebucht).
- **Aufheben** bucht gegen und macht den Umsatz wieder offen, Rechnung oder Beleg wieder unbezahlt. Wird die Zahlung
  an der Rechnung oder am Beleg zurückgenommen, wird der Umsatz ebenfalls wieder offen. Bankbuchungen lassen sich
  unter Buchungen nicht von Hand stornieren.
- **Import zurücknehmen** (Recht „löschen“), solange nichts daraus zugeordnet ist. Je Import der Kontostand laut Bank
  neben dem Saldo in Finance – eine Differenz zeigt offene Umsätze, fehlenden Anfangsbestand oder Buchungen von Hand.
- **Kassenbuch:** alle Bewegungen auf 1000 bzw. 1600 nach Datum mit laufendem Bestand; Warnung, wenn er unter null
  fiele. „Einnahme“ und „Ausgabe“ öffnen die Buchung mit der Kasse schon im Soll bzw. Haben. Bar bezahlte Rechnungen
  und Belege stehen von selbst darin. Ein Kassensturz-Protokoll und Sperren je Tag kommen später; bis dahin schützt
  die Festschreibung je Monat.
- **Übersicht › Zu erledigen:** zusätzlich „Bankumsätze zuzuordnen“.
- **Datenschutz:** Kontoauszüge enthalten Namen und IBANs der Zahlenden. Gespeichert werden nur Datum, Betrag, Zweck,
  Name, IBAN und Referenz – nötig für den Abgleich, sichtbar nur mit „Finance › Bank“, an keinen Dritten, in keiner
  Fehlermeldung. „Alle Daten löschen“ leert Bankkonten, Importe und Umsätze. Ein automatischer Bankabruf (PSD2/FinTS)
  bleibt „später“ (4.3).

### So ist F5 gebaut (v150, Migration 92)

- **Finance › Steuern:** oben die Art der Anmeldung aus den Einstellungen, darunter je Zeitraum (Monat, Quartal oder
  bei Befreiung nur das Jahr) Frist, Zustand und Zahllast. Kommende Zeiträume nur auf Wunsch.
- **Kennzahlen** rechnet die Datenbank aus dem Journal (`fin_ust_kennzahlen()`): jede Zeile mit Steuerschlüssel, je
  Posten – Bemessung vom Erlös- bzw. Aufwandskonto, Steuer vom Steuerkonto. 81/86 (USt 19/7), 41 (ig. Lieferung),
  48 (steuerfrei, nur Erlöse – je nach Art auch 43, mit dem Steuerberater klären), 89 + 61 (ig. Erwerb), 46/47 + 67
  (§ 13b, sonstige Leistungen aus dem EU-Ausland; Bauleistungen nach § 13b Abs. 2 – Kz 84/85 – gibt es als Schlüssel
  noch nicht), 66 (Vorsteuer), 39 (Sondervorauszahlung im Dezember), 83 (Ergebnis). Kleinunternehmer-Umsätze (`ku`)
  und Umsätze ohne Schlüssel stehen nicht drin. Vordruck 2026: Kennzahlen wie 2025, nur Kz 23 heißt jetzt Kz 500
  (ergänzende Angaben – hier nicht gebraucht).
- **Formularansicht** (`lib/finance/steuern.ts`): Bemessungsgrundlagen in vollen Euro, die Steuer zu 81/86/89 rechnet
  das Formular selbst daraus; daneben „laut Buchhaltung“, wenn Rundungscent abweichen.
- **Ist-Versteuerung:** Rechnungen aus FSM zählen im Zeitraum der Zahlung (bar, Überweisung oder Bankabgleich), ihr
  Storno nur, wenn die Rechnung bezahlt war. Von Hand gebuchte Ausgangsrechnungen zählen am Buchungsdatum.
- **Frist:** 10. Tag nach Ende des Zeitraums, mit Dauerfristverlängerung einen Monat später; Samstag, Sonntag und
  bundesweite Feiertage schieben auf den nächsten Werktag (§ 108 Abs. 3 AO). Landesfeiertage am Sitz des Finanzamts
  fehlen – die angezeigte Frist ist dadurch höchstens früher, nie später.
- **Als abgegeben festhalten** (Recht `finance.steuer` schreiben): Datum (nach Zeitraumende, nicht in der Zukunft) und
  Notiz; die Datenbank legt die Kennzahlen dieses Augenblicks als Fassung ab. Wird danach im Zeitraum gebucht oder
  storniert, steht der Zeitraum auf „seit der Abgabe geändert – Berichtigung nötig“ (in ELSTER Kz 10 = 1); die
  Berichtigung ist die nächste Fassung. Gelöscht wird keine. **Abweichung vom Konzept (4.6):** Der Zeitraum wird nicht
  gesperrt – dafür gibt es „Monat festschreiben“ unter Buchungen (Recht `finance.abschluss`); nach der Abgabe
  festschreiben, dann kann sich nichts mehr ändern.
- **Sondervorauszahlung** (monatlich mit Dauerfrist): Betrag laut Finanzamt je Jahr eintragen; Vorschlag ein Elftel der
  festgehaltenen Vorauszahlungen des Vorjahres; im Dezember als Kz 39 abgezogen.
- **Kleinunternehmer:** Umsatz des Jahres (Erlöskonten) gegen 100.000 €, Vorjahresumsatz (eintragen) gegen 25.000 €,
  Warnung ab 80 %. Voranmeldung nur in Zeiträumen mit § 13b oder ig. Erwerb.
- **Zahlung ans Finanzamt:** unter Bank & Kasse den Umsatz auf 1780 (SKR04 3820) Umsatzsteuer-Vorauszahlungen bzw.
  1781 (3830) Sondervorauszahlung buchen.
- **Übersicht › Zu erledigen:** Voranmeldungen überfällig, in 7 Tagen fällig, seit der Abgabe geändert.
- Noch nicht: Zusammenfassende Meldung (siehe Nachträge v156), Abgabe der Umsatzsteuer-Jahreserklärung (die Jahreswerte stehen seit v156 unter Steuern), Abschlussbuchung der USt-Konten auf 1780.
  Übermittelt wird nie aus der App. (Erinnerung per Push und § 13b Abs. 2: Nachträge v151.)

### Nachträge zu F2–F5 (v151, Migration 93)

- **Teilzahlungen** im Bankabgleich: Ein Zahlungseingang (oder eine Abbuchung) darf kleiner sein als der offene Rest
  einer Rechnung (eines Belegs) – „Teilzahlung“ statt „Zuordnen“. Vorgeschlagen wird sie, wenn die Nummer im Zweck
  steht oder der Name passt. Bezahlt ist der Posten erst, wenn nichts mehr offen ist; offene Posten, Übersicht und
  Fenster zeigen den Rest und „x € schon bezahlt“. „Bar bezahlt“/„Überweisung“ an Rechnung und Beleg buchen den
  Rest. Eine Teilzahlung nimmt man unter Bank & Kasse mit „Aufheben“ zurück; war der Posten bis dahin bezahlt,
  ist er wieder offen (eine Restzahlung von Hand zählt dann als Teilzahlung weiter). Mehr als der Rest wird nicht
  zugeordnet – eine Überzahlung bucht man auf ein Konto. Skonto seit v156 am Posten („Skonto abziehen“).
- **Ist-Versteuerung** in der Voranmeldung jetzt anteilig: Jede Zahlung auf eine Rechnung aus FSM bringt ihren Anteil
  an Bemessung und Steuer in den Zeitraum, in dem sie eingeht.
- **Kassensturz** im Kassenbuch: Bargeld zählen, eintragen, mit dem Bestand laut Buchungen vergleichen (über alle
  Jahre bis zum Tag). Eine Differenz lässt sich ausbuchen – Fehlbetrag als sonstiger Aufwand (4900/6300), Überschuss
  als sonstiger Ertrag (2700/4830, neu angelegt). Jeder Kassensturz bleibt mit Datum, Zählung, Bestand und Differenz
  stehen. Ein Tagesabschluss mit Sperre ist das noch nicht – dafür bleibt „Monat festschreiben“.
- **§ 13b Abs. 2** (z. B. Bauleistungen, Gebäudereinigung, Schrott): eigener Schlüssel, Kz 84/85 und Vorsteuer 67,
  Konto 3120/5920. Der bisherige Schlüssel heißt jetzt „§ 13b Abs. 1 – Leistung aus dem EU-Ausland“.
- **Erinnerung an die Frist** der Voranmeldung per Push: drei Tage vorher und am Tag selbst, ab 8 Uhr, an alle mit
  „Finance › Steuern · schreiben“ (heute der Superadmin) mit angemeldetem Gerät; nur solange der Zeitraum nicht als
  abgegeben festgehalten ist, nicht für Kleinunternehmer und Befreite, nicht vor dem Starttag. Der Text nennt Zeitraum
  und Frist, keine Beträge. Ein Tippen öffnet Finance (`docs/benachrichtigungen-plan.md`, „Sechste Nutzung“).

### So ist F6 gebaut (v152, Migration 94)

- **Finance › Auswertungen** (Recht `finance.abschluss` lesen; die Zahlen liefert die Datenbank auch mit
  `finance.buchen` lesen), Reiter Summen & Salden · Kontenblatt · BWA · EÜR (nur bei EÜR). Jeder Reiter als CSV
  (Semikolon, Komma, UTF-8 für Excel).
- **Summen & Salden:** je Konto Soll, Haben, Saldo für einen wählbaren Zeitraum (Monat bis Monat), gegliedert nach
  Kontoart; Gegenprobe Soll = Haben. Ein Tipp öffnet das Kontenblatt.
- **Kontenblatt:** alle Buchungen eines Kontos im Jahr mit Gegenkonto, Beleg und laufendem Saldo.
- **BWA** (kurzfristige Erfolgsrechnung): Monat und Januar bis Monat – Umsatzerlöse, Material/Wareneinsatz und
  Fremdleistungen, Rohertrag, Kosten nach Bereichen (Personal, Raum, Versicherungen, Fahrzeuge, Werbung/Reise/Bewirtung,
  Instandhaltung, Abschreibungen, Sonstige), Betriebsergebnis, sonstige Erträge, vorläufiges Ergebnis. Nach
  Buchungsdatum, ohne Umsatzsteuer. Kontenbereiche je Kontenrahmen in `FIN_BWA_KOSTEN`. Ein Vorjahresvergleich folgt,
  sobald es ein Vorjahr in Finance gibt.
- **EÜR** (§ 4 Abs. 3 EStG, nach Zahlung): Einnahmen, wenn das Geld da ist, Ausgaben, wenn es weg ist –
  Zahlungen auf Rechnungen und Belege anteilig auf deren Erlöse, Kosten und Steuer (Teilzahlungen ebenso), dazu
  Abschreibungen. Gegliedert nach Kennzahlen der Anlage EÜR (Vordruck 2025: 111, 112, 103, 140, 141 → 159; 100, 110,
  120, 130, 132, 150, 280, 221, 194, 223, 224, 165 mit 70 %, Kfz 144–146, 183, 185, 186 → 199; Gewinn). Anschaffungen von
  Anlagen sind keine Ausgabe (Abschreibung mit F7), Privatentnahmen zählen nicht; Zahlungen auf Forderungen von Hand
  stehen gesondert als „unklar“. Die Kfz-Kennzahlen hängen von der Art ab – die App teilt sie nicht auf.
- Bei **Bilanzierung** ist die BWA das vorläufige Ergebnis; Bilanz und GuV nach HGB kommen mit F8.
- Noch nicht: Vorjahresvergleich, Liquiditätsvorschau, Offene-Posten-Liste als Export (die Liste steht unter
  Offene Posten).

### So ist F7 gebaut (v153, Migration 95)

- **Finance › Anlagen** (Recht `finance.abschluss`; lesen L, pflegen und buchen S): Verzeichnis in Gruppen (Anlagen,
  sofort abgeschriebene GWG, Sammelposten, Abgänge) mit Buchwert, Abschreibung des Jahres laut Plan und davon gebucht.
- **Erfassen:** Bezeichnung, Anlagekonto, Anschaffungsdatum, Anschaffungskosten (netto, beim Kleinunternehmer
  brutto), Art der Abschreibung, Nutzungsdauer (Vorschlag je Konto nach AfA-Tabelle: Software/Computer 1, Pkw 6,
  Lkw/Transporter 9, Maschinen 10, Betriebsausstattung 8, Büroeinrichtung 13 Jahre – für das einzelne Gut prüfen),
  auf Wunsch aus einem gebuchten Beleg mit Anlagekonto (übernimmt Datum, Netto, Konto) und mit dem Firmenfahrzeug aus
  FSM. Der Abschreibungsplan steht sofort darunter. Der Kauf selbst wird wie bisher gebucht (Beleg oder Bank auf das
  Anlagekonto) – das Verzeichnis bucht ihn nicht noch einmal.
- **Regeln** (Stand Oktober 2026, in der Datenbank geprüft und in `lib/finance/anlagen.ts` gespiegelt): linear
  monatsgenau; **degressiv** für bewegliche Güter mit Anschaffung 01.07.2025–31.12.2027, dreifach linear, höchstens
  30 % vom Restwert, mit Wechsel zur linearen Abschreibung, sobald die höher ist; **GWG** bis 800 € ganz im
  Anschaffungsmonat; **Sammelposten** über 250 € bis 1.000 €, je 20 % in fünf Jahren ohne Monatsanteil – nur, wenn unter
  Einstellungen für das Jahr gewählt, dann für alle Güter in diesem Rahmen, und die Wahl steht fest, sobald es welche
  gibt; **E-Fahrzeuge** (rein elektrisch, Anschaffung im selben Zeitraum) 75/10/5/5/3/2 %.
- **Abschreibungen buchen** bis zu einem Monat (nicht im Voraus): je Anlage, was laut Plan bis Monatsende fällig und
  noch nicht gebucht ist – eine Buchung mit einem Posten je Anlage (4830/6220, GWG 4855/6260, Sammelposten 4862/6264
  an das Anlagekonto). Monatlich gebucht, stimmt auch die BWA. Ein Lauf lässt sich unter Buchungen stornieren; der
  nächste bucht neu.
- **Abgang** (verkauft, verschrottet): Abschreibung bis zum Abgangsmonat (zu viel Gebuchtes wird zurückgebucht),
  Restbuchwert auf 2310/6895 Anlagenabgänge; zurücknehmbar. Ein Verkaufserlös wird wie jede Einnahme gebucht. Im
  Sammelposten scheidet ein Gut nicht einzeln aus.
- **Anlagen aus der Zeit vor Finance:** mit ihrem Buchwert als Anfangsbestand des Anlagekontos buchen; das Verzeichnis
  rechnet den Plan ab Anschaffung, gebucht wird ab dem ersten Jahr in Finance.
- **EÜR und BWA:** Abschreibungen stehen in Kz 130/132; Auflösung des Sammelpostens und Restbuchwert als eigene Zeilen
  (Kennzahl mit dem Steuerberater klären). In der BWA unter „Abschreibungen“.
- Noch nicht: Erinnerungswert 1 €, Leistungsabschreibung, Sonderabschreibung nach § 7g und Investitionsabzugsbetrag.
  Der Anlagenspiegel steht seit F8 unter Jahresabschluss.

### So ist F8 gebaut (v154, Migration 96)

- **Finance › Jahresabschluss** (Recht `finance.abschluss`; lesen L, buchen S) für das laufende Jahr oder das Vorjahr
  (bis Ende Juni steht das Vorjahr vorn, sobald es dafür Einstellungen gibt). Reiter Schritte · GuV · Bilanz ·
  Anlagenspiegel, jeder Bericht als CSV.
- **Schritte:** Abschreibungen bis Dezember gebucht, Konto 9000 ausgeglichen, (bei Bilanz) Rückstellungen und
  Abgrenzungen geprüft, alle zwölf Monate festgeschrieben, Saldenvortrag gebucht und noch aktuell
  (`abschlussSchritte()`).
- **GuV** nach § 275 Abs. 2 HGB (Gesamtkostenverfahren), nur die Posten, die Finance bebucht: 1 Umsatzerlöse, 4 sonstige
  betriebliche Erträge, 5 Materialaufwand, Rohergebnis, 6 Personal, 7 Abschreibungen, 8 sonstige betriebliche
  Aufwendungen, 11/13 Zinsen, 14 Steuern vom Einkommen und Ertrag, 15 Ergebnis nach Steuern, 16 sonstige Steuern
  (Kfz-Steuer), 17 Jahresüberschuss/-fehlbetrag. Bereiche je Kontenrahmen in `FIN_GUV_AUFWAND`; Restbuchwert aus
  Anlagenabgängen gehört zu den sonstigen Aufwendungen.
- **Bilanz** nach § 266 HGB in der verkürzten Form (Stand Ende eines Monats): Anlagevermögen (immateriell, Sachanlagen),
  Umlaufvermögen (Forderungen, sonstige Vermögensgegenstände, Kasse/Bank), aktive Abgrenzung; Eigenkapital (Kapitalkonten,
  Privat, Gewinn bzw. Jahresüberschuss), Rückstellungen, Verbindlichkeiten (gegenüber Kreditinstituten, aus Lieferungen
  und Leistungen, sonstige), passive Abgrenzung. Konten nach Saldo, Umsatz- und Vorsteuer nicht verrechnet. Ein Rest
  auf 9000 steht sichtbar im Eigenkapital. Bei EÜR nur zur Information.
- **Abschlussbuchungen** (nur Bilanzierung, ab 01.12.): Rückstellung (Aufwand an 0970/3070), aktive Abgrenzung (0980/1900
  an Aufwand), passive Abgrenzung (Erlös an 0990/3900), gebucht am 31.12., Quelle `abschluss`. Abgrenzungen löst ein
  Knopf am 01.01. des Folgejahres auf; eine Rückstellung wird mit der Zahlung verbraucht (Bank an Rückstellung), ein
  Rest von Hand gegen sonstige Erträge. Zurücknehmen storniert (mit Grund). Steuerrückstellungen (Gewerbe-,
  Körperschaftsteuer) rechnet die App nicht – die kommen vom Steuerberater.
- **Saldenvortrag** (`fin_vortrag_buchen()`, wenn das Jahr vorbei ist und die Einstellungen des Folgejahres gespeichert
  sind): eine Buchung am 01.01. mit jedem Bestandskonto gegen 9000; Umsatz- und Vorsteuerkonten zusammen auf
  1790/3840 „Umsatzsteuer Vorjahr“; Gewinn, Privatkonten und ein Rest auf 9000 ins Kapital 0880/2010 (UG/GmbH:
  Gewinnvortrag 0860/2970; Privatkonten dort abgelehnt). Danach ist 9000 im neuen Jahr ausgeglichen. Bucht man im
  alten Jahr nach, zeigt die Seite „neu vortragen“ (Storno und neue Buchung); Anfangsbestände von Hand auf 9000 im
  Folgejahr sperren den Vortrag, damit nichts doppelt steht.
- **Folgen woanders:** Die EÜR lässt Buchungen mit Konto 9000 aus (ein Vortrag ist keine Zahlung); der Kassensturz zählt
  nach einem Vortrag nur das laufende Jahr; Abschluss- und Vortragsbuchungen lassen sich nicht unter Buchungen
  stornieren.
- Noch nicht: Steuerrückstellungen, Anhang und Offenlegung, Vorjahresvergleich, Kapitalkonten je Gesellschafter (GbR),
  E-Bilanz. Den Abschluss stellt der Steuerberater auf.

### So ist F9 gebaut (v155, Migration 97)

- **Finance › Export** (Recht `finance.abschluss` L, das Journal kommt über `fin_export_journal()` auch ohne „Buchungen
  lesen“): Zeitraum Monat, Quartal oder Jahr des laufenden Jahres oder des Vorjahres (vorgewählt: der letzte abgeschlossene
  Monat); daneben, wie viele Buchungen es sind und ob die Monate festgeschrieben sind.
- **DATEV-Buchungsstapel** (EXTF 700, Kategorie 21, Herkunft „FI“, nicht festgeschrieben, Windows-1252): DATEV rechnet die
  Steuer selbst – ein Satz trägt den Bruttobetrag, die Steuer kommt aus dem Automatikkonto (SKR03 8400/8300/3400/3300/3425/3123,
  SKR04 4400/4300/5400/5300/5425/5923; seit v156 auch die Skontokonten) oder aus dem BU-Schlüssel am Gegenkonto (3/2 Umsatzsteuer, 9/8 Vorsteuer, 19 ig.
  Erwerb, 94 § 13b; `FIN_DATEV_BU`, `FIN_DATEV_AUTOMATIK`). Finance fasst dazu je Posten Netto und Steuer wieder zusammen,
  aber nur, wenn DATEV aus dem Brutto dieselbe Steuer errechnet; sonst gehen Netto (BU 40, Automatik aus) und Steuer als
  eigene Sätze hinüber, mit Hinweis. Ein Automatikkonto ohne Steuer (Abgrenzung, Umbuchung) bekommt BU 40. Mehrere Posten
  werden in Konto/Gegenkonto-Paare zerlegt (eine Forderung, zwei Steuersätze → zwei Sätze). Belegfeld 1 = Belegnummer
  (sonst `FIN<Jahr>-<Nr>`), Zusatzinformation „Finance-Nr“. Saldenvorträge (Konto 9000) auf Wunsch weg. Berater, Mandant
  und Sachkontenlänge (muss 4 sein) aus Admin › Betrieb › DATEV. **Sachkonten statt Personenkonten**: Forderungen und
  Verbindlichkeiten stehen auf 1400/1600 bzw. 1200/3300 – offene Posten je Kunde führt Finance, nicht DATEV.
  **Nicht zusätzlich** den Rechnungs-Export aus FSM einlesen, sonst stehen die Rechnungen doppelt.
- **GoBD-Datenexport** (Datenträgerüberlassung, § 147 Abs. 6 AO): ZIP mit `index.xml` nach dem Beschreibungsstandard und den
  Tabellen Buchungen, Buchungszeilen, Konten, Steuerschlüssel und Belege (Windows-1252, Semikolon, Komma, TT.MM.JJJJ), dazu
  `LIESMICH.txt`. Die DTD `gdpdu-01-09-2004.dtd` legt man aus der Veröffentlichung des BMF dazu; Belegdateien bleiben in
  Finance › Belege.
- **Verfahrensdokumentation**: HTML-Vorlage mit den Einstellungen des Jahres (allgemeine Beschreibung, Anwender-, technische
  System- und Betriebsdokumentation, internes Kontrollsystem; Aufbewahrung: Belege acht, Bücher und Abschlüsse zehn Jahre).
  Platzhalter in eckigen Klammern; im Browser öffnen, ergänzen, als PDF ablegen.
- **Protokoll** `fin_exporte`: jeder DATEV- und GoBD-Export mit Zeitraum, Zahl, Summe und letzter Nummer der Buchungen (die
  Datenbank zählt selbst). Die Seite zeigt die Exporte des Jahres und meldet „seitdem geändert“, wenn im Zeitraum danach
  gebucht oder storniert wurde.
- Noch nicht: Debitoren/Kreditoren als Personenkonten, Belegbilder an DATEV (Beleglink), Export direkt an DATEV Unternehmen
  online, ELSTER. **Vor dem Echtbetrieb:** eine DATEV-Datei probeweise in der Kanzlei einlesen lassen.

### Nachträge vor dem Echtbetrieb (v156, Migration 98)

- **Skonto** (`fin_skonto_buchen()`): im Fenster einer offenen Rechnung bzw. eines Belegs „Skonto abziehen“ (Datum, Betrag –
  vorgeschlagen der offene Rest). Rechnung: Gewährte Skonti (SKR03 8736/8731, ohne Steuer 8730; SKR04 4736/4731/4730) an
  Forderung; Beleg: Verbindlichkeit an Erhaltene Skonti (3736/3731/3730 bzw. 5736/5731/5730), bei einem Anlagegut an das
  Anlagekonto (die Anschaffungskosten sinken – im Anlagenverzeichnis von Hand nachziehen). Aufgeteilt wie die ursprüngliche
  Buchung je Steuersatz, die Steuer sinkt anteilig; höchstens 10 % des Bruttobetrags (mehr ist Ausfall oder Nachlass, mit dem
  Steuerberater klären). Der Abzug zählt wie eine Teilzahlung; ist der Rest null, ist der Posten „mit Skonto ausgeglichen“.
  Zurücknehmen mit Grund (Storno, der Posten ist wieder offen); unter Buchungen nicht stornierbar. § 13b und ig. Erwerb: von Hand.
  **Ist-Versteuerung:** Die Rechnung zählt nur mit dem, was eingegangen ist; ihr Skonto zählt dann nicht noch einmal.
  **EÜR:** Skonto ist kein Geld – die EÜR zählt nur die Zahlung (anteilig). **DATEV:** 8736/8731/3736/3731 bzw. 4736/4731/5736/5731
  als Automatikkonten.
- **ZUGFeRD/Factur-X als PDF** (`lib/finance/zugferd.ts`): Beim Hochladen eines PDF sucht Finance die eingebettete XML-Datei
  (`/EmbeddedFile`, auch gepackt) und liest sie wie eine E-Rechnung; das PDF bleibt der Beleg. Verschlüsselte PDF und seltene
  Filter: nur abgelegt.
- **Jahreswerte zur Umsatzsteuererklärung** (Finance › Steuern, `ustJahreswerte()`): alle Zeiträume zusammen (ohne Kz 39),
  gerechnet wie das Formular, gegen die letzte abgegebene Fassung jedes Zeitraums plus Sondervorauszahlung – der Unterschied
  ist die voraussichtliche Abschlusszahlung bzw. Erstattung. Kennzahlen der Voranmeldung, nicht die Zeilen der Jahreserklärung.
- **Zusammenfassende Meldung: bewusst nicht gebaut.** Sie braucht die USt-IdNr. des Kunden an der Rechnung (innergemeinschaftliche
  Lieferungen und Leistungen an Unternehmer im EU-Ausland) – die führt FSM nicht, und beim Reifenservice kommen solche Umsätze
  praktisch nicht vor. Kommt einer vor: mit dem Steuerberater melden.

### Mahnwesen (v157, Migration 99)

- **Drei Stufen** je Rechnung (`FIN_MAHNSTUFEN`, `fin_mahnung_erstellen()`): Zahlungserinnerung, Mahnung, letzte Mahnung –
  der Reihe nach, keine überspringen, höchstens drei. Erlaubt nur für eine in Finance gebuchte, offene, nicht stornierte
  Rechnung, frühestens am Tag nach der Fälligkeit bzw. nach Ablauf der Frist der vorigen Stufe; das Datum nicht in der Zukunft,
  die neue Frist nach dem Datum. Vorgeschlagen wird die Erinnerung 7 Tage nach der Fälligkeit (Frist 10 Tage), die Mahnung und
  die letzte Mahnung 3 Tage nach der vorigen Frist (Frist 10 bzw. 7 Tage).
- **Wo:** im Fenster der Rechnung (Finance › Rechnungen bzw. Offene Posten), Abschnitt „Mahnungen“; die Liste zeigt die letzte
  aktive Stufe, die Übersicht „Rechnung(en) zu mahnen“ (Vorschlag fällig). Der Text kommt als Vorlage je Stufe und ist vor dem
  Erstellen änderbar.
- **Das Schreiben ist ein Snapshot** (Absender und Empfänger der Rechnung, Betrag, bereits bezahlt, offen, Gebühr, Zinsen,
  Text) und wird wie die Rechnung gedruckt bzw. als PDF gespeichert, mit Girocode über den Gesamtbetrag. **Verschickt wird
  nichts automatisch** – „E-Mail vorbereiten“ öffnet nur das eigene Mailprogramm (`mailto:`), wenn der Kunde eine Adresse hat.
- **Zurückziehen** mit Grund, nur die jeweils letzte aktive Stufe (z. B. Zahlung hat sich überschnitten); sie bleibt sichtbar,
  die Stufe ist wieder frei.
- **Mahngebühr** 0 bis 100 € von Hand. Bei Privatkunden nur tatsächliche Kosten (Porto); gegenüber Unternehmen ist zusätzlich
  die Pauschale von 40 € möglich (§ 288 Abs. 5 BGB) – die App rechnet sie nicht von selbst ein.
- **Verzugszinsen** (ab Stufe 2, wahlweise): ab dem Tag nach der Frist der Zahlungserinnerung bis zum Datum der Mahnung, taggenau
  auf 365 Tage, mit dem Basiszinssatz je Halbjahr (`FIN_BASISZINS`, § 247 BGB) plus 5 Prozentpunkte (Privatkunde) bzw.
  9 Prozentpunkte (Unternehmen, § 288 BGB). **`FIN_BASISZINS` zum 1. Januar und 1. Juli nachtragen** (Deutsche Bundesbank);
  fehlt der neue Wert, rechnet die App mit dem letzten bekannten weiter.
- **Nicht gebucht:** Gebühr und Zinsen stehen nur auf dem Schreiben. Gebucht wird, was der Kunde zahlt; ein Mehrbetrag über die
  Rechnung hinaus von Hand auf Sonstige Erträge. Nach der letzten Mahnung: Inkasso oder gerichtliches Mahnverfahren mit dem
  Steuerberater bzw. Anwalt klären – die App macht dort nichts.
- **Rechte:** sehen mit `finance.rechnungen` L, erstellen und zurückziehen mit S. Die Texte sind Vorlagen, keine Rechtsberatung –
  vor dem ersten echten Einsatz prüfen lassen.

### Liquiditätsvorschau und Vorjahresvergleich (v158, Migration 100)

- **Wo:** Finance › Auswertungen › Liquidität (Recht `finance.abschluss` L). Ab heute je Woche (13 Wochen, die laufende bis
  Sonntag) oder je Monat (6 Monate): Bestand am Anfang, Einzahlungen, Auszahlungen, Bestand am Ende; ein Tipp auf eine Woche
  zeigt die einzelnen Zahlungen. Dazu Bestand heute, tiefster Stand (rot, wenn unter 0), Summen und ein Säulenbild des
  Bestands; „Als CSV“ mit Zeiträumen und Einzelposten. Gerechnet in `lib/finance/liquiditaet.ts`, nichts wird gebucht.
- **Startbestand:** Kasse und Bank (Konten der Art „Kasse und Bank“) laut Buchhaltung bis zum laufenden Monat – oder, wenn es
  eingelesene Kontoauszüge mit Endsaldo gibt, wahlweise je Bankkonto der Endsaldo des letzten Auszugs (Kasse weiter gebucht).
  Ohne Saldenvortrag fehlt am Jahresanfang der Stand vom Vorjahr; nicht zugeordnete Bankumsätze nennt die Seite.
- **Einzahlungen:** offene Rechnungen (dieses und voriges Jahr) mit dem offenen Rest zum Fälligkeitstag; Aufträge mit „Rechnung
  nötig“ ohne Rechnung mit dem geschätzten Betrag 14 Tage nach dem Auftrag (frühestens ab heute, abschaltbar); Testaufträge nie.
- **Auszahlungen:** offene Belege mit dem Rest zum Fälligkeitstag; Umsatzsteuer je Voranmeldungszeitraum zur Frist (laufender
  Zeitraum mit dem bisher Gebuchten; abgegeben und Frist vorbei gilt als bezahlt; nicht abgegeben und überfällig auf heute;
  eine Erstattung als Einzahlung). Sondervorauszahlung und die Zeiträume des neuen Jahres fehlen.
- **Überfälliges** steht auf heute (abschaltbar – dann sagt die Seite, wie viel draußen bleibt).
- **Planposten** (`fin_planposten`, `fin_planposten_speichern()` / `_loeschen()`, schreiben mit `finance.abschluss` S): Text,
  Ein- oder Auszahlung, Betrag, erster Termin, Rhythmus (einmalig, monatlich, vierteljährlich, halbjährlich, jährlich), optional
  „bis“ und Notiz. Für alles, was Finance nicht kennt: Miete, Löhne, Leasing, Versicherungen, Kredite, geplante Anschaffungen.
  Monatliche Termine bleiben am Tag und werden am Monatsende abgeschnitten (31.01. → 28.02. → 31.03.). Keine Buchung, keine Steuer.
- **BWA gegen das Vorjahr** (Auswertungen › BWA › „Vorjahr“): Januar bis Monat oder nur der Monat, je Zeile dieses Jahr,
  Vorjahr, Abweichung in Euro und Prozent (bezogen auf den Vorjahreswert, ohne Vorjahreswert keine Prozentzahl), als CSV.
  Das Vorjahr wird mit seinem eigenen Kontenrahmen gegliedert. Solange das Vorjahr nicht in Finance eingerichtet ist, sagt
  die Seite das – der Vergleich trägt erst ab dem zweiten Jahr.

Reihenfolge: F0 → F1 → F3 → F2 → F4 → F5. **F0 bis F9 erledigt**, Nachträge v151; danach laut Plan ein Monat
Probelauf mit Rechnungen, Belegen, Bank und Voranmeldung, bevor F6 (Auswertungen) folgt.

Vorschlag zur Reihenfolge (ursprünglich): F0 → F1 → F3 → F2 → F4 → F5. Die Rechnungen kommen früh, weil sie den
Umsatz liefern und heute schon täglich entstehen; nach F5 laufen Rechnungen, Belege, Bank und UStVA
über einen ganzen Monat, bevor die Auswertungen (F6 ff.) dazukommen.

## 8. Entscheidungen vor F0/F1 (Stand 13.10.2026)

1. **Besteuerung:** nicht fest vorgeben, sondern **in den Finance-Einstellungen auswählbar** (Abschnitt 3)
   – Rechtsform, Gewinnermittlung, Kontenrahmen, Regel/Kleinunternehmer, Soll/Ist, Zeitraum,
   Dauerfristverlängerung, § 13b. Alles Weitere richtet sich danach aus (Konten, Steuerschlüssel,
   Rechnungstexte, UStVA, Auswertungen), so wie bei DATEV.
2. **„Alle Daten löschen“ löscht Finance mit** (Abschnitt 5).
3. **Wer führt die Buchhaltung? Entschieden 13.10.2026: erst Weg A**, Weg B ist später möglich. Die Wege:
   - *Steuerberater bucht weiter* – Finance sammelt und bereitet vor (Rechnungen, Belege, Bank), übergibt
     per DATEV-Export; Voranmeldung und Abschluss macht der Steuerberater. Finance muss nicht lückenlos sein.
   - *Finance ersetzt die Buchhaltung* – alles wird in Finance gebucht, Voranmeldung und Abschluss kommen
     von dort; der Steuerberater prüft und macht die Jahreserklärung. Dann muss Finance vollständig sein
     (alle Umsätze, alle Kosten, Bank, Kasse) und braucht Festschreibung und Verfahrensdokumentation.
   Gebaut wird so, dass Weg B später ohne Neuerfassung möglich bleibt (doppelte Buchung, Festschreibung von Anfang an).
4. **Barzahlungen gibt es** → Kassenbuch (Abschnitt 4.3), im Pilot „bar bezahlt“ an der Rechnung.
5. **Start ab sofort:** gebucht wird ab dem Tag der Einrichtung, Wirtschaftsjahr 2026. Anfangsbestände
   bleiben offen und werden nachgetragen, sobald sie vorliegen (Abschnitt 4.4). Übernahme älterer Daten
   wird später geprüft.
6. **Pilot nur mit „Rechnung nötig“**, FSM unverändert (Abschnitt 4.2).

## 9. Ausbau zum Buchhaltungs-Arbeitsplatz (Konzept 20.10.2026, entschieden 30.10.2026)

Das Gesamtkonzept steht als lebendes Dokument „Finance-Ausbau – Gesamtkonzept“ (Claude Docs, Link in
`claude/naechste-runde.md`): Finance wird vom Pilot zum Arbeitsplatz wie DATEV Kanzlei-Rechnungswesen oder Lexware –
dichte Listen, Tastatur zuerst, Personenkonten, alle Umsätze – und ersetzt danach die laufende Buchhaltung
(**Weg B** aus Abschnitt 8.3; der Steuerberater prüft und macht die Erklärungen).

**Stufen:** A Arbeitsplatz am Rechner (Rahmen, Datentabelle, Konto-/Betragsfeld, Filterleiste, Tastatur, Export) ·
B Konten und Kontoblatt · C Buchungsmaske (Stapel, Splitt, Vorlagen, wiederkehrend) · D Personenkonten und alle
Rechnungen – ab hier vollständig möglich – · E Zahlungsverkehr · F Belegeingang · G Auswertungen · H Steuern,
Abschluss, Prüfung.

**Entscheidungen vom 30.10.2026 (Vitali):**

1. **Pilot beenden: ja.** Ab Stufe D bucht Finance alle Rechnungen aus FSM, nicht nur die mit „Rechnung nötig“.
   **FSM bleibt unverändert** – der Haken „Rechnung nötig“ bleibt dort als eigene Funktion erhalten; Finance hängt
   nur nicht mehr davon ab. (Ersetzt Abschnitt 8.6.)
2. **Vollständig ab 01.01.2027**, mit Eröffnungsbilanz aus der Kanzlei. (Ersetzt den Pilotstart aus 8.5 für den
   Echtbetrieb.)
3. **Debitoren:** eigenes Personenkonto je Kunde mit Rechnung (auch je Unterdebitor einer Kundengruppe),
   Laufkundschaft auf einem Sammeldebitor.
4. **Kostenrechnung: beides** – Kostenstelle je Transporter, Kostenträger je Leistungsart (Montage, Einlagerung,
   Reifenverkauf); die Leistungsart ergibt sich aus dem Artikel, ohne Handarbeit.
5. **Handy:** Belegfoto, Freigabe, Nachsehen **und buchen** (schlanke Buchungsmaske); der volle Arbeitsplatz bleibt
   am Rechner.
6. **Kanzlei:** monatliche Übergabe per DATEV-Export bleibt; ein Prüfer-Lesezugang wird erst gebaut, wenn danach
   gefragt wird.

Offen vor dem Echtbetrieb weiterhin: Kontenliste und Kennzahlen mit dem Steuerberater abgleichen. Stufe A ist gebaut
(Abschnitt 10), Stufe B auch (Abschnitt 11), Stufe C vollständig: Buchungsstapel (Abschnitt 12), Vorlagen und
wiederkehrende Buchungen (Abschnitt 13), Kostenstellen (Abschnitt 14), Stapel am Handy, Splitt und Abhaken (Abschnitt 15).
Stufe D gebaut (Abschnitt 16): Personenkonten, alle Rechnungen ab 2027, Leistungsart aus dem Artikel. Damit kann Finance die
Buchhaltung ab 01.01.2027 vollständig führen (Weg B); offen vor dem Echtbetrieb bleiben Kontenliste und Kennzahlen mit dem
Steuerberater und die Eröffnungsbilanz. Als Nächstes: Stufe E (Zahlungsverkehr).

## 10. So ist Stufe A gebaut (v178, ohne Migration)

Entwurf `Claude outputs/Mockup_Finance_StufeA_v1.html`, abgenommen 30.10.2026. Nur am Rechner (`useAmRechner()` in
`lib/amRechner.ts`, dieselbe Weiche wie `istHandy`); am Handy bleibt Finance wie bisher.

- **Seitenleiste in Bereichen** wie FSM seit v176: Übersicht, Rechnungen, Belege, Bank & Kasse oben, darunter die
  Bereiche aus `FINANCE_WEITERE_GRUPPEN` (dieselben wie „Weitere“ am Handy), „System“ unten. Eigener Merker
  `FIN_NAV_ZU_MERKER`, damit Zuklappen in FSM Finance nicht mitklappt. Die Leiste selbst ist jetzt eine für beide
  Systeme: `components/BereichNavigation.tsx`.
- **Bausteine** (`components/finance/arbeitsplatz/`, Regeln in `lib/finance/arbeitsplatz.ts`):
  `DatenTabelle` (Sortieren, Tastatur, Markieren, Summenzeile) mit `SpaltenWahl`, `KontoFeld` (Nummer oder Name,
  Vorschläge, Enter/Tab nimmt, Mehrdeutiges rot), `BetragFeld` (Komma, „1.234,50“ beim Verlassen), CSV für Excel
  (`tabellenCsv`: Semikolon, Dezimalkomma, BOM, Text mit `= + - @` vorne bekommt ein Hochkomma).
- **Journal** (`components/finance/FinanceJournalArbeitsplatz.tsx`, Finance › Buchungen › Journal): Filter Zeitraum,
  Konto (auch als Steuerkonto in einer Zeile), Zustand, Betrag von–bis, Suche über Nr., Text, Beleg, Konten und
  Betrag. Spalten Nr., Datum, Beleg, Buchungstext, Konto, Gegenkonto (Kennzeichen „Splitt“ bei mehreren Posten),
  Steuer, Umsatz, Zustand. Rechts die gewählte Buchung: Soll und Haben, Saldo des Kontos vor und nach ihr
  (`saldoVorNach`, Reihenfolge Datum, dann Nr.), „Öffnen“ (Fenster mit Storno) und „Nur Konto …“. Statuszeile:
  Anzahl, festgeschrieben bis, Kurzbefehle.
- **Tastatur:** ↑ ↓ Bild auf/ab Pos1 Ende, Leertaste markiert, Enter öffnet; F2 Suche, F3 nur das Konto der Zeile,
  N Schnellbuchung (`FIN_KURZBEFEHLE`). N gilt nicht in Eingabefeldern und nicht ohne Recht „Buchen“; über einem
  offenen Fenster gelten die Kurzbefehle nicht.
- **Schnellbuchung:** das bisherige Buchungsfenster (`BuchungNeu`) mit `tastatur`: beginnt beim Buchungstext, Konten
  über das Kontofeld, Betrag über das Betragsfeld, Strg+Enter bucht. Gebucht wird wie bisher über `fin_buchen()`.

**Noch nicht in Stufe A:** Kostenstellen-Spalten Transporter/Leistung (brauchen eine Migration; Stufe C/D, Abschnitt 9
Punkt 4), Buchen am Handy mit „Wofür / Bezahlt mit“ (Entscheidung 5; eigene Runde), Wahl des Wirtschaftsjahres in der
Kopfleiste (Finance zeigt weiter das laufende Jahr), Belegbild in der Detailspalte, Export als Excel-Datei und PDF
(CSV öffnet in Excel). Tests: `tests/financeArbeitsplatz.test.ts`, `tests/financeArbeitsplatzOberflaeche.test.tsx`.

## 11. So ist Stufe B gebaut (v179, ohne Migration)

Konten und Kontoblatt auf den Bausteinen aus Stufe A, nur am Rechner (Finance › Buchungen, Reiter „Kontoblatt“ und
„Konten“; am Handy bleibt die bisherige Kontenliste). Regeln in `lib/finance/kontoblatt.ts`.

- **Zeitraum** (`ZeitraumWahl` in `components/finance/arbeitsplatz/Werkzeuge.tsx`): ganzes Jahr, Quartal, Monat oder frei
  von–bis; beide Tage müssen im Wirtschaftsjahr liegen (`zeitraumFehler`).
- **Kontoblatt** (`components/finance/FinanceKontoblatt.tsx`): Konto per Kontofeld, Eröffnungssaldo (alle Buchungen des
  Jahres vor dem Zeitraum – der Saldenvortrag ist eine Buchung im Januar), je berührte Buchungszeile eine Zeile mit Datum,
  Nr., Beleg, Text, Gegenkonto (im selben Posten die andere Seite ohne Steuerzeile; „div.“ bei mehreren), Soll, Haben,
  laufendem Saldo, Steuer, Zustand; unten Verkehrszahlen und Endsaldo. Die Suche blendet Zeilen aus, Saldo und Summen
  bleiben die des ganzen Zeitraums. Klick auf das Gegenkonto oder F3 öffnet dessen Kontoblatt, „←“ geht den Weg zurück;
  Enter öffnet die Buchung (Storno). CSV mit Eröffnungszeile.
- **Konten** (`components/finance/FinanceKontenArbeitsplatz.tsx`): alle Konten nach Nummer mit Art, Eröffnung, Soll,
  Haben, Saldo und Zahl der Bewegungen im Zeitraum; Filter Art, „nur bebuchte“ (bewegt oder mit Eröffnung),
  „ausgeblendete zeigen“, Suche; unten die Summen aller Konten mit „stimmt überein / weicht ab“. Enter, Doppelklick oder
  F3 öffnet das Kontoblatt; rechts Ein-/Ausblenden, oben „Eigenes Konto“.
- **Journal:** F3 und die Knöpfe rechts öffnen jetzt das Kontoblatt statt das Journal zu filtern (der Kontofilter bleibt).
- **Gerechnet im Browser** aus dem Journal des Jahres, das die Seite ohnehin lädt – so führt jede Zeile zur Buchung.
  `fin_kontenblatt()` (Migration 94, Auswertungen) bleibt für Finance › Auswertungen. Bei einigen tausend Buchungen im
  Jahr reicht das; wird es spürbar langsam, wandert die Rechnung in eine Datenbankfunktion mit Buchungs-ID.

**Noch nicht in Stufe B:** Haken je Zeile für die Kontenabstimmung (braucht eine Tabelle, also eine Migration), Druck als
PDF im Querformat, Breite der Spalten merken. Tests: `tests/financeKontoblatt.test.ts`,
`tests/financeKontoblattOberflaeche.test.tsx`.

## 12. So ist der Buchungsstapel gebaut (Stufe C Teil 1, v180, Migration 106)

Wie bei DATEV: erst erfassen, dann buchen. Ein **Stapel** gehört zu einem Wirtschaftsjahr und ist „offen“ (vorläufig,
änderbar, löschbar) oder „gebucht“ (ins Journal übernommen, unveränderlich).

- **Datenbank** (Migration 106): `fin_stapel`, `fin_stapel_zeilen` (Datum, Beleg, Text, Soll, Haben, Betrag, Steuerschlüssel –
  genau ein Posten von `fin_buchen()`; nach dem Buchen `buchung_id`). Lesen per RLS mit „Finance › Buchungen“ lesen;
  geschrieben nur über `fin_stapel_anlegen()`, `fin_stapel_zeile_speichern()`, `fin_stapel_zeile_loeschen()`,
  `fin_stapel_loeschen()` mit „Finance › Buchungen“ schreiben. Ein gebuchter Stapel lehnt jede Änderung im Klartext ab.
- **Buchen** (`fin_stapel_buchen()`): jede Zeile über `fin_buchen()` – dieselben Regeln, dieselbe Steuer, dieselbe
  Festschreibungsprüfung –, Reihenfolge Datum, dann Erfassung. **Alle oder keine:** Scheitert eine Zeile, bricht die ganze
  Anweisung ab, es ist nichts gebucht und keine Nummer verbraucht; der Fehler nennt Zeile, Datum und Text.
- **Oberfläche** (`components/finance/FinanceStapel.tsx`, Reiter „Stapel“ am Rechner): Stapel wählen oder anlegen; oben die
  Erfassungszeile Datum (TTMM, „10.2.“), Beleg, Soll, Haben (Kontofeld), Betrag, Steuer, Text. Enter springt ins nächste
  Feld (ein offenes Kontovorschlagsfeld nimmt Enter selbst), im Text übernimmt es die Zeile; danach bleiben Datum und
  Steuer stehen, der Beleg zählt weiter (`belegWeiter`: „ER-0042“ → „ER-0043“). Darunter „So wird gebucht“ mit den Zeilen
  von `postenZeilen`. In der Liste prüft jede Zeile vorab, woran das Buchen scheitern würde (`stapelZeilePruefen`); Enter
  lädt eine Zeile zum Ändern (Esc bricht ab), Entf löscht sie. „Stapel buchen“ (Strg+S) fragt nach und geht nur ohne
  Fehler. Ein gebuchter Stapel zeigt die Nummern im Journal; Enter öffnet die Buchung.
- **Regeln** in `lib/finance/stapel.ts`; Tests `tests/financeStapel.test.ts`, `tests/financeStapelOberflaeche.test.tsx`,
  Datenbank geprüft mit `/tmp/pgt/t106.sql` (siehe `supabase/migrations/README.md`).

**Noch nicht:** mehrere Posten (Splitt) in einer Stapelzeile – dafür weiter das Buchungsfenster; Buchungsvorlagen und
wiederkehrende Buchungen; Kostenstellen; vom Handy in einen Stapel erfassen (Entscheidung 5, eigene Runde); ein Belegbild
an der Zeile.

## 13. So sind Vorlagen und wiederkehrende Buchungen gebaut (Stufe C Teil 2, v181, Migration 107)

- **Vorlagen** (`fin_vorlagen`): Kurzname (eindeutig, ohne Groß/klein), Text, Soll, Haben, Steuerschlüssel, Betrag frei
  (leer = jedes Mal neu). Im Stapel füllt „Vorlage“ Konten, Steuer, Text und gegebenenfalls Betrag; Datum und Beleg bleiben,
  der Cursor springt zum Betrag (wenn die Vorlage keinen hat) oder zum Datum (`vorlageInEingabe`). „Als Vorlage …“ unter der
  Erfassungszeile legt aus der getippten Zeile eine neue an.
- **Wiederkehrende Buchungen** (`fin_wiederkehrend`): Text, Konten, Steuer, fester Betrag, Rhythmus (`FIN_WK_RHYTHMEN`:
  monatlich, vierteljährlich, halbjährlich, jährlich – die der Planposten ohne „einmalig“), erster Termin, „bis“, aktiv.
  Termine wie bei den Planposten: ab + k × Rhythmus, gleicher Tag im Monat, am Monatsende abgeschnitten, immer vom ersten
  Termin aus (`planTermine`, `wiederkehrendOffen`; in der Datenbank `ab + make_interval(months => …)`).
- **Holen statt automatisch buchen:** „Wiederkehrende holen …“ im Stapel zeigt die fälligen Termine bis zu einem Stichtag
  (Vorschlag: Monatsende) und legt sie mit `fin_wiederkehrend_holen()` als Zeilen in den offenen Stapel – Text mit Monat
  („Leasing VW T6.1 02/2027“). Nur Termine im Jahr des Stapels, nur solche, die noch in keinem Stapel stehen (eindeutig über
  `fin_stapel_zeilen.wiederkehrend_id` + `termin`). Wird die Zeile oder der offene Stapel gelöscht, ist der Termin wieder
  offen. Gebucht wird mit „Stapel buchen“ wie jede andere Zeile – so bleibt jede Buchung von Hand kontrolliert.
- **Ändern:** Text, Konten, Betrag, Steuer, „bis“ und „aktiv“ jederzeit (wirkt auf künftige Termine); erster Termin und
  Rhythmus stehen fest, sobald ein Termin geholt ist – sonst rutschten die Termine unter den geholten weg.
- **Oberfläche:** `components/finance/FinanceVorlagen.tsx` (Reiter „Vorlagen“ am Rechner, zwei Tabellen, „Nächster offen“
  je wiederkehrender Buchung) und `VorlageFormular` (beide Arten, Strg+Enter speichert, Löschen mit Rückfrage).
  Tests: `tests/financeVorlagen.test.ts`, `tests/financeVorlagenOberflaeche.test.tsx`; Datenbank `/tmp/pgt/t107.sql`.


## 14. So sind die Kostenstellen gebaut (Stufe C Teil 3, v182, Migration 108)

Entscheidung 4 vom 30.10.2026: beides – **KOST1 je Transporter**, **KOST2 je Leistungsart**. Die DATEV-Felder heißen so;
in der Oberfläche steht „Transporter“ und „Leistung“.

- **Stammdaten** (`fin_kostenstellen`): Art (`kost1`/`kost2`), Nummer (Buchstaben und Ziffern, bis 8 Zeichen, je Art
  eindeutig), Bezeichnung, aktiv, bei Transportern das Firmenfahrzeug. Migration 108 legt KOST2 100 Montage, 200 Einlagerung,
  300 Reifenverkauf an und je aktivem Firmenfahrzeug T1, T2 … (Bezeichnung aus Kennzeichen und Name). „Transporter
  übernehmen“ holt später dazugekommene Fahrzeuge und – nach „Alle Daten löschen“ – die drei Leistungsarten nach.
  Ändern und Ausblenden mit „Finance › Einstellungen“ schreiben; Art und Nummer stehen fest, sobald damit gebucht ist.
- **Wohin sie kommen:** je Posten. `fin_buchen()` schreibt sie an die Zeilen des Postens, deren Konto ein Erlös-, Aufwands-
  oder Anlagekonto ist – nie an Bank, Kasse, Forderung, Verbindlichkeit oder Steuer. Hat der Posten kein solches Konto,
  wird die Buchung abgelehnt; unbekannte oder ausgeblendete Nummern ebenso. Die Vorschau (`postenZeilen` in
  `lib/finance/buchung.ts`) rechnet genauso. Ein Storno übernimmt die Kostenstellen (Trigger `trg_fin_storno_kost`).
- **Erfassen:** Buchungsfenster (je Posten zwei Auswahlen), Stapel (Felder KOST1/KOST2 in der Erfassungszeile, Spalten in
  der Liste), Vorlagen und wiederkehrende Buchungen (werden beim Holen mitgenommen). Ohne Auswahl bleibt es leer –
  Pflicht ist nichts.
- **Auswerten:** Reiter „Kostenstellen“ (`components/finance/FinanceKostenstellen.tsx`, `kostenAuswertung`): je Kostenstelle
  im Zeitraum Erlöse (Haben minus Soll auf Erlöskonten), Aufwand (Soll minus Haben auf Aufwandskonten), Ergebnis und
  Zeilen; je Art eine Zeile „ohne …“ für den Rest. Anlagekonten zählen nicht – die Abschreibung schon. Das Journal hat die
  Spalten Transporter und Leistung und den Filter „Kostenstelle“, das Kontoblatt die Spalten.
- **Export:** Der DATEV-Buchungsstapel füllt „KOST1 - Kostenstelle“ und „KOST2 - Kostenstelle“ (aus der Zeile mit Konto
  oder Gegenkonto des Satzes), der GoBD-Export hat in den Buchungszeilen die Spalten KOST1 und KOST2.
- **Später (Stufe D):** Bei den FSM-Rechnungen kommt die Leistungsart „ohne Handarbeit“ aus dem Artikel, der Transporter aus
  dem Auftrag.
- Tests: `tests/financeKostenstellen.test.ts`, `tests/financeKostenstellenOberflaeche.test.tsx`; Datenbank `/tmp/pgt/t108.sql`.

## 15. Stufe C abgeschlossen: Stapel am Handy, Splitt, Abhaken (v183, Migration 109)

- **Stapel am Handy** (Entscheidung 5, `components/finance/FinanceStapelHandy.tsx`): Reiter „Stapel“ auch am Handy, als
  Kartenliste. „+ Zeile“ öffnet die schlanke Maske – Vorlage, Datum (Kalender), Betrag, Text, Soll, Haben (Auswahllisten
  nach Kontoart), Steuer, Beleg, Transporter und Leistung –, darunter „So wird gebucht“. „+ Nächste“ speichert und lässt
  Datum und Steuer stehen, der Beleg zählt weiter. Antippen einer Zeile ändert oder löscht sie; „Stapel buchen“ mit
  Rückfrage. Dieselben Zeilen und dieselbe Prüfung wie am Rechner; ohne „Finance › Buchungen“ schreiben nur ansehen.
- **Splitt im Stapel** (`fin_stapel_zeilen.teil_von`): An eine Zeile (Kopf) lassen sich Teile hängen – weitere Posten
  derselben Buchung mit eigenen Konten, Betrag, Steuer und Kostenstellen; Datum, Beleg und Text bleiben die des Kopfes
  (`fin_stapel_teil_speichern()`, ändert sich der Kopf, ziehen die Teile mit). „Stapel buchen“ bucht Kopf und Teile als
  eine Buchung mit mehreren Posten; ein fehlerhafter Teil hält wie jede Zeile den ganzen Stapel an. Kopf löschen löscht die
  Teile mit. Am Rechner: Taste T oder „+ Teil“ in der Detailspalte, die Erfassungszeile sperrt dann Datum, Beleg und Text
  und bleibt nach dem Übernehmen für den nächsten Teil offen (Esc beendet); Teile stehen als 1.1, 1.2 unter dem Kopf, die
  Detailspalte zeigt die ganze Buchung. Am Handy: „+ Teil“ im Fenster der Zeile. Die Summenzeile nennt Zeilen und Buchungen.
- **Abhaken** (`fin_abgehakt`, `fin_abhaken()`): Im Kontoblatt hat jede Zeile ein Kästchen; H hakt die gewählte oder alle
  markierten ab (sind schon alle abgehakt, nimmt H die Haken weg). Filter „nur offene“/„nur abgehakte“, im Kopf „Nicht
  abgehakt“ mit Anzahl und Saldo – zum Abstimmen von Bank-, Kassen- oder Verrechnungskonten. Der Haken ist eine Notiz
  neben dem Journal (GoBD: die Buchung ändert sich nicht) und geht auch in festgeschriebenen Monaten. Der CSV-Export hat
  die Spalte „Abgehakt“. Ohne Recht und ohne Haken bleibt die Spalte weg.
- Tests: `tests/financeStapelHandy.test.tsx`, `tests/financeStapel.test.ts` (Reihenfolge und Positionen mit Teilen),
  `tests/financeStapelOberflaeche.test.tsx` (Teil mit T), `tests/financeKontoblattOberflaeche.test.tsx` (Abhaken);
  Datenbank `/tmp/pgt/t109.sql`.

## 16. So ist Stufe D gebaut: Personenkonten und alle Rechnungen (v184, Migrationen 110 und 111)

- **Personenkonten** (`fin_personenkonten`, Migration 110, Entscheidung 3): Debitoren 10000–69999, Kreditoren 70000–99999 –
  der DATEV-Standard bei Sachkontenlänge 4. Debitor = Kundennummer + `betrieb.datev_debitor_basis`, genau wie im
  DATEV-Export des Rechnungsbuchs (`debitorFuer()`, Migration 59), damit die Kanzlei dieselben Nummern sieht. Der
  Sammeldebitor (`betrieb.datev_sammeldebitor`, Vorgabe 69999) nimmt die Laufkundschaft und Rechnungen ohne Kundennummer;
  Unterdebitoren einer Kundengruppe haben ihre eigene Nummer. Kreditoren je Lieferant fortlaufend ab 70000. Angelegt wird
  ein Personenkonto von selbst, sobald eine Buchung es braucht.
- **Nebenbuch statt Umbuchen:** Gebucht bleibt auf dem Sammelkonto (1400/1600 bzw. 1200/3300); die Forderungs- oder
  Verbindlichkeitszeile trägt `personenkonto`. So bleiben Summen, Bilanz, Steuer und alle Funktionen aus F1–F9 unverändert.
  Ein Trigger (`fin_zeile_personenkonto`) setzt es beim Schreiben jeder Zeile, wenn die Buchung aus einer Rechnung, Zahlung,
  einem Skonto oder Beleg kommt; Stornos erben es über dieselbe Quelle. Die vorhandenen Zeilen hat Migration 110 einmal
  nachgetragen. Von Hand gebuchte Zeilen auf 1400/1600 bleiben ohne Personenkonto.
- **Datenschutz:** Die Tabelle hält nur den Verweis auf Kunde bzw. Lieferant; Name und Anschrift kommen beim Lesen aus dem
  Stamm (`fin_personenkonten_stand()`). Kunden mit echter Rechnung lassen sich ohnehin nicht endgültig löschen
  (Migration 56); geht ein Kunde trotzdem, bleibt das Personenkonto ohne Namen stehen (Fremdschlüssel `on delete set null`).
  Deshalb gehört die Tabelle weder in `kunde_endgueltig_loeschen()` noch in die Auskunft.
- **Finance › Buchungen › Personen** (`components/finance/FinancePersonenkonten.tsx`, `lib/finance/personen.ts`): Liste mit
  Vortrag (Saldo aus den Vorjahren), Soll, Haben und Saldo je Person, Filter nach Art, „nur mit Saldo“, Suche, CSV. Enter
  (oder F3) öffnet das Personenkontoblatt (`kontoblatt(…, { vortrag })`) mit den offenen Posten darunter: je Belegnummer
  aufgerechnet wie bei DATEV (Rechnung gegen Zahlung, Skonto, Storno), mit Tagen seit dem Beleg. Am Handy Karten, Antippen
  zeigt Saldo und offene Posten. Im Kontoblatt eines Sachkontos zeigt die Spalte „Person“ den Debitor bzw. Kreditor.
- **DATEV und GoBD:** Der Buchungsstapel bucht Forderungen und Verbindlichkeiten auf das Personenkonto (das Sammelkonto
  ergibt sich in DATEV selbst); Finance › Export hat die Liste der Personenkonten (Konto, Art, Name, Kundennummer,
  Anschrift, USt-IdNr.) als CSV, damit die Kanzlei sie vor dem Einlesen anlegt. Der GoBD-Export hat die Spalte
  „Personenkonto“. Das DATEV-Stammdatenformat (Debitoren/Kreditoren) ist bewusst nicht gebaut – erst mit der Kanzlei klären.
- **Alle Rechnungen** (Migration 111, Entscheidungen 1 und 2): `fin_einstellungen.rechnungen_umfang` je Jahr – „Alle
  Rechnungen“ (Vorgabe ab 2027) oder „Pilot“ (nur „Rechnung nötig“; die Jahre vor 2027 hat die Migration so belassen).
  Mit „alle“ bucht der Trigger jede Rechnung aus FSM (keine Testrechnung, kein Testauftrag); „Zu erstellen“ und
  „Vorgemerkt“ zeigen weiter die Aufträge mit „Rechnung nötig“. „Alle nachbuchen“ (`fin_rechnungen_nachbuchen_alle`)
  bucht die noch nicht gebuchten Rechnungen des Jahres samt ihren Stornos. Die Pilot-Hinweise auf Übersicht, Steuern und
  Export erscheinen nur noch im Pilot. FSM bleibt unverändert.
- **Ohne Umsatzsteuerausweis** (`ohne_ausweis`): Aufträge ohne „Rechnung nötig“ ergeben Rechnungen ohne Steuerzeile. Bei
  Regelbesteuerung rechnet Finance die Steuer heraus (Vorgabe: 19 % aus 119 €, je Satz auf den Cent) oder bucht – nur
  wenn der Steuerberater das so sieht – steuerfrei auf 8200/4200. Kleinunternehmer wie bisher auf 8195/4185.
  **Mit dem Steuerberater klären, bevor 2027 gebucht wird.**
- **Leistungsart aus dem Artikel** (Entscheidung 4): Je Rechnungsposition KOST2 über die Artikelnummer –
  `fin_artikel_leistungsart()`: abweichende Wahl in `fin_artikel_kost`, sonst die Vorgabe aus der Abrechnungsart
  (`FIN_LEISTUNGSART_VORGABE`: Lagergebühr → 200, Reifenverkauf neu/gebraucht → 300, sonst 100). Eine Nachlasszeile (ohne
  Artikelnummer) folgt ihrer Position. KOST1 aus dem Firmenfahrzeug des Auftrags. Gibt es die Kostenstelle nicht oder ist
  sie ausgeblendet, bleibt die Zeile ohne – die Rechnung wird trotzdem gebucht. Pflege unter Kostenstellen › „Leistungsart
  je Artikel“.
- **Rechnungsbuchung neu** (`fin_rechnung_buchen_kern()`): Erlöse je Steuersatz und Leistungsart als eigener Posten; die
  Steuer je Satz bleibt die des Belegs und wird auf die Posten verteilt (der letzte nimmt den Rundungsrest). Weil ein
  Posten dann eine eigene Steuer trägt, kann ein Posten mit Rundungsrest beim DATEV-Export ohne Automatik hinübergehen
  (Hinweis auf der Exportseite).
- Tests: `tests/financePersonen.test.ts`, `tests/financePersonenkontenOberflaeche.test.tsx`, `tests/financeExport.test.ts`
  (Personenkonto im DATEV-Satz), `tests/financeKostenstellen.test.ts` (Vorgabe wie SQL),
  `tests/financeKostenstellenOberflaeche.test.tsx` (Leistungsart je Artikel); Datenbank `/tmp/pgt/t110.sql`, `/tmp/pgt/t111.sql`.


## 17. So ist Stufe E Teil 1 gebaut: Bankregeln, Sammelzuordnung, Geldtransit (v185, Migration 112)

- **Bankregeln** (`fin_bankregeln`, Recht „Finance › Bank“): Bezeichnung, Richtung (Eingänge, Abbuchungen, beides),
  Bedingungen Name enthält, Verwendungszweck enthält, IBAN genau – mindestens eine, alle angegebenen müssen stimmen
  (Groß/Klein, Leer- und Satzzeichen egal). Ergebnis: Konto, Steuerschlüssel, Buchungstext, KOST1/KOST2. Passen mehrere,
  gilt die mit den meisten Bedingungen (`regelFuer()` in `lib/finance/bank.ts`). Pflege unter Bank & Kasse › Konten &
  Importe, beim Buchen auf ein Konto auch über „Als Regel merken“; dort gibt es eine fertige Regel „Bareinzahlung“.
- **Nichts wird von selbst gebucht** (Organisationsvorgabe: keine irreversible Aktion ohne Kontrolle): Eine Regel füllt im
  Umsatzfenster das Konto vor; passt zugleich eine Rechnung bzw. ein Beleg auf den Cent, bleibt die Auswahl vorn.
  „Nach Regeln buchen (n)“ im Reiter „Offen“ zeigt alle Treffer als Liste mit Haken (Umsätze, zu denen auch eine Rechnung
  passt, sind abgewählt) – gebucht wird erst mit „n Umsätze buchen“, einzeln über `fin_bank_zu_konto()`. Was nicht geht,
  steht danach in der Liste.
- **Kostenstellen bei der Kontobuchung:** `fin_bank_zu_konto()` hat zwei neue Parameter `p_kost1`/`p_kost2` (die alte
  Fassung mit vier Parametern ist entfernt). Die Felder erscheinen nur bei Erlös-, Aufwands- und Anlagekonten
  (`fin_kost_an_buchung()` prüft dasselbe).
- **Sammelzuordnung** (`fin_bank_sammeln()`, `fin_bank_teile`, Zuordnung „mehrere“): Ein Umsatz wird auf bis zu 50
  Rechnungen (Eingang) bzw. Belege (Abbuchung) verteilt, je Posten mit Betrag und Skonto. Je Posten entsteht eine
  Zahlungsbuchung wie bei der einzelnen Zuordnung (mit Teilzahlung, wenn etwas offen bleibt), das Skonto über
  `fin_skonto_buchen()`, ein Rest (Gebühr, Überzahlung, Differenz) als Bankbuchung auf das gewählte Konto. Mehr als der
  Umsatz geht nicht; bleibt etwas übrig, braucht es das Konto. Im Fenster: „Mehrere / Differenz …“ mit allen offenen
  Posten (Nummer im Zweck und Name zuerst), bei einer vorgeschlagenen Rechnung „Mit Differenz …“ und ein Klick für
  „Differenz als Skonto“.
- **Aufheben** (`fin_bank_aufheben()`): bei „mehrere“ wird erst der Umsatz geöffnet, dann jeder Teil gegengebucht (Skonto
  zuerst), dann werden die Teile gelöscht. Einen einzelnen Teil zu stornieren, solange der Umsatz zugeordnet ist, verhindert
  ein Trigger.
- **Geldtransit:** „Zur Bank gebracht“ im Kassenbuch öffnet eine Buchung Geldtransit (SKR03 1360, SKR04 1460) an Kasse.
  Der Eingang auf dem Kontoauszug wird auf Geldtransit gebucht (am besten mit der Regel „Bareinzahlung“). Steht auf dem
  Geldtransit ein Saldo, zeigt das Kassenbuch „Unterwegs zur Bank“.
- Rücknahme: `rollback/112_rollback.sql` weigert sich, solange es Sammelzuordnungen gibt, und stellt `fin_bank_zu_konto()`
  und `fin_bank_aufheben()` aus Migration 91 wieder her.
- Tests: `tests/financeBankregeln.test.ts` (Regeln, Sammeln, Richtungen und Geldtransit wie SQL),
  `tests/financeBankOberflaeche.test.tsx` (Sammeln, Skonto, Rest, Regeln, „Als Regel merken“, Geldtransit); Datenbank
  `/tmp/pgt/t112.sql`.
- **Teil 2 (als Nächstes):** Bankdaten und Zahlungsbedingungen je Lieferant, Zahlungsvorschlag für fällige Belege,
  SEPA-Überweisungsdatei (pain.001) zum Hochladen ins Online-Banking.
