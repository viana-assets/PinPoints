# Team-Chat

**Stand: 08.10.2026 (Migrationen 80 und 81, Service Worker v130).** Ein gemeinsamer Chat für alle mit dem
Recht `chat · lesen` – Wunsch Vitali vom 08.10.2026, Entwurf `entwurf_chat.html` (Claude outputs).
Reaktionen und Antworten kamen mit Migration 81 (v130). Einzelchats, eigene Nachrichten ändern oder
löschen und Fotos im Chat sind nicht gebaut; das steht
in `fahrplan.md`.

## Was man sieht

- **Die Chat-Blase** (`components/chat/ChatBlase.tsx`) schwebt auf jeder Seite: am Handy über der
  unteren Leiste, am Rechner unten rechts. Die rote Zahl zählt die Ungelesenen. Auf Seiten mit
  Karte sitzt am Handy schon der runde Kartenknopf an derselben Stelle – die Blase rückt dann
  darüber; ist die Karte am Handy offen, verschwindet sie (dort liegen Bedienknöpfe und
  Kundenblatt). Am Rechner rückt sie neben die Bedienknöpfe der Karte. Sie liegt unter allen
  Fenstern (Ebene 960): über dem Auftragsfenster verdeckte sie dessen Knöpfe.
- **Das Chatfenster** (`components/chat/ChatFenster.tsx`): am Handy über den ganzen Bildschirm, am
  Rechner als Spalte rechts, Ebene 10003 – also auch über dem Auftrags- oder Kundenfenster, aus dem
  heraus es mit „In den Chat“ geöffnet wurde. Nachrichten nach Tagen (HEUTE, GESTERN, Datum), eigene
  rechts, fremde links mit Namen in einer festen Farbe je Person.
- **Karten.** Eine Nachricht kann eine Karte tragen: Auftrag (orange, „Auftrag #114 · Räderwechsel“,
  darunter Kunde · Tag · Uhrzeit), Kunde (grün, Firma bzw. Name, darunter Ansprechpartner · Ort),
  Lagerplatz (blau, darunter Kunde · Saison · Größe) oder Verkaufsreifen (blau, Größe, darunter
  Hersteller · Saison · Bestand). Antippen schließt den Chat und öffnet die Sache – Auftragsfenster,
  Kundenfenster oder den Platz bzw. Posten im Lager. Was die Rolle nicht öffnen darf, ist nur zu
  lesen; ein Kunde, den es nicht mehr gibt, gibt eine Meldung statt eines stummen Klicks.
- **„In den Chat“** im ⋯-Menü des Auftrags und des Kundenfensters, als Knopf im Platzblatt des
  Lagers und im Blatt eines Verkaufsreifens. Der Chat geht auf, die Karte hängt schon an der
  Eingabe (✕ nimmt sie wieder ab). Fehlt ohne `chat · schreiben`.
- **„+“** an der Eingabe hängt eine Karte an, ohne erst in den Auftrag zu gehen: Suche nach
  Auftragsnummer, Titel, Kunde; ohne Suchtext die Termine ab heute (`bezugVorschlaege()`). Plätze
  und Verkaufsreifen nur über „In den Chat“ im Lager.
- **@-Erwähnung.** Nach „@“ erscheinen die Personen mit Zugang (`chat_personen()`: Name des
  verknüpften Mitarbeiters, sonst der Teil der E-Mail vor dem @). Erwähnt ist, wessen „@Name“ beim
  Absenden noch im Text steht. Erwähnte bekommen „… hat dich erwähnt“ als Push-Titel, und die
  Nachricht ist für sie umrandet.
- **Nur mit Netz.** Ohne Verbindung steht ein Hinweis da, Senden ist gesperrt – keine Absicht im
  Ausgangskorb (`claude/offline-schreiben.md`). Eine Chatnachricht, die Stunden später ankommt, wäre
  irreführender als eine, die gar nicht abgeht.
- Am Rechner schickt Enter ab (Umschalt+Enter: neue Zeile), am Handy nur der Knopf.
- **Reaktionen und Antworten (Migration 81, v130).** Lange drücken auf eine Nachricht (Handy) oder
  der kleine ☺-Knopf daneben (Rechner, beim Darüberfahren; am Handy unsichtbar, aber antippbar)
  öffnet die Leiste: 👍 👎 ❤️ 😂 😮 ✅, „↩ Antworten“, „Kopieren“. Je Person eine Reaktion je
  Nachricht; dieselbe noch einmal nimmt sie zurück, eine andere ersetzt sie. Unter der Nachricht
  stehen die Reaktionen gezählt (in fester Reihenfolge, die eigene blau, Namen im Tooltip) – ein
  Tipp darauf setzt oder nimmt die eigene. „Antworten“ hängt ein Zitat an die Eingabe (✕ bricht
  ab); im Verlauf steht es über der Antwort, ein Tipp springt zur Ursprungsnachricht und hebt sie
  kurz hervor. Ist sie nicht mehr geladen oder aufgeräumt, steht „frühere Nachricht“ da. Beides
  nur mit `chat · schreiben`.

## Push und Zahl am App-Symbol

