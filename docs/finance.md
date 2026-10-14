# Finance – Buchhaltung als zweites System neben FSM

Stand: 13.10.2026 · **Gebaut: F0 (v145, Migration 87)** – Systemwechsel, Rechte, Navigation, Übersicht,
Einstellungen –, **F1 (v146, Migration 88)** – Konten, Steuerschlüssel, Journal, Storno, Festschreibung – und
**F3 (v147, Migration 89)** – Rechnungen mit „Rechnung nötig“, Zahlungen, offene Posten –, **F2 (v148,
Migration 90)** – Belege und Lieferanten –, **F4 (v149, Migration 91)** – Bank & Kasse – und **F5 (v150, Migration
92)** – Umsatzsteuer-Voranmeldung als Probelauf –, dazu **Nachträge (v151, Migration 93)**: Teilzahlungen,
Kassensturz, § 13b Abs. 2, Fristerinnerung –, **F6 (v152, Migration 94)** – Auswertungen – und **F7 (v153,
Migration 95)** – Anlagen und Abschreibungen („So ist … gebaut“ in Abschnitt 7). Alles Weitere ist Konzept. Klickbarer Mockup:
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
  der Rest unter „Weitere“), der ganze FSM-Inhalt ist ausgehängt, `#app` trägt `vollseite sys-finance` (Petrol
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
- Noch nicht: Zusammenfassende Meldung, Umsatzsteuer-Jahreserklärung, Abschlussbuchung der USt-Konten auf 1780.
  Übermittelt wird nie aus der App. (Erinnerung per Push und § 13b Abs. 2: Nachträge v151.)

### Nachträge zu F2–F5 (v151, Migration 93)

- **Teilzahlungen** im Bankabgleich: Ein Zahlungseingang (oder eine Abbuchung) darf kleiner sein als der offene Rest
  einer Rechnung (eines Belegs) – „Teilzahlung“ statt „Zuordnen“. Vorgeschlagen wird sie, wenn die Nummer im Zweck
  steht oder der Name passt. Bezahlt ist der Posten erst, wenn nichts mehr offen ist; offene Posten, Übersicht und
  Fenster zeigen den Rest und „x € schon bezahlt“. „Bar bezahlt“/„Überweisung“ an Rechnung und Beleg buchen den
  Rest. Eine Teilzahlung nimmt man unter Bank & Kasse mit „Aufheben“ zurück; war der Posten bis dahin bezahlt,
  ist er wieder offen (eine Restzahlung von Hand zählt dann als Teilzahlung weiter). Mehr als der Rest wird nicht
  zugeordnet – eine Überzahlung bucht man auf ein Konto. Skonto als eigene Buchung gibt es noch nicht.
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
- Noch nicht: Erinnerungswert 1 €, Leistungsabschreibung, Sonderabschreibung nach § 7g und Investitionsabzugsbetrag,
  Anlagenspiegel als Export (kommt mit F8/F9).

Reihenfolge: F0 → F1 → F3 → F2 → F4 → F5. **F0, F1, F3, F2, F4, F5, F6 und F7 erledigt**, Nachträge v151; danach laut Plan ein Monat
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
