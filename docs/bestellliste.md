# Bestellliste – „Fehlt was?“ (Migration 104, v173)

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

## Bewusst (noch) nicht

- Kein Artikelkatalog, keine Preise, keine Lieferantenstammdaten – Freitext und Notiz genügen vorerst.
- Keine Aufbewahrungsfrist: erledigte Einträge bleiben (Filter „Da“, „Nicht nötig“). Bei Bedarf später ein Aufräumen
  nach 12 Monaten wie beim Chat.
- Nicht offline: Eintragen braucht Netz (wie das Abschließen eines Auftrags).
