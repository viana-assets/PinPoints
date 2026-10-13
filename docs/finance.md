# Finance – Buchhaltung als zweites System neben FSM

Stand: 13.10.2026 · **Konzept und Fahrplan, noch nichts gebaut.** Klickbarer Mockup:
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
- Technisch: `SYSTEME` als eine zentrale Liste (Konstanten-Regel), `MODULE` bekommt das Feld
  `system`, `app/page.tsx` schaltet nur die Navigation und den Inhaltsbereich um. Finance-Seiten
  liegen unter `components/finance/` und `app/_seite/useFinance*.ts`.

## 2. Rechte – zuerst nur der Superadmin

Neuer Bereich **`finance`** in `RECHTE_KATALOG` mit Unterrechten, nach dem Muster von Lager und
Zeiterfassung:

| Schlüssel | lesen | schreiben | löschen |
|---|---|---|---|
| `finance` | Finance öffnen, Übersicht | – | – |
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
- **Kassenbuch** für Bargeld vor Ort: fortlaufend, tagesgenau, ohne nachträgliche Änderung,
  Kassensturz; Barzahlungen aus FSM-Aufträgen fließen ein.
- Später: automatischer Abruf über einen Bankdienst (PSD2/FinTS) – Kontodaten gingen dann an diesen
  Dienst; braucht Vertrag und Datenschutzprüfung.

### 4.4 Buchen (Journal)
- Buchungsmaske Soll / Haben / Betrag / Steuerschlüssel / Beleg; Splitbuchungen; die Datenbank
  lehnt jede Buchung ab, deren Soll und Haben nicht gleich sind.
- Steuerschlüssel rechnen Vorsteuer bzw. Umsatzsteuer automatisch heraus (19 %, 7 %, 0 %, § 13b,
  innergemeinschaftlich).
- **Festschreibung je Monat:** danach unveränderbar, nur Storno mit Gegenbuchung. Lückenlose
  Buchungsnummern wie bei den Rechnungen (Zähler mit Sperre, keine Sequence).
- Wiederkehrende Buchungen, Privatentnahmen/-einlagen, Eröffnungsbilanz bzw. Saldenvorträge.

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
- **„Alle Daten löschen“** würde heute alle `fin_*`-Tabellen mit leeren. Für eine echte Buchhaltung
  muss vor Phase F1 entschieden werden, ob Finance dabei bleibt oder mitgelöscht wird (offene Frage).
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

Vorschlag zur Reihenfolge: F0 → F1 → F3 → F2 → F4 → F5. Die Rechnungen kommen früh, weil sie den
Umsatz liefern und heute schon täglich entstehen; nach F5 laufen Rechnungen, Belege, Bank und UStVA
über einen ganzen Monat, bevor die Auswertungen (F6 ff.) dazukommen.

## 8. Offene Fragen vor F0/F1

1. Rechtsform des Betriebs und heutige Besteuerung (Regel/Kleinunternehmer, Soll/Ist, Zeitraum)?
2. Bleibt Finance bei „Alle Daten löschen“ erhalten?
3. Wird der Steuerberater weiter die Buchhaltung machen (dann reicht Belege + Export lange) oder
   soll Finance sie ersetzen?
4. Gibt es Barzahlungen beim Kunden (Kassenbuch nötig)?
5. Ab welchem Wirtschaftsjahr soll gebucht werden, mit welchen Eröffnungswerten?
6. Entschieden 13.10.2026: Der Pilot enthält nur Vorgänge mit „Rechnung nötig“; FSM bleibt
   unverändert, alles andere bleibt in FSM und in der bisherigen Buchhaltung.
