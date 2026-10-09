# Team-Chat

**Stand: 09.10.2026 (Migrationen 80, 81, 84 und 85, Service Worker v138).** Ein gemeinsamer Chat für alle mit dem
Recht `chat · lesen` – Wunsch Vitali vom 08.10.2026, Entwurf `entwurf_chat.html` (Claude outputs).
Reaktionen und Antworten kamen mit Migration 81 (v130). Mit Migration 84 (v137, Fahrplan E19):
Einzelchats, die eigene Nachricht bearbeiten und löschen, Fotos im Chat und „Ältere Nachrichten
laden“ – Abschnitt „Einzelchats, Bearbeiten, Fotos“ unten.

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

## Einzelchats, Bearbeiten, Fotos (Migration 84, v137)

- **Einzelchats.** Der Knopf rechts im Kopf (☰, mit der Zahl der Ungelesenen in den *anderen*
  Unterhaltungen) öffnet die Liste: oben der Team-Chat, darunter die Einzelchats nach der letzten
  Nachricht (mit Vorschau, Zeit und Zahl), darunter unter „NEUE UNTERHALTUNG“ alle anderen mit
  Zugang (`chatListe()`). Ein Tipp öffnet die Unterhaltung; im Kopf stehen dann Name und „Einzelchat ·
  nur ihr beide seht das“. Einen Einzelchat lesen **nur die beiden Beteiligten** – auch Admin und
  Superadmin nicht. Kein Name über den Nachrichten, keine @-Erwähnungen (es liest ja nur die eine
  Person); Karten, Antworten, Reaktionen und Fotos gehen wie im Team. Hat die Person keinen Zugang
  mehr, ist der Verlauf noch zu lesen, schreiben geht nicht mehr. Die Zahl an der Blase zählt Team und
  Einzelchats zusammen; je Unterhaltung gibt es einen eigenen Lesestand.
- **Bearbeiten.** Eigene Nachricht → Leiste → „Bearbeiten“: Der Text steht in der Eingabe („Nachricht
  bearbeiten“, ✕ bricht ab), ✓ speichert. Nur der Text, nur in den ersten **24 Stunden**
  (`CHAT_BEARBEITEN_STUNDEN`, dieselbe Frist prüft die Datenbank). An der Uhrzeit steht dann
  „bearbeitet“. Keine zweite Push-Meldung.
- **Löschen.** Eigene Nachricht → „Löschen“ → Rückfrage „Nachricht für alle löschen?“. Jederzeit. Die
  Nachricht bleibt als „Nachricht gelöscht“ im Verlauf stehen (Antworten darauf hängen sonst in der
  Luft); Text, Karte, Erwähnungen, Foto und Reaktionen sind weg. Zurückholen geht nicht. Fremde
  Nachrichten löscht niemand – auch kein Admin.
- **Fotos.** Kamera-Knopf neben „+“: Foto wählen oder aufnehmen, die App verkleinert es auf 1600 Pixel
  (wie die Auftragsfotos, `lib/belegBild.ts`), die Vorschau hängt an der Eingabe (✕ nimmt es ab), ein
  Text dazu ist freiwillig. Im Verlauf steht das Bild in seinem Seitenverhältnis (der Platz ist schon
  da, bevor es geladen ist); ein Tipp öffnet es groß (Ebene 10004), Escape oder ✕ schließt.
  Push-Text eines Fotos ohne Text: „📷 Foto“.
- **Ältere Nachrichten laden.** Beim Öffnen einer Unterhaltung die letzten 300 (`CHAT_LADEN_ANZAHL`);
  sind es so viele, steht oben „Ältere Nachrichten laden“ und holt 300 weitere
  (`CHAT_NACHLADEN_ANZAHL`). Die Stelle, an der man liest, bleibt stehen.
- **Push.** Eine Einzelnachricht geht nur an den Empfänger: „Jan an dich“, Antippen öffnet
  `/?chat=<Kennung des Schreibers>`, also genau diese Unterhaltung (`chatZielAus()`). Eine Nachricht,
  die vor dem Versand gelöscht wurde, meldet sich nicht.

## Haken an der eigenen Nachricht (Migration 85, v138)

Wie bei WhatsApp, rechts neben der Uhrzeit jeder eigenen Nachricht (Wunsch Vitali 09.10.2026;
entschieden: nur die Haken, keine Namen, wer wann gelesen hat):

