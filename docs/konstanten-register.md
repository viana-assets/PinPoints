# Konstanten-Register

**Stand: 18.09.2026.** Vollständig neu erstellt aus dem Code (nicht aus der Vorfassung
übernommen) – siehe „Was geprüft wurde" unten.

**Regel:** Bei jeder neuen exportierten Konstante in `lib/` wird hier eine Zeile ergänzt –
Name, Datei, Typ/Form, Bedeutung, Verwendung. Beim Löschen oder Umbenennen einer Konstante wird
die Zeile hier im selben Zug angepasst, nicht erst beim nächsten Aufräumen. Eine Konstante, die
nirgends mehr verwendet wird, bleibt trotzdem eingetragen und wird als „aktuell ungenutzt"
markiert – Löschen aus dem Code ist eine eigene, bewusste Entscheidung, kein Nebeneffekt einer
Dokumentationspflege.

## Umfang dieser Fassung

Erfasst sind **alle exportierten Konstanten aus `lib/`** (jede Fundstelle von `^export const`
in `lib/**/*.ts`, plus die vollständige Durchsicht von `lib/constants.ts`). Nicht erfasst sind
Konstanten, die lokal in `app/page.tsx` oder in einzelnen Komponenten stehen und nicht
exportiert werden (z. B. `MAX_MARKER`, `LISTEN_SCHRITT`, `MARKER_FARBE` in `app/page.tsx`;
`AUSGANG_TEXT`, `TIPPPAUSE_MS`, `QR_PIXEL`, `TAKT_MS` u. a. in einzelnen Komponenten) – das sind
bewusst modul-lokale Werte ohne zweite Verwendungsstelle, siehe Kommentar am Kopf von
`lib/constants.ts`. Wer eine davon ein zweites Mal braucht, zentralisiert sie in `lib/` und
trägt sie dann hier ein.

Insgesamt **73 exportierte Konstanten** in 13 Dateien unter `lib/` (Stand dieser Ergänzung:
21.09.2026, nur die neue Datei `lib/etikettBild.ts` nachgetragen – siehe „Korrekturen" unten für
eine weitere, unabhängig davon im Code gefundene Abweichung).

---

## Rechte (Rollen & Berechtigungen)

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `ROLE_LABEL` | `lib/constants.ts` | `Record<Role, string>` | Anzeigename je Rolle (Superadmin/Admin/Techniker/Nutzer) | `PermissionMatrix`, `AdminPanel`, `app/admin/users/page.tsx`; Grundlage von `ALL_ROLES` |
| `ALL_ROLES` | `lib/constants.ts` | `Role[]` (aus `ROLE_LABEL` abgeleitet) | Alle existierenden Rollen, ohne zweite Aufzählung | `app/api/invite/route.ts` (`ASSIGNABLE_ROLES`) |
| `VERBEN` | `lib/constants.ts` | `Verb[]` | Die drei Rechte-Verben: lesen/schreiben/löschen (seit 17.09.2026) | `PermissionMatrix`, `tests/navigation.test.ts`, `tests/rechte.test.ts` |
| `VERB_LABEL` | `lib/constants.ts` | `Record<Verb, string>` | Beschriftung der drei Verben | `PermissionMatrix` |
| `RECHTE_KATALOG` | `lib/constants.ts` | `RechtBereich[]` | Vollständiger Katalog aller Rechte-Bereiche (Module + eingerückte Unterbereiche) mit Verben, Erklärung, Sperrung | `PermissionMatrix`, `app/page.tsx` (Warnung bei unbekanntem Bereich), `tests/navigation.test.ts`, `tests/rechte.test.ts` |
| `RECHTE_VORGABE` | `lib/constants.ts` | `Record<string, Partial<Record<Verb, Role[]>>>` | Fallback-Rechte, solange in der Datenbank keine Zeile für einen Bereich steht | `PermissionMatrix`, `app/page.tsx` (`hasPermission`/`canView`), `tests/navigation.test.ts`, `tests/rechte.test.ts` |
| `PERMISSION_ROLES` | `lib/constants.ts` | `Role[]` | Die drei in der Rechte-Matrix konfigurierbaren Rollen (ohne Superadmin, der darf immer alles) | `PermissionMatrix` |

