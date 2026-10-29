# Bestellliste – „Fehlt was?“ (Migration 104, v173; Migration 105, v174)

Wunsch Vitali 29.10.2026: Techniker sollen vor Ort eintragen, was fehlt – eine Nuss, ein Werkzeug,
Verbrauchsmaterial – und zwar **als Freitext**: Eine vorgegebene Auswahl hätte genau die Dinge nicht, die gerade
fehlen. Mockup `Claude outputs/Mockup_Bestellliste_v1.html`, dann entschieden: optional Kunde und Auftrag, Foto gleich
dabei, den Stand setzt nur der Admin.

## Eintragen

- **Handy:** Schnellmenü oben rechts › „Fehlt was?“ (neben Stoppuhr, Chat, Zum Lager).
- **Auftragsfenster:** Menü ⋯ › „Fehlt was? Bestellen“ – Kunde und Auftrag sind dann schon eingetragen.
- **Seite „Bestellliste“** (Seitenleiste nach der Packliste, am Handy unter Weitere › Lager): Knopf „Was fehlt?“.

Das Blatt (`components/bestellung/BestellBlatt.tsx`, Ebene `modal-bestaetigung`, liegt also auch über dem Auftrag):

| Feld | |
|---|---|
| Was wird gebraucht? | Pflicht, Freitext bis 500 Zeichen |
| Menge | freiwillig, Freitext („2 Stück“, „1 Beutel“), bis 60 Zeichen |
| Wie eilig? | Normal / Dringend – dringend schickt sofort eine Push-Meldung ans Büro |
| Für | je aktiver Transporter, Lager oder allgemein |
| Kunde / Auftrag | freiwillig; Auftrag aus den offenen und denen der letzten 30 Tage dieses Kunden |
| Foto | freiwillig, verkleinert wie die Auftragsfotos (`lib/belegBild.ts`), privat im Bucket `bestell-fotos` |

Beim Tippen schlägt das Blatt frühere Texte vor (`bestellVorschlaege`) und zeigt, wenn dasselbe schon offen oder
bestellt ist (`aehnlicheWuensche`: gemeinsame Wörter, Zahlen zählen mit – „17“ ist nicht „19“). Dann gibt es
**„+1 – brauche ich auch“** statt eines zweiten Eintrags (`bestellwunsch_plus`).

## Ablauf

offen → **bestellt** (mit Lieferant/Notiz, auch mehrere auf einmal) → **da** — oder **nicht nötig** (mit Grund,
mindestens 3 Zeichen). Jeder Stand lässt sich auf „offen“ zurücksetzen. Den Stand setzt nur, wer
„Bestellliste verwalten“ darf (ab Werk der Admin); dazu „Liste kopieren“ bzw. „Markierte kopieren“ – eine Zeile je
Wunsch mit Menge, ohne Kundennamen, für die Mail an den Lieferanten.

Eigene Einträge ändern und löschen, **solange sie offen sind**; danach nur noch der Verwalter. Techniker sehen
anfangs „Nur meine“ (selbst eingetragen oder +1), können aber alle sehen, um „+1“ zu drücken.

## Push (`lib/bestellVersand.ts`, aus `app/api/push/senden`)

- **dringend** eingetragen (oder nachträglich auf dringend gestellt) → an alle mit „Bestellliste verwalten“ (und den
  Superadmin), nicht an den Eintragenden. Titel „Dringend bestellen – ‹Name›“.
- **da** oder **nicht nötig** → an den Eintragenden und alle mit +1, nicht an den, der den Stand gesetzt hat.
- Einmal je Anlass: `push_buero_am`, `push_ersteller_am` („erst eintragen, dann senden“, wie beim Chat). Ein Trigger
  stößt die Route sofort an (`{"anlass":"bestellung"}`), der Minutenlauf holt nach. Älter als eine Stunde: nur abhaken.
- Antippen öffnet `/?bestellung=<id>`: die Seite mit diesem Eintrag hervorgehoben.

## Datenbank (Migration 104)

- `bestellwuensche`: Text, Menge, dringend, `fuer` (transporter|lager|allgemein, Transporter nur bei „transporter“),
  `kunde_id`/`auftrag_id`/`firmenfahrzeug_id` (alle `on delete set null`), Foto, `status`, `notiz`, `grund`
  (Pflicht bei „nicht nötig“), `erstellt_von`, Zeitstempel, Push-Stempel.
- `bestellwunsch_plus` (wunsch, profil).
- `bestellwunsch_pruefen()` (BEFORE, ohne security definer, current_user-Weiche wie Migration 78): neue Einträge
  beginnen „offen“; ändern/löschen nur eigene offene, außer Verwalter; Stand und Notiz nur Verwalter; Push-Stempel
  gehören dem Versand. Meldungen im Klartext.