- **✓ grau** – gesendet (in der Datenbank gespeichert).
- **✓✓ grau** – bei **allen** angekommen: im Team bei allen mit Chat-Zugang außer dem Schreiber (auch
  bei Zugängen, die den Chat nie öffnen – die halten den Haken dann grau, so wie in einer
  WhatsApp-Gruppe), im Einzelchat bei der einen Person. Angekommen heißt: Die App der Person hat sie
  abgeholt (`chat_empfangen()`, läuft bei offener App mit der Zahl an der Blase, etwa jede Minute) oder
  die Push-Meldung hat ein Gerät der Person erreicht (`chat_zugestellt_setzen()` im Versand).
- **✓✓ grün** – von allen gelesen (das „gelesen bis“, das beim Öffnen der Unterhaltung vorrückt).

`chat_haken(partner)` gibt dem Schreiber nur zwei Zeitpunkte: bis wann bei allen angekommen, bis wann
von allen gelesen (das Minimum über die Empfänger). Wer was gelesen hat, verrät sie im Team nicht. Die
Haken fragt die App bei offenem Chat alle 20 s nach (`useChatHaken`) – das Lesen der anderen löst bei
mir kein Ereignis aus. Vor Migration 85 steht nur ✓.

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

## Datenbank (Migration 84)

- `chat_nachrichten` neu: `an` (Empfänger; `kanal = 'direkt'` genau dann, wenn `an` gesetzt, nie an sich
  selbst – Prüfregel `chat_kanal_bekannt`), `bearbeitet_am`, `geloescht_am`, `foto_pfad`, `foto_breite`,
  `foto_hoehe` (erster Ordner = Schreiber, Maße Pflicht – `chat_foto_passt`). Text: 1–4000 Zeichen,
  mit Foto darf er leer sein, gelöscht ist er leer (`chat_text_laenge`).
- Richtlinie **„Chat lesen“** neu: `darf('chat','lesen') and (kanal = 'team' or autor = ich or an = ich)`.
  **„Eigene Nachricht ändern“** (UPDATE): nur der Verfasser, mit `chat · schreiben`. Was sich ändern
  darf, regelt `chat_nachricht_aendern()` (BEFORE UPDATE, ohne `security definer`, fragt
  `current_user` wie Migration 78/81): alles außer dem Text bleibt; Text nur 24 Stunden, setzt
  `bearbeitet_am`; `geloescht_am` setzen leert die Zeile; eine gelöschte lässt sich nicht mehr ändern.
  Versand (Dienstschlüssel) und `chat_bezug_vergessen()` sind davon nicht betroffen. Kein DELETE.
- `chat_nachricht_pruefen()` (BEFORE INSERT) zusätzlich: Empfänger muss den Chat lesen dürfen
  (`chat_kann_mitlesen()`), eine Antwort bleibt in ihrer Unterhaltung (die Ursprungsnachricht wird mit
  den Zeilenrechten des Schreibers gesucht).
- Reaktionen nur an Nachrichten, die man sieht und die nicht gelöscht sind (Richtlinien „Reaktionen
  lesen“, „Eigene Reaktion setzen/ändern“ neu).
- `chat_gelesen_direkt` – je Zugang und Partner „gelesen bis“. `chat_ungelesen()` zählt jetzt über
  `chat_ungelesen_von(person)` (nur Dienstschlüssel) Team und Einzelchats, ohne gelöschte.
  `chat_unterhaltungen()` – eine Zeile Team, je Einzelchat eine Zeile mit letzter Nachricht und Zahl.
- Fotos: privater Bucket **`chat-fotos`** (3 MB, JPEG/PNG/WebP). Speicher-Richtlinien „MR Chatfotos
  lesen“ (wer die Nachricht dazu sieht, und eigene Dateien), „… hochladen“ (mit S, nur in den eigenen
  Ordner), „… loeschen“ (nur eigene). Wird eine Nachricht mit Foto gelöscht oder aufgeräumt,
  merkt `chat_nachricht_nachlauf()` den Pfad in `private.chat_fotos_weg` vor (und entfernt beim Löschen
  die Reaktionen); vor einem TRUNCATE („Alle Daten löschen“) tut es `chat_fotos_vor_leeren()` für alle.
  Der Minutentakt (`app/api/push/senden` → `chatFotosAufraeumen()`) löscht die Dateien mit dem
  Dienstschlüssel und hakt sie ab (`chat_fotos_weg_liste()`, `chat_fotos_weg_erledigt()`, nur
  Dienstschlüssel). Die Liste liegt im Schema `private`, damit „Alle Daten löschen“ sie nicht vor
  den Dateien leert.