**Wichtig:** Dies ersetzt vollständig das alte Modell mit `PERMISSION_CATALOG` /
`PERMISSION_DEFAULTS` (`view.*`/`action.*`-Schlüssel) – siehe „Korrekturen" unten.

---

## Module & Navigation

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `MODULE` | `lib/module.ts` | `ModulEintrag[]` | Alle Module/Reiter der App: Label, Beschreibung, Icon, Sichtbarkeitsschlüssel, Reihenfolge, primär/sekundär | `app/page.tsx` (Seitenleiste Desktop + Kachelseite „Weitere" am Handy), `tests/navigation.test.ts` |
| `SEKUNDAERE_TABS` | `lib/module.ts` | `TabKey[]` (aus `MODULE` abgeleitet) | Welche Reiter am Handy hinter „Weitere" stecken | `app/page.tsx`, `tests/navigation.test.ts` |

---

## Aufträge & Status

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `ORDER_STATUS_LABEL` | `lib/constants.ts` | `Record<OrderStatus, string>` | Anzeigename je Auftragsstatus (Offen/In Arbeit/Erledigt/Storniert) | `AuftraegePanel`, `AuftragModal`, `CustomerOrderRow`, `Stundenraster`, `EinsatzplanungPanel`, `app/page.tsx` |
| `ORDER_STATUS_FARBE` | `lib/constants.ts` | `Record<OrderStatus, string>` | Farbklasse des Status-Badges | dieselben Stellen wie `ORDER_STATUS_LABEL` |
| `ABGESCHLOSSENE_ZUSTAENDE` | `lib/constants.ts` | `OrderStatus[]` | Zustände (`erledigt`, `storniert`), in denen die Auftragspositionen eingefroren sind | **nur intern** – wird ausschließlich von `istAbgeschlossen()` gelesen; diese Funktion wiederum nutzt `CustomerOrderRow` |
| `AUFTRAGSFENSTER_LABEL` | `lib/api/orders.ts` | `Record<AuftragsFenster, string>` | Beschriftung des geladenen Zeitraums (Aktuell/Dieses Jahr/Alle) | `app/page.tsx` (Fensterschalter) |

---

## Termine & Kalender

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `TERMIN_FILTER` | `lib/constants.ts` | `{ wert: TerminFilter; text: string }[]` | Zeitraum-Filter im Termine-Reiter (Heute/Morgen/7 Tage/Anstehend/Alle) | `app/page.tsx` |
| `KUNDE_PARAMETER` | `lib/constants.ts` | `string` ("kunde") | Aufrufparameter, mit dem eine Benachrichtigung/ein Link direkt den Kunden öffnet | `app/page.tsx` (Aufruf-Auswertung) |
| `AUFTRAG_PARAMETER` | `lib/constants.ts` | `string` ("auftrag") | Aufrufparameter für einen bestimmten Auftrag/Termin | `app/page.tsx`, `app/api/push/senden/route.ts` |
| `VORLAUF_MINUTEN` | `lib/constants.ts` | `number` (5) | Vorlauf der Terminerinnerung in Minuten | `app/api/push/senden/route.ts`, `tests/terminerinnerung.test.ts` |
| `ZEITZONE` | `lib/constants.ts` | `string` ("Europe/Berlin") | Zeitzone, in der Auftragsuhrzeiten gemeint sind (Server läuft in UTC) | `app/api/push/senden/route.ts` |
| `STANDARD_DAUER_MIN` | `lib/constants.ts` | `number` (30) | Rückfall-Termindauer, solange die Betriebseinstellung (`betrieb.termin_intervall_min`) noch nicht geladen ist | `AuftragModal`, `app/page.tsx` |
| `TERMIN_INTERVALLE` | `lib/constants.ts` | `number[]` | Auswahlliste der Terminraster-Schritte im Adminbereich | `AdminPanel` |
| `KALENDER_VON_STUNDE` | `lib/constants.ts` | `number` (7) | Start des Grundfensters der Tages-/Wochenansicht | `Stundenraster` |
| `KALENDER_BIS_STUNDE` | `lib/constants.ts` | `number` (19) | Ende des Grundfensters der Tages-/Wochenansicht | `Stundenraster` |

---

## Kunden & Zustand

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `KUNDEN_FILTER` | `lib/constants.ts` | `{ wert: KundenFilter; text: string }[]` | Die sechs Filter über der Kundenliste, mit Reihenfolge und Beschriftung | `app/page.tsx` (Filterleiste, Trefferzahlen) |
| `KUNDEN_ZUSTAND_LABEL` | `lib/helpers.ts` | `Record<KundenZustand, string>` | Beschriftung der fünf Kundenzustände (kontaktiert/Termin/Wiedervorlage/offen/kein Interesse) | `DetailModal`, `app/page.tsx` (Karten-Popup, Kundenliste) |
| `KUNDEN_ZUSTAND_REIHENFOLGE` | `lib/helpers.ts` | `readonly KundenZustand[]` | Reihenfolge der Zustände in Legenden/Auswahlen, nach Dringlichkeit sortiert | `app/page.tsx` (Zustandsfilter auf der Karte) |

---

## Lager: Saison & Räder

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `SAISON_LABEL` | `lib/constants.ts` | `Record<Saison, string>` | Beschriftung der drei Saisonwerte (Sommer/Winter/Ganzjahr) | `ReifensatzEtikett`, `SaisonPanel`, `LagerPanel`, `EinlagerungBlock`, `AuftragModal`, `VehicleSection` |
| `SAISON_LISTE` | `lib/constants.ts` | `Saison[]` | Die drei Saisonwerte als Liste (für Auswahlknöpfe) | `SaisonPanel`, `LagerPanel`, `EinlagerungBlock` |
| `RAD_POSITIONEN` | `lib/constants.ts` | `RadPosition[]` | Die vier Radpositionen (VL/VR/HL/HR) in Anzeigereihenfolge | `ReifensatzEtikett`, `RadBild` |
| `RAD_POSITION_LABEL` | `lib/constants.ts` | `Record<RadPosition, string>` | Ausgeschriebene Beschriftung der Radpositionen | `ReifensatzEtikett`, `RadBild` |
| `FELGE_LABEL` | `lib/constants.ts` | `Record<Felge, string>` | Beschriftung der Felgenart (Stahl/Alu/keine) | `RadBild` |
| `FELGEN` | `lib/constants.ts` | `Felge[]` | Die drei Felgenarten als Liste | `RadBild` |
| `GEO_GENAUIGKEIT_LABEL` | `lib/constants.ts` | `Record<GeoGenauigkeit, string>` | Beschriftung der Kartenpositions-Genauigkeit (exakt/ungefähr/von Hand) | **AKTUELL UNGENUTZT** – nirgends importiert (siehe unten) |
| `PROFIL_GESETZLICH_MM` | `lib/constants.ts` | `number` (1,6) | Gesetzliches Minimum der Profiltiefe | `ProfilMarke`, `RadBild` |
| `PROFIL_KRITISCH_MM` | `lib/constants.ts` | `number` (3) | Schwelle „kritisch" | `SaisonPanel`, `ProfilMarke`, `LagerPanel`, `RadBild`, `AuftragModal`, `app/page.tsx`, `tests/regalwand.test.ts`, `tests/profiltiefe.test.ts` |
| `PROFIL_HINWEIS_MM` | `lib/constants.ts` | `number` (4) | Schwelle „Hinweis" | `ProfilMarke`, `RadBild`, `tests/profiltiefe.test.ts` |
| `DOT_ALT_JAHRE` | `lib/constants.ts` | `number` (6) | Reifenalter (Jahre), ab dem der Kunde angesprochen werden soll | `LagerPanel`, `AuftragModal`, `tests/regalwand.test.ts` |
| `LAGERDAUER_HINWEIS_TAGE` | `lib/constants.ts` | `number` (365) | Tage ohne Bewegung, ab denen ein Hinweis erscheint | `LagerPanel`, `AuftragModal`, `tests/regalwand.test.ts` |
| `REGAL_LISTE_BREITE_PX` | `lib/constants.ts` | `number` (700) | Fensterbreite, ab der die Regalwand zur Reihenliste wird | `LagerPanel` – dieselbe Zahl steht zusätzlich hart in `app/globals.css` (dort per Kommentar auf hier verwiesen, weil CSS keine TS-Konstante lesen kann) |
| `LANGLIEGER_MONATE` | `lib/helpers.ts` | `number` (18) | Monate, ab denen ein Satz als „Langlieger" gilt | **nur intern** – über `istLanglieger()` (`AuslagernDialog`, `tests/lagerdauer.test.ts`) |
| `LANGLIEGER_EURO` | `lib/helpers.ts` | `number` (150) | Summenschwelle, ab der ein Satz als „Langlieger" gilt | dito, über `istLanglieger()` |

---

## Rechnung & Preise

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `EINHEITEN` | `lib/constants.ts` | `string[]` | Vorschlagsliste der Einheiten im Artikelstamm (Feld bleibt frei beschreibbar) | `ArticleDetailEditor` |
| `LOGO_MAX_BYTES` | `lib/constants.ts` | `number` (200 × 1024) | Höchstgröße des Logos als `data:`-URI in der Datenbankzeile | `BetriebsdatenPanel` |
| `LOGO_TYPEN` | `lib/constants.ts` | `string[]` | Erlaubte MIME-Typen für den Logo-Upload | `BetriebsdatenPanel` |
| `RECHNUNG_SEITE_CSS` | `lib/constants.ts` | `string` (`@page`-Regel) | Seitenformat und Ränder (DIN 5008) der gedruckten Rechnung | `RechnungModal`, `RechnungenPanel` |
| `DEFAULT_VAT_RATE` | `lib/helpers.ts` | `number` (19) | Standard-MwSt.-Satz, Vorbelegung und Fallback | `ArticleDetailEditor`, `lib/api/articles.ts`, `tests/preislogik.test.ts` |
| `OFFENES_ENDE` | `lib/helpers.ts` | `string` ("9999-12-31") | Ersatzwert für „bis auf Weiteres" (`valid_to = null`) beim Kollisionsvergleich | **nur intern** – über `preisZeitraumKollision()` (`lib/api/articles.ts`, `tests/preislogik.test.ts`) |
| `CENT` | `lib/rechnung.ts` | `number` (100) | Rundungsbasis für Geldbeträge (kaufmännisch auf den Cent) | **nur intern** – über `aufCent()`, das in praktisch jeder Rechnungsberechnung steht |
| `NACHLASS_BEZEICHNUNG` | `lib/rechnung.ts` | `string` ("Nachlass") | Positionsbezeichnung der eigenen Nachlasszeile, wenn ein Sonderpreis sich nicht glatt auf die Menge verteilt | intern in `positionenAusAuftrag()`; direkt geprüft in `tests/rechnungsbeleg.test.ts` |
| `GIROCODE_KENNUNG` | `lib/rechnung.ts` | `string` ("BCD") | EPC-QR-Kennung, erste Zeile des Girocodes | `girocodeText()`, direkt geprüft in `tests/rechnungsbeleg.test.ts` |
| `GIROCODE_FASSUNG` | `lib/rechnung.ts` | `string` ("002") | EPC-QR-Fassung (BIC darf entfallen) | **nur intern** – `girocodeText()` |
| `GIROCODE_NAME_MAX` | `lib/rechnung.ts` | `number` (70) | Zeichenlimit für den Empfängernamen im Girocode | **nur intern** – `girocodeText()` |
| `GIROCODE_ZWECK_MAX` | `lib/rechnung.ts` | `number` (140) | Zeichenlimit für den Verwendungszweck im Girocode | **nur intern** – `girocodeText()` |

---

## Protokoll (Audit-Log)

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `PROTOKOLL_TABELLE_LABEL` | `lib/constants.ts` | `Record<string, string>` | Tabellenname (wie in der DB) → Klartext | `ProtokollPanel`, `AuftragProtokoll` |
| `PROTOKOLL_FELD_LABEL` | `lib/constants.ts` | `Record<string, string>` | Spaltenname → Klartext; enthält bewusst auch längst gelöschte Spalten (Historie bleibt lesbar) | `ProtokollPanel`, `tests/protokoll.test.ts` |
| `PROTOKOLL_TAGE_STANDARD` | `lib/constants.ts` | `number` (90) | Standard-Rückreichweite des Protokollfilters im Adminbereich | `ProtokollPanel`, `AdminPanel` |
| `PROTOKOLL_AKTION_LABEL` | `lib/helpers.ts` | `Record<string, string>` | INSERT/UPDATE/DELETE → „angelegt"/„geändert"/„gelöscht" | `ProtokollPanel` |
| `IST_KENNUNG` | `lib/helpers.ts` | `RegExp` | Erkennt eine UUID in einem Protokollwert (zum Kürzen/Nachschlagen) | **nur intern** – `protokollWert()` |
| `PROTOKOLL_SEITE` | `lib/api/audit.ts` | `number` (200) | Höchstzahl der auf einmal geladenen Protokolleinträge | **nur intern** – `fetchProtokoll()` |

---

## Karte & Design

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `DEFAULT_MAP_CENTER` | `lib/mapStyles.ts` | `[number, number]` | Kartenmittelpunkt beim ersten Laden (Nürnberg-Region) | `app/page.tsx` (Karten-Init), `app/api/adresse-suchen/route.ts` |
| `DEFAULT_MAP_ZOOM` | `lib/mapStyles.ts` | `number` (12) | Zoomstufe beim ersten Laden | `app/page.tsx` |
| `MAP_STYLES` | `lib/mapStyles.ts` | `Record<MapStyleKey, {...}>` | Die drei verfügbaren Kartenstile (Straße/Satellit/Satellit+Beschriftung) | `app/page.tsx` (Kartenstil-Schalter, zusammen mit lokalem `STYLE_ORDER` dort) |
| `EMP_COLORS` | `lib/constants.ts` | `string[]` | Farbpalette für Mitarbeiter-Punkte im Kalender | `lib/calendar.ts` (`employeeColorFor()`), darüber `Stundenraster`, `EinsatzplanungPanel` |

---

## QR-Aufkleber & Benachrichtigungen

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `LAGERPLATZ_PARAMETER` | `lib/aufkleberCode.ts` | `string` ("lagerplatz") | Aufrufparameter des Regal-Aufklebers | `app/page.tsx`, `lagerplatzUrl()`/`lagerplatzIdAusCode()`, `LagerplatzAufkleber`, `EinlagerungBlock` |
| `SATZ_PARAMETER` | `lib/aufkleberCode.ts` | `string` ("satz") | Aufrufparameter des Reifensatz-Aufklebers (seit 17.09.2026) | `app/page.tsx`, `satzUrl()`/`satzIdAusCode()`, `ReifensatzEtikett`, `EinlagerungBlock` |
| `ZIEL_SPEICHER` | `lib/benachrichtigungZiel.ts` | `string` ("pinpoints-ziel") | Name des Cache-Storage-Bereichs für das Benachrichtigungsziel | **nur intern**; muss wortgleich in `public/sw.js` gepflegt werden (Service Worker kann dieses Modul nicht importieren) |
| `ZIEL_SCHLUESSEL` | `lib/benachrichtigungZiel.ts` | `string` | Schlüssel des abgelegten Navigationsziels | **nur intern**, über `zielAbholen()` (`app/page.tsx`); dito wortgleich in `public/sw.js` |
| `PROTOKOLL_SCHLUESSEL` | `lib/benachrichtigungZiel.ts` | `string` | Schlüssel für „zuletzt angetippt" (Diagnose auf iPhones ohne Konsole) | **nur intern**, über `letztesAntippen()` (`PushEinstellung`); dito wortgleich in `public/sw.js` |

---

## Etikett als Bild (21.09.2026)

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `PX_PRO_MM` | `lib/etikettBild.ts` | `number` (8) | Bildpunkte je Millimeter (203 dpi, die Auflösung der Etikettendrucker) für das per „Als Bild teilen" erzeugte Etikett-PNG | `mmZuPx()` – `ReifensatzEtikett`, `tests/etikettbild.test.ts` |

**Nicht aufgenommen, bewusst:** `ETIKETT_FORMATE` (die Liste der Rollenformate inkl. des neuen
Eintrags 50 × 80 mm) liegt nicht in `lib/`, sondern als `export const` direkt in
`components/lager/ReifensatzEtikett.tsx` – außerhalb des oben festgelegten Umfangs dieses
Registers, ebenso wie `QR_PIXEL` in derselben Datei (siehe „Umfang dieser Fassung"). Die übrigen
Maß-Konstanten in `lib/etikettBild.ts` (`RAND_MM`, `SPALT_MM`, `SCHRIFT_KOPF_MM`,
`SCHRIFT_ZEILE_MM`, `SCHRIFT_GROSS_MM`, `ZEILENHOEHE`, `SCHRIFT`) sind ebenfalls nicht erfasst,
weil sie im Code **nicht exportiert** sind (`const`, kein `export const`) – geprüft per
`grep -n "^export const\|^const" lib/etikettBild.ts`. Nur `PX_PRO_MM` trägt tatsächlich
`export`.

---

## App-Erscheinung (Sichtschutz)

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `GETARNT` | `lib/erscheinung.ts` | `boolean` (aktuell `true`) | Schalter: Tarn-Icon „Settings" statt echtem PinPoints-Symbol auf dem Homescreen (seit 18.09.2026) | **nur intern**, steuert `ERSCHEINUNG`; wird von Hand umgestellt, nicht programmatisch importiert |
| `ERSCHEINUNG` | `lib/erscheinung.ts` | `Erscheinung` (Objekt: Name, Icons, Beschreibung) | Der aktive Name-/Icon-Satz, abhängig von `GETARNT` | `app/manifest.ts`, `app/layout.tsx` |

---

## Datenzugriff & Adressen

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `PAGE_SIZE` | `lib/api/client.ts` | `number` (1000) | Seitengröße beim Nachladen ganzer Tabellen (PostgREST-Standardgrenze) | **nur intern** in `fetchPaged()` – darüber aber Basis aller `fetchX()`-Funktionen im ganzen `lib/api/`-Ordner |
| `qk` | `lib/queries/keys.ts` | Objekt aus Schlüssel-Funktionen | Alle Query-Schlüssel des Zwischenspeichers (TanStack Query) – ausschließlich hier gebildet | `lib/queries/hooks.ts` (alle Hooks), `app/page.tsx` (`neuLaden()`/`refreshX()`, rund 20 Stellen) |
| `DEFAULT_GEOCODE_REGION` | `lib/helpers.ts` | `string` ("Nürnberg, Deutschland") | Region, die an eine Adresse ohne erkennbaren Ort angehängt wird | **nur intern**, über `geocodeAnfrage()`/`geocodeAddress()` |

---

## Aktuell ungenutzt

| Konstante | Datei | Befund |
|---|---|---|
| `GEO_GENAUIGKEIT_LABEL` | `lib/constants.ts` | Vollständig definiert (`Record<GeoGenauigkeit, string>` mit den drei Werten „exakt"/„ungefähr"/„hand"), aber **nirgends im Code importiert oder gelesen** – auch nicht dort, wo `geo_genauigkeit` tatsächlich verarbeitet wird (`lib/helpers.ts`, `navigationUrls()`). Kandidat für Nachtrag an der eigentlich vorgesehenen Anzeigestelle oder für Entfernen. |

Alle anderen als „nur intern" markierten Konstanten (siehe Spalte „Verwendet in" oben, z. B.
`CENT`, `OFFENES_ENDE`, `GIROCODE_FASSUNG`, `PAGE_SIZE`, `GETARNT`) sind **keine** ungenutzten
Konstanten – sie werden aktiv von einer exportierten Funktion derselben Datei gelesen, die
ihrerseits von anderer Stelle aufgerufen wird. Sie tauchen nur nicht als eigener Import an
fremder Stelle auf.

---

## Korrekturen gegenüber der vorherigen Fassung

Diese Fassung wurde komplett neu aus dem Code erstellt, nicht redigiert. Zwei Abweichungen zur
vorherigen Fassung sind der Erwähnung wert, weil sie nicht nur Nachträge, sondern Richtigstellungen
sind:

1. **`PERMISSION_CATALOG` / `PERMISSION_DEFAULTS` existieren nicht mehr.** Die vorherige Fassung
   führte diese beiden Namen als „bereits sauber zentral" mit der Beschreibung „`view.*`/`action.*`-
   Berechtigungsschlüssel". Die Rechte-Verwaltung wurde am 17.09.2026 grundlegend umgebaut (siehe
   Kommentar in `lib/constants.ts`, Abschnitt „Rechte"): Es gibt jetzt **drei** Verben
   (`lesen`/`schreiben`/`loeschen`) statt eines `view`/`action`-Schemas, und die Konstanten heißen
   `RECHTE_KATALOG` und `RECHTE_VORGABE` (dazu neu: `VERBEN`, `VERB_LABEL`, Typ `RechtBereich`). Wer
   im Code noch nach `PERMISSION_CATALOG` sucht, findet nichts.
2. **Falsche Datei-Angabe für die Aufkleber-Logik.** Die vorherige Fassung nannte
   `lib/lagerplatzCode.ts` als Fundort von `LAGERPLATZ_PARAMETER`, `lagerplatzUrl()` und
   `lagerplatzIdAusCode()`. Die Datei heißt tatsächlich **`lib/aufkleberCode.ts`** – sie enthält
   seit dem 17.09.2026 zusätzlich die Logik für den Reifensatz-Aufkleber (`SATZ_PARAMETER`,
   `satzUrl()`, `satzIdAusCode()`), was zum allgemeineren Dateinamen führte. (Der alte
   Dateiname ist inzwischen auch in `docs/lager.md` und im Testdateinamen
   `tests/aufkleberCode.test.ts` korrigiert.)
3. **Beim Nachtragen von `PX_PRO_MM` (21.09.2026) fiel eine weitere, unabhängige Lücke auf:**
   `lib/calendar.ts` exportiert seit demselben Tag zusätzlich `toDateStr` (Alias auf
   `datumStr`, siehe Kopfkommentar dort) – nicht Teil dieser Ergänzung und hier nicht
   nachgetragen, weil außerhalb des Auftrags, der zu dieser Fassung geführt hat. Die Zahl „73
   Konstanten in 13 Dateien" oben zählt `toDateStr` deshalb noch **nicht** mit; vollständig
   wäre 74 in 14 Dateien.

## Was geprüft wurde

- `lib/constants.ts` vollständig gelesen (41 exportierte Konstanten).
- Alle weiteren Dateien unter `lib/` per `grep -rn "^export const" lib/` gefunden und einzeln
  gelesen: `lib/api/audit.ts`, `lib/api/client.ts`, `lib/api/orders.ts`, `lib/aufkleberCode.ts`,
  `lib/benachrichtigungZiel.ts`, `lib/erscheinung.ts`, `lib/helpers.ts`, `lib/mapStyles.ts`,
  `lib/module.ts`, `lib/queries/keys.ts`, `lib/rechnung.ts` (31 weitere exportierte Konstanten).
- `lib/types.ts` enthält keine exportierten Konstanten, nur Typen – nicht erfasst (wie
  angefordert).
- Für jede der 72 Konstanten wurde mit `grep -rn` nach jeder Verwendung im gesamten Projekt
  gesucht (außer `node_modules`, `.next`, `docs/`).