- Rechte: `bestellungen` (L/S admin, techniker, user), `bestellungen.verwalten` (L/S admin). RLS: lesen mit
  `bestellungen lesen`, löschen prüft nur lesen (der Trigger entscheidet, CLAUDE.md §2).
- „Alle Daten löschen“ leert beide Tabellen; die Fotos räumt `app/api/alle-daten/fotos` ab, sobald die Tabelle leer ist.

## Wer hat es eingetragen (Migration 105, v174)

Wunsch Vitali 29.10.2026: „Sonst weiß ich nie, wer gesagt hat, dass es noch fehlt.“ Der Name kommt **aus der
Anmeldung**, nicht vom Gerät: `bestellwunsch_wer()` (BEFORE, security definer, läuft nach `bestellwunsch_pruefen()`)
setzt `erstellt_name` beim Eintragen aus `zugang_anzeigename()` – Mitarbeitername zum Zugang, sonst der Teil der
E-Mail vor dem @ (wie `chat_personen()`); danach ist er nicht änderbar. Bis v173 stand bei Zugängen ohne Mitarbeiter
(Büro) „von Büro“. Ebenso `bestellwunsch_plus.name` – die Liste zeigt „+1 von Paul, dir“. Der Name ist ein
Schnappschuss und bleibt lesbar, wenn der Zugang später entfernt wird. Das Blatt „Fehlt was?“ sagt vorher, unter
welchem Namen eingetragen wird (`meinBestellName`). Regeln: `bestellWer`, `bestellPlusText` in `lib/bestellung.ts`.

## In den Chat (v174)

Jeder Eintrag hat „In den Chat“ – wie ein Auftrag kommt er als Karte an die Eingabe: „Bestellung: Ventile · 1 Beutel“,
darunter Wofür, von wem, Stand (beim Schreiben). Antippen öffnet die Bestellliste an diesem Eintrag (wie die
Push-Meldung). Wird der Eintrag gelöscht, heißt die Karte „Bestellung gelöscht“ (`bestellwunsch_nachlauf()`).
Gleiches gibt es für einen Tag der Packliste – siehe `docs/team-chat.md`.

## Löschkonzept und Aufbewahrung (Migration 105, v174)

Durchsicht 29.10.2026 auf Frage Vitali („Beinhaltet das Löschkonzept alles?“):

| Weg | Bestellliste |
|---|---|
| Alle Daten löschen | beide Tabellen geleert (geht über alle Tabellen); Fotos: vorgemerkt beim Leeren, dann `app/api/alle-daten/fotos` |
| Alle Daten sichern | enthalten (geht über alle Tabellen); Fotos wie alle Bilder nur als Pfad, nicht als Datei |
| Kunde endgültig löschen | **seit 105**: Wünsche zu diesem Kunden oder seinen Aufträgen gehen mit (vorher nur der Verweis – Text, Notiz und Foto blieben) |
| Kunden zusammenführen | **seit 105**: die Wünsche wandern zum Kunden, der bleibt |
| Auskunftsauszug (Art. 15) | **seit 105**: Abschnitt „Bestellwünsche“ (Text, Menge, Stand, Notiz/Grund, ob Foto) – ohne Mitarbeiternamen |
| Aufbewahrung | **seit 105**: „da“ und „nicht nötig“ 12 Monate nach dem Erledigen gelöscht (`bestell_aufraeumen()`, pg_cron 03:45 UTC) – dieselbe Frist wie im Chat. Offene und bestellte bleiben. |
| Fotodateien | **seit 105**: Löschen eines Wunsches oder Ersetzen des Fotos merkt den Pfad in `private.bestell_fotos_weg` vor; der Minutentakt (`bestellFotosAufraeumen()`) löscht die Datei mit dem Dienstschlüssel. Der App-Weg „Löschen“ entfernt die Datei wie bisher sofort mit. |

`kunde_endgueltig_loeschen()` und `kunden_zusammenfuehren()` sind seit 105 Hüllen: die bisherigen Funktionen heißen
`…_grund` (unverändert, nicht von außen aufrufbar), die Hülle ruft sie und erledigt danach die Bestellliste – Vorbild
`kunde_auskunft_grund` (Migration 65). Prüfungen und Meldungen kommen weiter aus `…_grund`.

Packliste und Saisonliste sind Ansichten auf Aufträge und Lager; eigene Daten hat nur die Packliste
(`mitnehmen_gepackt`, der Haken „eingeladen“) – die hängt per Kaskade am Satz und geht mit ihm.

## Bewusst (noch) nicht

- Kein Artikelkatalog, keine Preise, keine Lieferantenstammdaten – Freitext und Notiz genügen vorerst.
- Keine Bestellwünsche in den Vorschlägen unter „+“ im Chat – sie kommen über „In den Chat“ auf der Seite (wie
  Lagerplätze und Verkaufsreifen).
- Nicht offline: Eintragen braucht Netz (wie das Abschließen eines Auftrags).