- Rücknahme `rollback/84_rollback.sql`: löscht alle Einzelchats und gelöschten Nachrichten, reine
  Fotonachrichten heißen „[Foto]“; die Dateien im Bucket bleiben und sind von Hand zu entfernen.

## Datenbank (Migration 85)

- `chat_gelesen.zugestellt_bis`, `chat_gelesen_direkt.zugestellt_bis` – „angekommen bis“ neben „gelesen
  bis“. Eine neue Zeile entsteht mit „gelesen bis“ = nie (angekommen ist nicht gelesen).
- `chat_empfangen()` (App, nur für sich selbst, schreibt nur bei Neuem), `chat_zugestellt_setzen(person,
  partner, bis)` (nur Dienstschlüssel), `chat_haken(partner)` (für den Aufrufer, mit `chat · lesen`).

## Code

| Datei | Was |
|---|---|
| `lib/chat.ts` | Karten (`bezugAuftrag` …), @-Erwähnungen, Tagestrenner, Push-Inhalt, Vorschläge für „+“; seit 84 `darfBearbeiten`, `darfLoeschen`, `chatFotoPfad`, `chatZielAus`, `chatListe`, `ungelesenAnderswo`, `listenZeit` – rein, `tests/chat.test.ts` |
| `lib/api/chat.ts` | Verlauf je Unterhaltung laden, senden (Team/Einzel, mit Foto), bearbeiten, löschen, Foto hochladen/verwerfen/Links, Lesestand (Team/Einzel), Ungelesene, Personen, Unterhaltungen |
| `lib/chatVersand.ts` | Push je Nachricht (server-only), Fotodateien aufräumen, `tests/chatVersand.test.ts` |
| `app/_seite/useChat.ts` | Zustand auf der Startseite (gewählte Unterhaltung, Anzahl), Live-Verbindung (auch Änderungen), Lesestand, Abzeichen, Fotolinks |
| `components/chat/` | Blase, Fenster, Unterhaltungsliste (`ChatListe.tsx`), Foto im Verlauf und groß (`ChatFoto.tsx`), `tests/chatFenster.test.tsx` |
| `app/page.tsx` | `chatBezugOeffnen()`, „In den Chat“ an Auftrag, Kunde, Lager; `?chat=1` bzw. `?chat=<Kennung>` in `zielOeffnen()` |

## Datenschutz

Was im Chat steht, steht auch auf dem Sperrbildschirm der Kollegen (gekürzt auf 140 Zeichen). Die
Karte selbst zeigt bewusst wenig: Name und Ort, keine Straße, keine Telefonnummer – sie ist für
jeden mit Leserecht sichtbar, auch für Rollen, die den Kunden selbst nicht öffnen dürfen.
Besondere Kategorien (Art. 9 DSGVO) gehören nicht in den Chat – auch nicht in einen Einzelchat und
nicht als Foto (Krankmeldung, Attest). Die Aufbewahrung von 12 Monaten ist mit dem Datenschutz
abzustimmen; sie gilt für Einzelchats und Fotos genauso.

Lesebestätigungen (Haken, Migration 85) sind eine Information darüber, wann Beschäftigte etwas
gelesen haben. Deshalb zeigen sie nur „alle haben gelesen“ bzw. im Einzelchat „die Person hat gelesen“,
keine Uhrzeiten und keine Namen. Vor dem Einsatz kurz mit Datenschutz bzw. Betriebsrat abstimmen.

Einzelchats (Migration 84) sind private Nachrichten zwischen zwei Beschäftigten: Die Rechte lassen
**niemanden** sonst mitlesen, auch keinen Admin. Ausnahmen, die man kennen muss: Die „Sicherung aller
Daten“ des Superadmins (Migration 72) enthält alle Tabellen, also auch die Einzelchats; und wer die
Datenbank direkt (SQL-Editor, Dienstschlüssel) öffnet, sieht alles. Eine Auswertung von Einzelchats ist
nicht vorgesehen und wäre vorher mit Datenschutz und Betriebsrat abzustimmen. Fotos von Kunden oder
Kennzeichen sind personenbezogene Daten – nur, was für die Arbeit nötig ist.
