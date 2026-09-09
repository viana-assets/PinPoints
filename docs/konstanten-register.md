# Konstanten-Register

Register aller festen Wertelisten der App: wo sie als benannte Konstante definiert sind,
und wo sie verwendet werden. Regel siehe `README.md`. Bei jeder neuen Konstante hier
eintragen; bei jedem Fund einer noch nicht zentralisierten Werteliste hier als "noch offen"
vermerken und in `roadmap.md` referenzieren.

## Bereits sauber zentral (Vorbild für neue Konstanten)

| Konstante | Datei | Bedeutung | Verwendet in |
|---|---|---|---|
| `ROLE_LABEL` | `lib/constants.ts` | Anzeigename je Rolle (Superadmin/Admin/Techniker/Nutzer) | Nutzerverwaltung (`AdminPanel`, `app/admin/users/page.tsx`), Modulverwaltung |
| `ALL_ROLES` | `lib/constants.ts` | Alle existierenden Rollen, abgeleitet aus `ROLE_LABEL` | Einladungsroute `app/api/invite/route.ts` |
| `PERMISSION_CATALOG` / `PERMISSION_DEFAULTS` / `PERMISSION_ROLES` | `lib/constants.ts` | Vollständige Liste aller Berechtigungs-Schlüssel (`view.*`/`action.*`) + Fallback-Rollen + konfigurierbare Rollen | `hasPermission()`/`canView()`, `PermissionMatrix`, Nav-Punkte, Dashboard-/"Weitere"-Kacheln – **und seit Migration 16 die Datenbank selbst**, siehe `berechtigungen-und-rollen.md` |
| `MAP_STYLES` / `STYLE_ORDER` | `lib/mapStyles.ts` / `app/page.tsx` | Verfügbare Kartenstile (Straße/Satellit/Satellit+Beschriftung) | Kartenstil-Schalter auf der Karte |
| `EMP_COLORS` | `lib/constants.ts` (Helfer `employeeColorFor()` in `lib/calendar.ts`) | Farbpalette für Mitarbeiter-Punkte im Kalender | `EinsatzplanungPanel` |
| `articles` / `article_prices` (DB-Tabellen, kein Client-Konstante) | Supabase, Migration 12 | Artikelstammdaten sind bewusst NICHT im Code hinterlegt, sondern Datenbank-Zeilen – die Tabelle selbst ist die Single Source of Truth | `ArticleAdminPanel`, `ArticleAssignPanel`, `currentArticlePrice()` |
| `ORDER_STATUS_LABEL` | `lib/constants.ts` | Anzeigename je Auftragsstatus (Offen/In Arbeit/Erledigt/Storniert) | `CustomerOrderRow`, `AuftraegePanel`, `EinsatzplanungPanel`, `AuftragModal` |
| `ORDER_STATUS_FARBE` | `lib/constants.ts` | Farbklasse des Status-Kennzeichens je Zustand | überall dort, wo ein `.badge` für einen Auftrag gezeichnet wird – vorher stand die Zuordnung als verschachtelter Bedingungsausdruck an drei Stellen |
| `ABGESCHLOSSENE_ZUSTAENDE` / `istAbgeschlossen()` | `lib/constants.ts` | Zustände, in denen die Positionen eingefroren sind | `AuftragModal`, `CustomerOrderRow`, `ArticleAssignPanel` – dieselbe Regel erzwingt zusätzlich ein Trigger (Migration 20) |
| `terminTitel()` | `lib/helpers.ts` | Standardtitel eines Termins („Termin – ‹Kunde›") | `OrderModal`, `AddOrderInline`, `addOrder()`/`markContacted()` in `app/page.tsx` |
| `DEFAULT_VAT_RATE` | `lib/helpers.ts` | Standard-MwSt.-Satz (19%), Vorbelegung + Fallback | `ArticleDetailEditor`, `addOrderArticle()` |
| `DEFAULT_GEOCODE_REGION` | `lib/helpers.ts` | An Adressen ohne erkennbaren Stadtnamen angehängte Region für die Geokodierung | `geocodeAddress()` |
| `DEFAULT_MAP_CENTER` / `DEFAULT_MAP_ZOOM` | `lib/mapStyles.ts` | Kartenmittelpunkt/Zoom beim ersten Laden | Karten-Init-Effekt in `app/page.tsx` |
| `PAGE_SIZE` | `lib/api/client.ts` | Seitengröße beim Nachladen ganzer Tabellen (PostgREST liefert höchstens so viele Zeilen pro Anfrage) | `fetchPaged()`, von allen `fetchX()` genutzt |
| `qk` | `lib/queries/keys.ts` | **Alle Query-Schlüssel** des Zwischenspeichers – gebildet ausschließlich hier, nie als Zeichenketten-Array an zweiter Stelle | `lib/queries/hooks.ts`, `neuLaden()`/`refreshX()` in `app/page.tsx` |
| `AUFTRAGSFENSTER_LABEL` / `fensterStartdatum()` | `lib/api/orders.ts` | Auswahl und Startdatum des geladenen Auftrags-Zeitraums | `FensterSchalter` in `app/page.tsx`, `fetchOrders()` |
| `FRISCH_MS` | `lib/queries/hooks.ts` | Wie lange ein geladener Bestand als frisch gilt | alle Hooks dort |
| `MAX_MARKER` | `app/page.tsx` | Höchstzahl gleichzeitig gezeichneter Kartenmarker | `syncMarkers()` |
| `LISTEN_SCHRITT` | `app/page.tsx` | Wie viele Kundenzeilen auf einmal gezeichnet werden | Kundenliste, „Weitere anzeigen" |
| `KUNDEN_FILTER` / `KundenFilter` | `lib/constants.ts` | Die sechs Filter über der Kundenliste: Reihenfolge, Beschriftung, Schlüssel | Filterleiste und Trefferzahlen in `app/page.tsx` |
| `KUNDEN_ZUSTAND_LABEL` / `KundenZustand` | `lib/helpers.ts` | Die vier Zustände eines Kunden (kontaktiert / Wiedervorlage / offen / kein Interesse) und ihre Beschriftung – damit Karte, Liste und Kundenfenster nicht drei Wörter für dasselbe benutzen | `effectiveColor()`, Karten-Popup, `DetailModal`, Kundenliste |
| `KUNDEN_ZUSTAND_REIHENFOLGE` | `lib/helpers.ts` | Reihenfolge der vier Zustände in Legenden und Auswahlen – nach Dringlichkeit (offen, Wiedervorlage, kontaktiert, kein Interesse), damit sie überall gleich sortiert erscheinen | Zustandsfilter auf der Karte in `app/page.tsx` |
| `MARKER_FARBE` | `app/page.tsx` | Farben der Kartenmarker je Zustand. Steht dort und nicht im CSS, weil der Marker als HTML-Zeichenkette in einem Leaflet-divIcon entsteht – dort greift kein Stylesheet | `makeIcon()` |
| `AUSGANG_TEXT` | `components/kunden/KontaktModal.tsx` | Titel und Erklärung der drei Kontakt-Ausgänge | Kontaktdialog |
| `TIPPPAUSE_MS` / `MIN_ZEICHEN` | `components/AdressFeld.tsx` | Wartezeit nach dem letzten Tastendruck und Mindestlänge vor einer Adressabfrage | Adressfeld mit Vorschlägen |
| `MIN_ABSTAND_MS` / `MIN_LAENGE` / `MAX_LAENGE` / `MAX_TREFFER` | `app/api/adresse-suchen/route.ts` | Drosselung und Grenzen der Vorschlagsroute – je Route eigene Werte, weil Nominatim und Photon unterschiedliche Vorgaben haben | Vorschlagsroute |
| `LAGERPLATZ_PARAMETER` / `lagerplatzUrl()` / `lagerplatzIdAusCode()` | `lib/lagerplatzCode.ts` | Aufbau und Auswertung des QR-Aufklebers am Lagerplatz – Erzeugen und Zurücklesen an EINER Stelle, damit Aufkleber und Scanner nicht auseinanderlaufen | `LagerplatzAufkleber`, `EinlagerungBlock`, Aufruf-Auswertung in `app/page.tsx` |
| `QR_PIXEL` | `components/lager/LagerplatzAufkleber.tsx` | Kantenlänge des erzeugten QR-Bildes | Aufkleber-Druckbogen |
| `TAKT_MS` | `components/QrScanner.tsx` | Wie oft ein Kamerabild ausgewertet wird | Kamera-Scanner |
| `MARKE_FAVICON` | `components/icons.tsx` | Favicon als `data:`-URI (grüner Zielpunkt mit Haken) – die einzige Stelle, an der die Marke nachgebaut statt aus der Logodatei übernommen ist, weil ein `data:`-URI keine Verläufe aus dem React-Baum beziehen kann | `app/layout.tsx` |
| Logofarben und -pfade | `components/icons.tsx`, Komponente `IconMarke` | Bildmarke des Firmenlogos, unverändert aus `Logos/viana-pinpoints-logo-editable.svg` – bewusst KEINE eigenen Farbkonstanten: die Werte gehören dem Logo, nicht dem Designsystem, und werden nirgends sonst verwendet | Seitenleiste, Handy-Kopfzeile, Login, Passwort setzen |

Die Fundorte oben waren bis zur Sanierung teils veraltet (sie nannten `app/page.tsx`, obwohl
die Konstanten seit Phase 1 in `lib/constants.ts` liegen) – korrigiert am 28.08.2026.

## Noch nicht zentral – bekannte Fundstellen (siehe `roadmap.md`, Phase 1)

Aktuell keine offenen Einträge. Bei jedem Fund einer neuen, noch nicht zentralisierten
Werteliste hier eintragen und in `roadmap.md` referenzieren.