Bei **jeder** neuen Nachricht bekommen alle anderen mit Leserecht eine Push-Meldung, so wie die
Terminerinnerung; Antippen öffnet `/?chat=1`. Die Meldung trägt die Zahl der Ungelesenen, der
Service Worker setzt daraus das rote Abzeichen am App-Symbol (`setAppBadge`). Einzelheiten –
sofortiger Anstoß per Trigger, Nachholen im Minutentakt, „einmal je Nachricht“ – in
`benachrichtigungen-plan.md`, „Vierte Nutzung“. Seit Migration 81: Eine Antwort geht wie jede
Nachricht an alle; wer die Ursprungsnachricht schrieb, liest „… hat dir geantwortet“. Eine Reaktion
meldet sich nur beim Verfasser („… hat reagiert – 👍 zu „…““), nicht bei einer Reaktion auf die
eigene Nachricht, und zählt nicht als ungelesen.

## Datenbank (Migration 80)

- `chat_nachrichten` – eine Zeile je Nachricht: `kanal` (heute immer `team`, die Tür für
  Einzelchats), `autor` (Vorgabe `auth.uid()`), `text` (1–4000 Zeichen, getrimmt), Karte als
  `bezug_art`/`bezug_id` plus Schnappschuss `bezug_titel`/`bezug_unter`, `erwaehnt uuid[]`,
  `created_at` (setzt die Datenbank), `push_gesendet_am`. Lesen: Richtlinie „Chat lesen“
  (`darf('chat','lesen')`); schreiben nur als man selbst und ohne `push_gesendet_am`; kein Ändern,
  kein Löschen. Nicht im Änderungsprotokoll (`audit_row`): das hielte den Text 36 Monate fest.
- `chat_nachrichten.antwort_auf` (Migration 81) – worauf geantwortet wird; `on delete set null`.
- `chat_reaktionen` (Migration 81) – Schlüssel (Nachricht, Zugang), `emoji` aus der festen Liste
  (`CHAT_REAKTIONEN`, Prüfregel `chat_reaktion_bekannt`), `push_gesendet_am`. Lesen mit L, setzen,
  ändern, zurücknehmen nur die eigene und mit S. `chat_reaktion_pruefen()` (ohne `security definer`,
  fragt `current_user`) setzt den Zeitpunkt und hält `push_gesendet_am` aus der Hand der Nutzer – eine
  geänderte Reaktion meldet sich nicht ein zweites Mal. Push-Anstoß wie bei Nachrichten. In
  `supabase_realtime`.
- `chat_gelesen` – je Zugang „gelesen bis“. Gesetzt auf den Zeitstempel der neuesten geladenen
  Nachricht (die Uhr der Datenbank, nicht die des Geräts).
- `chat_ungelesen()`, `chat_personen()` – beide `security definer`, beide nur mit `chat · lesen`.
- `chat_push_anstossen()` – AFTER INSERT, ruft per pg_net `/api/push/senden` auf. Fehler werden
  verschluckt: Die Nachricht bleibt gespeichert, der Minutentakt holt den Versand nach.
- `chat_bezug_vergessen()` – wird ein Kunde oder Auftrag **endgültig** gelöscht, heißt die Karte
  „Kunde gelöscht“ bzw. „Auftrag gelöscht“ und verliert ihre Unterzeile. Der Text bleibt.
- `chat_aufraeumen()` – nächtlich 03:25 UTC (`pinpoints-chat-aufraeumen`): Nachrichten älter als
  12 Monate werden gelöscht. Die Frist ist mit dem Datenschutz abzustimmen.
- Realtime: `chat_nachrichten` steht in der Veröffentlichung `supabase_realtime`. Die App hört auf
  neue Zeilen (`app/_seite/useChat.ts`) und fragt zusätzlich alle 20 s nach, falls die Verbindung
  nicht steht (`CHAT_ABFRAGE_MS`).

## Code

| Datei | Was |
|---|---|
| `lib/chat.ts` | Karten (`bezugAuftrag` …), @-Erwähnungen, Tagestrenner, Push-Inhalt, Vorschläge für „+“ – rein, `tests/chat.test.ts` |
| `lib/api/chat.ts` | Verlauf laden, senden, Lesestand, Ungelesene, Personen |
| `lib/chatVersand.ts` | Push je Nachricht (server-only), `tests/chatVersand.test.ts` |
| `app/_seite/useChat.ts` | Zustand auf der Startseite, Live-Verbindung, Lesestand, Abzeichen |
| `components/chat/` | Blase und Fenster, `tests/chatFenster.test.tsx` |
| `app/page.tsx` | `chatBezugOeffnen()`, „In den Chat“ an Auftrag, Kunde, Lager; `?chat=1` in `zielOeffnen()` |

## Datenschutz

Was im Chat steht, steht auch auf dem Sperrbildschirm der Kollegen (gekürzt auf 140 Zeichen). Die
Karte selbst zeigt bewusst wenig: Name und Ort, keine Straße, keine Telefonnummer – sie ist für
jeden mit Leserecht sichtbar, auch für Rollen, die den Kunden selbst nicht öffnen dürfen.
Besondere Kategorien (Art. 9 DSGVO) gehören nicht in den Chat. Die Aufbewahrung von 12 Monaten
ist mit dem Datenschutz abzustimmen.
