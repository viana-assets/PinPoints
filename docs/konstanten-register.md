# Konstanten-Register

**Stand: 02.10.2026** (gegen den Code abgeglichen: jede `export const` unter `lib/` ist
eingetragen). Erstfassung 18.09.2026, vollständig aus dem Code erstellt – siehe „Was geprüft
wurde" unten.

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
exportiert werden (z. B. `MAX_MARKER`, `LISTEN_SCHRITT` in `app/page.tsx`;
`AUSGANG_TEXT`, `TIPPPAUSE_MS`, `QR_PIXEL`, `TAKT_MS` u. a. in einzelnen Komponenten) – das sind
bewusst modul-lokale Werte ohne zweite Verwendungsstelle, siehe Kommentar am Kopf von
`lib/constants.ts`. Wer eine davon ein zweites Mal braucht, zentralisiert sie in `lib/` und
trägt sie dann hier ein.

Nachtrag 26.09.2026 (v79): `lib/karte.ts` (neu) und `MAP_STIL_REIHENFOLGE`, siehe „Karte & Design";
die Nadelfarben (`MARKER_FARBE`) sind entfallen – sie stehen als Tokens in `globals.css`.

Insgesamt **149 exportierte Konstanten** (`export const`) in 41 Dateien unter `lib/` – gezählt am
08.10.2026 (v128: `KUNDEN_ARTEN` in `lib/kundenAnsicht.ts`; v125: `VERKAUFSREIFEN_SPALTEN` in `lib/api/verkaufsreifen.ts`; v124: `RECHTE_ABHAENGIGKEITEN`, `ROLLEN_SONDERREGELN` in `lib/constants.ts`; v117: `ALLE_DATEN_BESTAETIGUNG` in `lib/constants.ts`; v115: `RAD_NOTIZ_SPALTE`, `RAD_NOTIZ_MAX` in `lib/constants.ts`, `SATZ_OFFLINE_FELDER` in `lib/offline/ausgang.ts`; v113: `VORRAT_TAGE_VORAUS`, `VORRAT_TAGE_ZURUECK` in `lib/queries/hooks.ts`; v112: `VERFUEGBARKEIT_ZEITEN`, `VERFUEGBARKEIT_FENSTER_VORGABE` in `lib/verfuegbarkeit.ts`; v107: `WISCH_MIN_PX`, `WISCH_VERHAELTNIS`, `WISCH_MAX_MS`, `WISCH_START_MAX_MS` in `lib/wischen.ts`; v100: `IBAN_LAENGE`, `FREMDABFRAGE_ZU_VIEL`; v101: die vier aus `lib/offline/ausgang.ts`;
v102: `LAGER_VOLL_AB` dazu, `GEO_GENAUIGKEIT_LABEL` entfernt; v103: `DUBLETTEN_GRUND_LABEL`,
`PLATZ_GROESSE_LABEL`, `GROSSES_FACH_AB_DURCHMESSER_MM`, `GROSSES_FACH_AB_BREITE_MM`,
`VERKAUF_LANGE_LIEGEND_MONATE`, `VERKAUFSREIFEN_PARAMETER`, `PROTOKOLL_SCHWAERZEN_MONATE`; v104:
`UMWEG_FAKTOR`, `MAPS_ZWISCHENZIELE_MAX`, `BESTAETIGUNG_ART_LABEL`; v105: `BELEG_ARTEN`, `BELEG_ART_LABEL`, `BELEG_BUCKET`, `BELEG_MAX_KANTE_PX`, `BELEG_JPEG_QUALITAET`; v106: `SPRUNG_PARAMETER`, `SPRUNG_MERKEN_MS`, dazu `lib/sprungMerker.ts` und drei Dateien aus der Teilung von `lib/helpers.ts` (`lagerdauer.ts`, `geocode.ts`, `protokollText.ts`) – deren Konstanten sind dieselben wie vorher) mit `grep -c "^export const" lib/*.ts lib/*/*.ts`. Seit diesem Tag ist jede davon hier
eingetragen (vier fehlten: `KLICK_RASTER_MIN`, `ZIEH_RASTER_MIN`, `ANRUF_PARAMETER`,
`PROFIL_MAX_MM`). Die Zahl gehört bei jeder neuen Konstante mit nachgezogen.

---

## Rechte (Rollen & Berechtigungen)

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `ROLE_LABEL` | `lib/constants.ts` | `Record<Role, string>` | Anzeigename je Rolle (Superadmin/Admin/Techniker/Nutzer) | `PermissionMatrix`, `AdminPanel`, `app/admin/users/page.tsx`; Grundlage von `ALL_ROLES` |
| `ALL_ROLES` | `lib/constants.ts` | `Role[]` (aus `ROLE_LABEL` abgeleitet) | Alle existierenden Rollen, ohne zweite Aufzählung | `app/api/invite/route.ts` (`ASSIGNABLE_ROLES`) |
| `VERBEN` | `lib/constants.ts` | `Verb[]` | Die drei Rechte-Verben: lesen/schreiben/löschen (seit 17.09.2026) | `PermissionMatrix`, `tests/navigation.test.ts`, `tests/rechte.test.ts` |
| `VERB_LABEL` | `lib/constants.ts` | `Record<Verb, string>` | Beschriftung der drei Verben | `PermissionMatrix` |
| `RECHTE_KATALOG` | `lib/constants.ts` | `RechtBereich[]` | Vollständiger Katalog aller Rechte-Bereiche (Module + eingerückte Unterbereiche) mit Verben, Erklärung, Sperrung | `PermissionMatrix`, `app/page.tsx` (Warnung bei unbekanntem Bereich), `tests/navigation.test.ts`, `tests/rechte.test.ts` |
| `RECHTE_ABHAENGIGKEITEN` | `lib/constants.ts` | `RechtAbhaengigkeit[]` | Welcher Haken welchen anderen voraussetzt, mit Grund – Hinweise in der Rechtematrix (v124) | `rechteHinweise()` (lib/rechteAnsicht.ts), `PermissionMatrix` |
| `ROLLEN_SONDERREGELN` | `lib/constants.ts` | `Record<Role, string[]>` | Was für eine Rolle unabhängig von den Haken gilt (Datenbankregeln) – in „Ansehen als …“ (v124) | `PermissionMatrix` |
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
| `START_TAB` / `START_TAB_ERSATZ` | `lib/module.ts` | `TabKey` ("einsatzplanung" / "dashboard") | Womit die App beim Öffnen startet, und der Rückfall, wenn die Rolle das Startmodul nicht sehen darf (23.09.2026) | `app/page.tsx` |
| `ADMIN_REITER` | `components/admin/AdminPanel.tsx` | `{ key, label, nurSuperadmin? }[]` (Nutzer · Mitarbeiter · Transporter · Rechte · Betrieb · Wartung · Protokoll · Papierkorb) | Reiter des Admin-Bereichs; „Rechte" nur für den Superadmin (26.09.2026, Entwurf U) | **nur intern** |
| `WEITERE_GRUPPEN` | `lib/module.ts` | `{ titel, tabs: TabKey[] }[]` (Unterwegs · Lager · Kunden · Büro · System) | Gruppen und Reihenfolge der Kacheln auf der Seite „Weitere"; was in keiner Gruppe steht, kommt unter „Sonstiges" (26.09.2026, Entwurf V) | `components/WeiterePanel.tsx` über `weitereGruppen()`, `tests/weitereGruppen.test.ts` |
---

## Aufträge & Status

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `ORDER_STATUS_LABEL` | `lib/constants.ts` | `Record<OrderStatus, string>` | Anzeigename je Auftragsstatus (Offen/In Arbeit/Erledigt/Storniert) | `AuftraegePanel`, `TerminePanel`, `DashboardPanel`, `AuftragModal`, `CustomerOrderRow`, `Stundenraster`, `EinsatzplanungPanel` |
| `ORDER_STATUS_FARBE` | `lib/constants.ts` | `Record<OrderStatus, string>` | Farbklasse des Status-Badges | dieselben Stellen wie `ORDER_STATUS_LABEL` |
| `ABGESCHLOSSENE_ZUSTAENDE` | `lib/constants.ts` | `OrderStatus[]` | Zustände (`erledigt`, `storniert`), in denen die Auftragspositionen eingefroren sind | **nur intern** – wird ausschließlich von `istAbgeschlossen()` gelesen; diese Funktion wiederum nutzt `CustomerOrderRow` |
| `AUFTRAGSFENSTER_LABEL` | `lib/api/orders.ts` | `Record<AuftragsFenster, string>` | Beschriftung des geladenen Zeitraums (Aktuell/Dieses Jahr/Alle) | `app/page.tsx` (Fensterschalter) |

---

## Termine & Kalender

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `TERMIN_FILTER` | `lib/constants.ts` | `{ wert: TerminFilter; text: string }[]` | Zeitraum-Filter im Termine-Reiter (Heute/Morgen/7 Tage/Anstehend/Alle) | `app/page.tsx`, `TerminePanel` |
| `TERMIN_LUECKE_AB_MIN` | `lib/terminAnsicht.ts` | `number` (60) | Ab so vielen freien Minuten zwischen zwei Terminen zeigt die Terminliste „frei 13:00–15:15" (26.09.2026) | **nur intern** – Vorgabe von `terminTage()`, darüber `TerminePanel`; `tests/terminAnsicht.test.ts` |
| `KUNDE_PARAMETER` | `lib/constants.ts` | `string` ("kunde") | Aufrufparameter, mit dem eine Benachrichtigung/ein Link direkt den Kunden öffnet | `app/page.tsx` (Aufruf-Auswertung) |
| `AUFTRAG_PARAMETER` | `lib/constants.ts` | `string` ("auftrag") | Aufrufparameter für einen bestimmten Auftrag/Termin | `app/page.tsx`, `app/api/push/senden/route.ts` |
| `VORLAUF_MINUTEN` | `lib/constants.ts` | `number` (5) | Vorlauf der Terminerinnerung in Minuten | `app/api/push/senden/route.ts`, `tests/terminerinnerung.test.ts` |
| `ZEITZONE` | `lib/constants.ts` | `string` ("Europe/Berlin") | Zeitzone, in der Auftragsuhrzeiten gemeint sind (Server läuft in UTC) | `app/api/push/senden/route.ts` |
| `STANDARD_DAUER_MIN` | `lib/constants.ts` | `number` (30) | Rückfall-Termindauer, solange die Betriebseinstellung (`betrieb.termin_intervall_min`) noch nicht geladen ist | `AuftragModal`, `app/page.tsx` |
| `TERMIN_INTERVALLE` | `lib/constants.ts` | `number[]` | Auswahlliste der Terminraster-Schritte im Adminbereich | `AdminPanel` |
| `KALENDER_VON_STUNDE` | `lib/constants.ts` | `number` (7) | Start des Grundfensters der Tages-/Wochenansicht | `Stundenraster` |
| `KALENDER_BIS_STUNDE` | `lib/constants.ts` | `number` (19) | Ende des Grundfensters der Tages-/Wochenansicht | `Stundenraster` |
| `KLICK_RASTER_MIN` | `lib/calendar.ts` | `number` (15) | Raster beim Klick ins Stundenraster (abgerundet: Tipp auf „10:00" ergibt 10:00) | **nur intern** – `terminAusKlick()` |
| `ZIEH_RASTER_MIN` | `lib/calendar.ts` | `number` (15) | Raster beim Ziehen eines Termins (gerundet) | **nur intern** – `gezogenerTermin()` |
| `ANRUF_PARAMETER` | `lib/constants.ts` | `string` ("anruf") | Aufrufparameter von „Auf dem Handy anrufen": nur die Kunden-Kennung in der Adresse, keine Rufnummer | `app/api/push/anruf/route.ts`, `app/page.tsx` |
| `WISCH_MIN_PX` | `lib/wischen.ts` | `number` (60) | So weit muss ein Finger im Kalender waagrecht gehen, damit es als Blättern zählt (v107) | **nur intern** – `wischRichtung()`; `tests/wischen.test.ts` |
| `WISCH_VERHAELTNIS` | `lib/wischen.ts` | `number` (1.5) | So viel deutlicher waagrecht als senkrecht muss ein Wisch sein – sonst war es Scrollen | **nur intern** – `wischRichtung()` |
| `WISCH_MAX_MS` | `lib/wischen.ts` | `number` (800) | Höchstdauer eines Wischs; langsames Schieben blättert nicht | **nur intern** – `wischRichtung()`; `tests/wischen.test.ts` |
| `WISCH_START_MAX_MS` | `lib/wischen.ts` | `number` (300) | Bewegt sich der Finger erst später, war es langes Drücken (Termin ziehen, 400 ms) und kein Wisch | **nur intern** – `wischRichtung()`; `tests/wischen.test.ts` |
| `VERFUEGBARKEIT_ZEITEN` | `lib/verfuegbarkeit.ts` | `string[]` („06:00" … „21:00", halbstündlich) | Wählbare Uhrzeiten für das Zeitfenster der Verfügbarkeit (Migration 68, v112) | `VerfuegbarkeitAnsicht`; `tests/verfuegbarkeit.test.ts` |
| `VERFUEGBARKEIT_FENSTER_VORGABE` | `lib/verfuegbarkeit.ts` | `{ von: "08:00", bis: "13:00" }` | Vorgeschlagenes Zeitfenster, wenn jemand „nur ein Zeitfenster" wählt (der Vormittag) | `VerfuegbarkeitAnsicht` |

---

## Kunden & Zustand

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `KUNDEN_FILTER` | `lib/constants.ts` | `{ wert: KundenFilter; text: string }[]` | Die Zustandsfilter über der Kundenliste, mit Reihenfolge und Beschriftung. Der Typ `KundenFilter` kennt zusätzlich `"rueckruf"` (26.09.2026) – bewusst ohne eigenen Knopf, erreichbar über die Karte „Rückrufe heute fällig" und aus dem Dashboard | `KundenListePanel` (Pillen), `app/page.tsx` (Trefferzahlen, Filter) |
| `KUNDEN_ARTEN` | `lib/kundenAnsicht.ts` | `{ wert: KundenArt; text: string }[]` | Kundenart-Filter neben A–Z (v128): alle, Privat, Firma, Einmal, Test – Regel in `kundenArtPasst()` | `KundenListePanel` (Blatt „Kundenart"), `kundenArtZahlen()`, `tests/kundenAnsicht.test.ts` |
| `KUNDEN_ZUSTAND_LABEL` | `lib/helpers.ts` | `Record<KundenZustand, string>` | Beschriftung der fünf Kundenzustände (kontaktiert/Termin/Wiedervorlage/offen/kein Interesse) | `DetailModal`, `app/page.tsx` (Karten-Popup, Kundenliste) |
| `DUBLETTEN_GRUND_LABEL` | `lib/dubletten.ts` | `Record<DublettenGrund, string>` | Warum zwei Kunden dieselbe Person sein könnten: gleiche Telefonnummer, gleiche E-Mail, gleicher Name und PLZ, ähnlicher Name (E1, v103) | `AddCustomerForm` („Gibt es schon?"), `DublettenPanel`; `tests/dubletten.test.ts` |
| `KUNDEN_ZUSTAND_REIHENFOLGE` | `lib/helpers.ts` | `readonly KundenZustand[]` | Reihenfolge der Zustände in Legenden/Auswahlen, nach Dringlichkeit sortiert | `app/page.tsx` (Zustandsfilter auf der Karte) |

---

## Lager: Saison & Räder

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `SAISON_LABEL` | `lib/constants.ts` | `Record<Saison, string>` | Beschriftung der drei Saisonwerte (Sommer/Winter/Ganzjahr) | `ReifensatzEtikett`, `SaisonPanel`, `LagerPanel`, `EinlagerungBlock`, `AuftragModal`, `VehicleSection` |
| `SAISON_LISTE` | `lib/constants.ts` | `Saison[]` | Die drei Saisonwerte als Liste (für Auswahlknöpfe) | `SaisonPanel`, `LagerPanel`, `EinlagerungBlock` |
| `RAD_POSITIONEN` | `lib/constants.ts` | `RadPosition[]` | Die vier Radpositionen (VL/VR/HL/HR) in Anzeigereihenfolge | `ReifensatzEtikett`, `RadBild` |
| `RAD_POSITION_LABEL` | `lib/constants.ts` | `Record<RadPosition, string>` | Ausgeschriebene Beschriftung der Radpositionen | `ReifensatzEtikett`, `RadBild` |
| `RAD_NOTIZ_SPALTE` | `lib/constants.ts` | `Record<RadPosition, "notiz_vl" …>` | Spalte am Satz für die Notiz je Rad (Migration 71, v115) | `lib/lagerNotizen.ts`, `ReifenNotizen` |
| `RAD_NOTIZ_MAX` | `lib/constants.ts` | `number` (300) | Höchstlänge einer Notiz je Rad – dieselbe Grenze prüft die Datenbank (`tire_storage_notiz_je_rad_laenge`) | `ReifenNotizen` |
| `FELGE_LABEL` | `lib/constants.ts` | `Record<Felge, string>` | Beschriftung der Felgenart (Stahl/Alu/keine) | `RadBild` |
| `FELGEN` | `lib/constants.ts` | `Felge[]` | Die drei Felgenarten als Liste | `RadBild` |
| `PROFIL_GESETZLICH_MM` | `lib/constants.ts` | `number` (1,6) | Gesetzliches Minimum der Profiltiefe | `ProfilMarke`, `RadBild` |
| `PROFIL_KRITISCH_MM` | `lib/constants.ts` | `number` (3) | Schwelle „kritisch" | `SaisonPanel`, `ProfilMarke`, `LagerPanel`, `RadBild`, `AuftragModal`, `app/page.tsx`, `tests/regalwand.test.ts`, `tests/profiltiefe.test.ts` |
| `PROFIL_HINWEIS_MM` | `lib/constants.ts` | `number` (4) | Schwelle „Hinweis" | `ProfilMarke`, `RadBild`, `tests/profiltiefe.test.ts` |
| `PROFIL_MAX_MM` | `lib/constants.ts` | `number` (25) | Obere Schranke der Profiltiefen-Eingabe (fängt „66" statt „6" ab) | `RadBild` (`ProfilEingabe`), `VerkaufsreifenBlatt` |
| `PROFIL_SCHNELLWERTE_MM` | `lib/constants.ts` | `number[]` (1–8) | Schnellwert-Knöpfe unter der Profiltiefe (seit v89) | `ProfilEingabe` in `RadBild.tsx` (Lager-Einlagern, Auftragsfenster) |
| `DOT_ALT_JAHRE` | `lib/constants.ts` | `number` (6) | Reifenalter (Jahre), ab dem der Kunde angesprochen werden soll | `LagerPanel`, `AuftragModal`, `tests/regalwand.test.ts` |
| `LAGERDAUER_HINWEIS_TAGE` | `lib/constants.ts` | `number` (365) | Tage ohne Bewegung, ab denen ein Hinweis erscheint | `LagerPanel`, `AuftragModal`, `tests/regalwand.test.ts` |
| `PLATZ_GROESSE_LABEL` | `lib/constants.ts` | `Record<PlatzGroesse, string>` | Beschriftung der zwei Fachgrößen (normal/groß); dieselben Werte als Prüfregel `storage_slots_groesse_bekannt` (Migration 64, E12) | Doku der Fachgröße; Anzeige über `platzGroesse()` |
| `BELEG_ARTEN` | `lib/constants.ts` | `BelegArt[]` | Die vier Arten eines Belegs am Auftrag (vorher, nachher, Schaden, Unterschrift); dieselben Werte als Prüfregel `auftrag_belege_art_bekannt` (Migration 65, E3) | `FotoBlock` (Knöpfe ohne Unterschrift), `belegeNachArt()`; `tests/belege.test.ts` |
| `BELEG_ART_LABEL` | `lib/constants.ts` | `Record<BelegArt, string>` | Beschriftung der Belegarten | `FotoBlock`, `belegZeile()` (Auskunft) |
| `BELEG_BUCKET` | `lib/constants.ts` | `string` (`auftrag-belege`) | Name des privaten Storage-Bereichs für Fotos und Unterschrift – heißt in Migration 65 genauso | `lib/api/belege.ts` |
| `GROSSES_FACH_AB_DURCHMESSER_MM` | `lib/lagerAnsicht.ts` | `number` (720) | Ab diesem Außendurchmesser braucht ein Reifen ein großes Fach (E12, Startwert) | `brauchtGrossesFach()` – `EinlagerungBlock`, `LagerPanel`; `tests/lagerAnsicht.test.ts` |
| `GROSSES_FACH_AB_BREITE_MM` | `lib/lagerAnsicht.ts` | `number` (265) | Ab dieser Reifenbreite braucht ein Reifen ein großes Fach (E12, Startwert) | dito |
| `LANGLIEGER_MONATE` | `lib/lagerdauer.ts` (bis v105 `lib/helpers.ts`) | `number` (18) | Monate, ab denen ein Satz als „Langlieger" gilt | **nur intern** – über `istLanglieger()` (`AuslagernDialog`, `tests/lagerdauer.test.ts`) |
| `LANGLIEGER_EURO` | `lib/lagerdauer.ts` | `number` (150) | Summenschwelle, ab der ein Satz als „Langlieger" gilt | dito, über `istLanglieger()` |

## Lager: Reifenverkauf (Migration 61)

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `REIFEN_ZUSTAENDE` | `lib/constants.ts` | `ReifenZustand[]` (neu, gebraucht) | Die zwei Zustände eines Verkaufsreifens; dieselben Werte als Prüfregel `verkaufsreifen_zustand_bekannt` | `VerkaufPanel`, `VerkaufsreifenBlatt`, `ReifenSuche` |
| `REIFEN_ZUSTAND_LABEL` | `lib/constants.ts` | `Record<ReifenZustand, string>` | Beschriftung Neu/Gebraucht | dieselben Stellen, `lib/reifenverkauf.ts` |
| `REIFENVERKAUF_ART` | `lib/constants.ts` | `Record<ReifenZustand, Article["abrechnungsart"]>` | Welche Abrechnungsart zu welchem Zustand gehört – die Datenbank prüft dasselbe (`position_verkaufsreifen_pruefen`) | `artikelFuer()` in `lib/reifenverkauf.ts` |
| `ABRECHNUNGSARTEN` | `lib/constants.ts` | `Article["abrechnungsart"][]` | Die vier Abrechnungsarten in der Reihenfolge der Auswahlknöpfe | `ArticleDetailEditor` |
| `ABRECHNUNGSART_LABEL` | `lib/constants.ts` | `Record<Article["abrechnungsart"], string>` | Beschriftung der Abrechnungsarten | `ArticleDetailEditor`, `ArticleAdminPanel` |
| `VERKAUF_LANGE_LIEGEND_MONATE` | `lib/reifenverkauf.ts` | `number` (6) | Ab so vielen Monaten im Bestand steht ein Verkaufsposten in der Auswertung unter „liegt seit über …" (E18, v103) | `reifenAuswertung()`, `AuswertungPanel` (Reiter „Reifen"); `tests/reifenverkauf.test.ts` |
| `VERKAUFSREIFEN_SPALTEN` | `lib/api/verkaufsreifen.ts` | `string` (Spaltenliste ohne `ek_netto`) | Was `authenticated` an `verkaufsreifen` lesen darf (Migration 77); eine neue Spalte gehört hier hinein und braucht in ihrer Migration `grant select (spalte)` | `fetchVerkaufsreifen()`, `fetchReifenverkauf()` in `lib/api/auswertung.ts`, `tests/unterrechte.test.tsx` |
| `NEUREIFEN_ALT_JAHRE` | `lib/constants.ts` | `number` (3) | Ab diesem Alter (DOT) gilt ein Neureifen als alt – Hinweis in Liste und Suche; gebrauchte nutzen `DOT_ALT_JAHRE` | `reifenHinweise()` in `lib/reifenverkauf.ts`, `tests/reifenverkauf.test.ts` |

Die Größengrenzen (Breite 100–400, Querschnitt 20–95, Zoll 10–24) stehen in `fertig()` in
`lib/reifenverkauf.ts` und als Prüfregel `verkaufsreifen_groesse_moeglich` in Migration 61 – wer
eine Stelle ändert, ändert beide. Profilgrenzen im Reifenverkauf: `PROFIL_GESETZLICH_MM` (nicht
verkaufen), `PROFIL_KRITISCH_MM` (Sommer knapp), `PROFIL_HINWEIS_MM` (Winter/Ganzjahr knapp).

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
| `IBAN_LAENGE` | `lib/rechnung.ts` | `Record<string, number>` | IBAN-Länge je Land (DE 22, AT 20, CH 21 …); andere Länder 15–34 (D17, v100) | `ibanFehler()` – `BetriebsdatenPanel`, `tests/iban.test.ts` |

---

## Protokoll (Audit-Log)

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `ALLE_DATEN_BESTAETIGUNG` | `lib/constants.ts` | `string` | Das Wort „löschen“, das der Superadmin zum Bestätigen von „Alle Daten löschen“ eintippt; die Datenbank prüft es noch einmal selbst (`alle_daten_loeschen()`, Migration 72, v117) | `AlleDatenLoeschen` |
| `PROTOKOLL_TABELLE_LABEL` | `lib/constants.ts` | `Record<string, string>` | Tabellenname (wie in der DB) → Klartext | `ProtokollPanel`, `AuftragProtokoll` |
| `PROTOKOLL_FELD_LABEL` | `lib/constants.ts` | `Record<string, string>` | Spaltenname → Klartext; enthält bewusst auch längst gelöschte Spalten (Historie bleibt lesbar) | `ProtokollPanel`, `tests/protokoll.test.ts` |
| `PROTOKOLL_SCHWAERZEN_MONATE` | `lib/constants.ts` | `number` (36) | Nach so vielen Monaten schwärzt `protokoll_schwaerzen()` (Migration 56) personenbezogene Felder im Protokoll – hier nur für den Text im Auskunftsauszug; beide gemeinsam ändern (E10, v103) | `AuskunftFenster` |
| `PROTOKOLL_TAGE_STANDARD` | `lib/constants.ts` | `number` (90) | Standard-Rückreichweite des Protokollfilters im Adminbereich | `ProtokollPanel`, `AdminPanel` |
| `PROTOKOLL_AKTION_LABEL` | `lib/protokollText.ts` (bis v105 `lib/helpers.ts`) | `Record<string, string>` | INSERT/UPDATE/DELETE → „angelegt"/„geändert"/„gelöscht" | `ProtokollPanel` |
| `IST_KENNUNG` | `lib/protokollText.ts` | `RegExp` | Erkennt eine UUID in einem Protokollwert (zum Kürzen/Nachschlagen) | **nur intern** – `protokollWert()` |
| `PROTOKOLL_SEITE` | `lib/api/audit.ts` | `number` (200) | Höchstzahl der auf einmal geladenen Protokolleinträge | **nur intern** – `fetchProtokoll()` |

---

## Karte & Design

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `DEFAULT_MAP_CENTER` | `lib/mapStyles.ts` | `[number, number]` | Kartenmittelpunkt beim ersten Laden (Nürnberg-Region) | `app/page.tsx` (Karten-Init), `app/api/adresse-suchen/route.ts` |
| `DEFAULT_MAP_ZOOM` | `lib/mapStyles.ts` | `number` (12) | Zoomstufe beim ersten Laden | `app/page.tsx` |
| `MAP_STYLES` | `lib/mapStyles.ts` | `Record<MapStyleKey, {...}>` | Die drei verfügbaren Kartenstile (Straße/Satellit/Satellit+Beschriftung) | `app/page.tsx` (`applyMapStyle`), `components/karte/KartenBedienung.tsx` (Ebenen-Wähler) |
| `MAP_STIL_REIHENFOLGE` | `lib/mapStyles.ts` | `MapStyleKey[]` | Reihenfolge im Ebenen-Wähler (bis v78 lokal als `STYLE_ORDER` in `app/page.tsx`) | `app/page.tsx` → `KartenBedienung` |
| `BUENDEL_BIS_ZOOM` | `lib/karte.ts` | `number` (13) | Bis zu dieser Zoomstufe werden nahe Nadeln gebündelt (entschieden 26.09.2026) | `app/page.tsx` (`syncMarkers`, Bündel-Klick) |
| `BUENDEL_AUSWAHL_AB` | `lib/karte.ts` | `number` (150) | Bei einer Auswahl (Termine, Saisonliste) wird erst ab so vielen Nadeln gebündelt | `app/page.tsx` (`syncMarkers`) |
| `BUENDEL_ZELLE_PX` | `lib/karte.ts` | `number` (80) | Kantenlänge der Rasterzelle eines Bündels in Bildschirmpunkten | `buendeln()` |
| `BUENDEL_RING_FARBE` | `lib/karte.ts` | `Record<KundenZustand, string>` (CSS-Variablen) | Farbe je Zustand im Anteilsring des Bündels | `ringVerlauf()` |
| `NADEL_MASS`, `KREIS_MASS`, `STATION_MASS` | `components/karte/nadel.ts` | Maße in px | Größe und Ankerpunkt der Nadelformen für Leaflet – müssen zu `globals.css` („Karte: Nadeln") passen | `app/page.tsx` (`makeIcon`, `tagZeichnen`) |
| `EMP_COLORS` | `lib/constants.ts` | `string[]` | Farbpalette für Mitarbeiter-Punkte im Kalender | `lib/calendar.ts` (`employeeColorFor()`), darüber `Stundenraster`, `EinsatzplanungPanel` |

---

## QR-Aufkleber & Benachrichtigungen

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `LAGERPLATZ_PARAMETER` | `lib/aufkleberCode.ts` | `string` ("lagerplatz") | Aufrufparameter des Regal-Aufklebers | `app/page.tsx`, `lagerplatzUrl()`/`lagerplatzIdAusCode()`, `LagerplatzAufkleber`, `EinlagerungBlock` |
| `SATZ_PARAMETER` | `lib/aufkleberCode.ts` | `string` ("satz") | Aufrufparameter des Reifensatz-Aufklebers (seit 17.09.2026) | `app/page.tsx`, `satzUrl()`/`satzIdAusCode()`, `ReifensatzEtikett`, `EinlagerungBlock` |
| `VERKAUFSREIFEN_PARAMETER` | `lib/aufkleberCode.ts` | `string` ("reifen") | Aufrufparameter des Etiketts an einem Verkaufsreifen: `/?reifen=…` öffnet den Posten im Reiter „Verkauf" (E17, v103) | `app/page.tsx`, `verkaufsreifenUrl()`/`verkaufsreifenIdAusCode()`, `VerkaufsreifenEtikett`, `scanZiel()` |
| `ZIEL_SPEICHER` | `lib/benachrichtigungZiel.ts` | `string` ("pinpoints-ziel") | Name des Cache-Storage-Bereichs für das Benachrichtigungsziel | **nur intern**; muss wortgleich in `public/sw.js` gepflegt werden (Service Worker kann dieses Modul nicht importieren) |
| `ZIEL_SCHLUESSEL` | `lib/benachrichtigungZiel.ts` | `string` | Schlüssel des abgelegten Navigationsziels | **nur intern**, über `zielAbholen()` (`app/page.tsx`); dito wortgleich in `public/sw.js` |
| `PROTOKOLL_SCHLUESSEL` | `lib/benachrichtigungZiel.ts` | `string` | Schlüssel für „zuletzt angetippt" (Diagnose auf iPhones ohne Konsole) | **nur intern**, über `letztesAntippen()` (`PushEinstellung`); dito wortgleich in `public/sw.js` |
| `MITNEHMEN_PARAMETER` | `lib/constants.ts` | `string` ("mitnehmen") | Aufrufparameter des Abendhinweises: `/?mitnehmen=YYYY-MM-DD` öffnet die Mitnehmen-Liste (Migration 55, 23.09.2026) | `lib/abendhinweisVersand.ts`, `app/page.tsx` (`zielOeffnen`) |
| `ABENDHINWEIS_UHRZEIT_STANDARD` | `lib/constants.ts` | `string` ("20:00") | Uhrzeit des Abendhinweises ohne eigene Einstellung. Dieselbe Vorgabe steht als Spaltenvorgabe in `user_settings.abendhinweis_uhrzeit` (Migration 55) – beide gemeinsam ändern | `lib/mitnehmen.ts` (`abendhinweisFaellig`), `SettingsPanel`, `app/page.tsx` |
| `PUSH_ABSENDER` | `lib/pushInhalt.ts` | `string` (aus `ERSCHEINUNG.kurzname`) | Titel der Testnachricht; folgt `ERSCHEINUNG` (heute „MR Assistent") | `app/api/push/test` |
| `AUSWERTUNGS_ZEITRAUM_LABEL` | `lib/auswertungAnsicht.ts` | `Record<AuswertungsZeitraum, string>` | Zeiträume der Auswertung: Monat, Saison, Quartal, Jahr, 12 Monate, Frei (26.09.2026) | `AuswertungPanel` |
| `WECHSELSAISON` | `lib/auswertungAnsicht.ts` | `{ fruehjahr, herbst }` mit Monaten (3–5, 9–11) | Wann gewechselt wird – Grundlage von „Saison" und der Wiederkehr. Bewusst enger als `naechsteSaison()` (welche Reifen dran sind) | `zeitraumFuer()`, `aktuelleOderNaechsteSaison()`, `AuswertungPanel` |
| `EINSATZ_RASTER_VON` / `EINSATZ_RASTER_BIS` | `lib/auswertungAnsicht.ts` | `number` (7 / 19) | Stundenbereich des Rasters Wochentag × Uhrzeit | `einsatz()`, `rasterHinweis()`, `AuswertungPanel` |
| `DATEV_SPALTEN` | `lib/datev.ts` | `string[]` (125) | Spaltenüberschriften des DATEV-Buchungsstapels, Version 700 | **nur intern** – `datevBuchungsstapel()`; `tests/datev.test.ts` |
| `AUFTRAGS_SORTIERUNG_LABEL` | `lib/auftragsAnsicht.ts` | `Record<AuftragsSortierung, string>` | Die Sortierungen der Auftragsliste mit Beschriftung: anstehende zuerst (Vorgabe), neueste zuerst, Kunde A–Z, Auftragsnummer (26.09.2026) | `AuftraegePanel`, `auftragsGruppen()` |
| `LAGER_VOLL_AB` | `lib/lagerAnsicht.ts` | `number` (0,9) | Ab diesem Anteil belegter Plätze gilt ein Lager als fast voll (E11, v102) | `lagerAuslastung()` – `LagerPanel`, `DashboardPanel`; `tests/lagerAnsicht.test.ts` |
| `LAGER_ENGPASS_AB` | `lib/dashboard.ts` | `number` (10) | Ab weniger freien Lagerplätzen zeigt das Dashboard unter „Zu erledigen" die Warnung „Lager wird knapp" (25.09.2026); seit 26.09.2026 färbt dieselbe Grenze die Kachel „Lager" auf der Seite „Weitere" orange | `zuErledigen()`, darüber `DashboardPanel`; `app/page.tsx` (Hinweise für „Weitere"); `tests/dashboard.test.ts` |
| `UMWEG_FAKTOR` | `lib/route.ts` | `number` (1,3) | Straße statt Luftlinie: Faktor für die Kilometer der Tagesroute – ein Erfahrungswert, ohne Routendienst (E5, v104) | `routenvorschlag()`, `RoutenBlatt`; `tests/route.test.ts` |
| `MAPS_ZWISCHENZIELE_MAX` | `lib/route.ts` | `number` (9) | Höchstzahl der Zwischenziele in einem Google-Maps-Link | `mapsRoutenUrl()`, `RoutenBlatt` |
| `BESTAETIGUNG_ART_LABEL` | `lib/terminBestaetigung.ts` | `Record<BestaetigungArt, string>` | Bestätigung / Erinnerung – die zwei Texte an den Kunden (E9, v104) | `BestaetigungBlatt` |
| `BELEG_MAX_KANTE_PX` | `lib/belege.ts` | `number` (1600) | Lange Kante eines Fotos nach dem Verkleinern – DOT-Nummer und Kratzer noch klar, meist 200–500 kB (E3, v105) | `zielMasse()`, `bildVerkleinern()`; `tests/belege.test.ts` |
| `BELEG_JPEG_QUALITAET` | `lib/belege.ts` | `number` (0,8) | JPEG-Qualität beim Verkleinern | `bildVerkleinern()` (lib/belegBild.ts) |
| `SPRUNG_PARAMETER` | `lib/sprungMerker.ts` | `readonly string[]` | Alle Adress-Parameter, die einen Sprung auslösen (Aufkleber, Benachrichtigung) – aus den Einzelkonstanten zusammengesetzt (D19, v106) | `sprungTeile()`; `tests/sprungMerker.test.ts` |
| `SPRUNG_MERKEN_MS` | `lib/sprungMerker.ts` | `number` (60 000) | Wie lange ein gemerkter Sprung das Neuladen durch den Service Worker überdauert | `sprungLesen()` |
| `WOCHENTAG_KURZ` | `lib/dashboard.ts` | `readonly ["So", …, "Sa"]` (Sonntag zuerst wie `getDay()`) | Kurze Wochentage für „Fr 25.9." (26.09.2026 zusammengeführt – stand vorher als Literal in `datumKurz()`) | `datumKurz()`, darüber Dashboard, Kundenfenster, Auftragsfenster, Aufträge im Kundenfenster |

---

## Etikett als Bild (21.09.2026)

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `PX_PRO_MM` | `lib/etikettBild.ts` | `number` (8) | Bildpunkte je Millimeter (203 dpi, die Auflösung der Etikettendrucker) für das per „Als Bild teilen" erzeugte Etikett-PNG | `mmZuPx()` – `ReifensatzEtikett`, `tests/etikettbild.test.ts` |
| `PX_PRO_MM_300` | `lib/etikettBild.ts` | `number` (300 / 25,4) | Bildpunkte je Millimeter bei 300 dpi – Brother QL-820NWBc (seit 30.09.2026) | `ETIKETT_FORMATE` (58 × 58, 60 × 86 mm) in `ReifensatzEtikett`, `tests/etikettbild.test.ts` |
| `PT_PRO_MM` | `lib/etikettPdf.ts` | `number` (72 / 25,4) | PDF-Punkte je Millimeter – Seitengröße des Etikett-PDFs (seit 02.10.2026) | **nur intern** – `etikettPdf()`; `tests/etikettPdf.test.ts` |
| `SCHWARZ_SCHWELLE` | `lib/etikettPdf.ts` | `number` (160) | Helligkeit, ab der ein Bildpunkt im 1-Bit-PDF weiß bleibt | **nur intern** – `einBitBild()`; `tests/etikettPdf.test.ts` |

**Nicht aufgenommen, bewusst:** `ETIKETT_FORMATE` (seit v99 58 × 58 und 60 × 86 mm, auch vom
Regalaufkleber genutzt; v96–v98 nur `ETIKETT_FORMAT`) liegt nicht in `lib/`, sondern als `export const` direkt in
`components/lager/ReifensatzEtikett.tsx` – außerhalb des oben festgelegten Umfangs dieses
Registers, ebenso wie `QR_PIXEL` in derselben Datei (siehe „Umfang dieser Fassung"). Die übrigen
Maß-Konstanten in `lib/etikettBild.ts` (`RAND_MM`, `SPALT_MM`, `SCHRIFT_KOPF_MM`,
`SCHRIFT_ZEILE_MM`, `SCHRIFT_GROSS_MM`, `ZEILENHOEHE`, `SCHRIFT`) sind ebenfalls nicht erfasst,
weil sie im Code **nicht exportiert** sind (`const`, kein `export const`) – geprüft per
`grep -n "^export const\|^const" lib/etikettBild.ts`. Nur `PX_PRO_MM` trägt tatsächlich
`export`.

---

## App-Erscheinung

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `GETARNT` | `lib/erscheinung.ts` | `boolean` (seit v88 `false`) | Schalter: Tarnung „Settings" statt „MR Assistent" (Tarnung 18.09.–29.09.2026) | **nur intern**, steuert `ERSCHEINUNG`; wird von Hand umgestellt |
| `ERSCHEINUNG` | `lib/erscheinung.ts` | `Erscheinung` (Objekt: Name, Symbole, Beschreibung) | Der aktive Name-/Symbol-Satz: „MR Assistent", seit v90 Symbole `mr-logo-*.png` | `app/manifest.ts`, `app/layout.tsx`, `lib/pushInhalt.ts` |

---

## Datenzugriff & Adressen

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `PAGE_SIZE` | `lib/api/client.ts` | `number` (1000) | Seitengröße beim Nachladen ganzer Tabellen (PostgREST-Standardgrenze) | **nur intern** in `fetchPaged()` – darüber aber Basis aller `fetchX()`-Funktionen im ganzen `lib/api/`-Ordner |
| `qk` | `lib/queries/keys.ts` | Objekt aus Schlüssel-Funktionen | Alle Query-Schlüssel des Zwischenspeichers (TanStack Query) – ausschließlich hier gebildet | `lib/queries/hooks.ts` (alle Hooks), `app/page.tsx` (`neuLaden()`/`refreshX()`, rund 20 Stellen) |
| `DEFAULT_GEOCODE_REGION` | `lib/geocode.ts` (bis v105 `lib/helpers.ts`) | `string` ("Nürnberg, Deutschland") | Region, die an eine Adresse ohne erkennbaren Ort angehängt wird | **nur intern**, über `geocodeAnfrage()`/`geocodeAddress()` |
| `AUFTRAG_OFFLINE_FELDER` | `lib/offline/ausgang.ts` | `readonly string[]` | Felder am Auftrag, die offline geändert werden dürfen (F1, v101) | `aenderungen()` in `app/page.tsx` (`auftragsAbsicht`), `tests/offlineAusgang.test.ts` |
| `POSITION_OFFLINE_FELDER` | `lib/offline/ausgang.ts` | `readonly string[]` | Felder einer Leistung, die offline geändert werden dürfen | Typ `PositionFeld` |
| `RAD_OFFLINE_FELDER` | `lib/offline/ausgang.ts` | `readonly string[]` | Felder eines Rades, die offline gemessen werden dürfen | Typ `RadFeld` |
| `SATZ_OFFLINE_FELDER` | `lib/offline/ausgang.ts` | `readonly string[]` | Notizen am Satz, die offline geändert werden dürfen (Absicht „satz“, v115) | Typ `SatzFeld` |
| `FELD_TEXT` | `lib/offline/ausgang.ts` | `Record<string, string>` | Lesbare Feldnamen in der Konfliktanzeige | `AusgangFenster` |
| `VORRAT_TAGE_VORAUS` | `lib/queries/hooks.ts` | `number` (14) | So viele Tage voraus legt `useEinsatzVorrat()` die Fahrzeuge der offenen Aufträge aufs Gerät (Offline Runde 2, v113) | **nur intern** in `useEinsatzVorrat()` |
| `VORRAT_TAGE_ZURUECK` | `lib/queries/hooks.ts` | `number` (1) | Und so viele Tage zurück – gestern Liegengebliebenes | **nur intern** in `useEinsatzVorrat()` |
| `FREMDABFRAGE_ZU_VIEL` | `lib/fremdabfrage.ts` | `string` | Meldung, wenn die Abfragebremse der Adressdienste greift (B3, Migration 62) | `app/api/geocode/route.ts`, `app/api/adresse-suchen/route.ts` |

---

## Aktuell ungenutzt

| Konstante | Datei | Befund |
|---|---|---|
| – | – | Keine mehr. `GEO_GENAUIGKEIT_LABEL` stand hier bis v101 und ist entfernt (Fahrplan C2). |

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

## Fassung und Testkunden (26.09.2026)

| Konstante | Datei | Typ/Form | Bedeutung | Verwendet in |
|---|---|---|---|---|
| `APP_VERSION` | `lib/version.ts` | `string` ("v78") | Fassung des Programms; immer gleich `FASSUNG` in `public/sw.js` | `SettingsPanel`, `NeuigkeitenBlatt`, `app/page.tsx`, `tests/version.test.ts` |
| `NEUIGKEITEN` | `lib/version.ts` | `{ version, datum, titel, punkte[] }[]`, neueste zuerst | „Was gibt es Neues" je Fassung | `NeuigkeitenBlatt`, `neuigkeitenUngelesen()`, `tests/version.test.ts` |
| `TEST_PRAEFIX` | `lib/testkunde.ts` | `"T"` | Buchstabe vor Testauftragsnummern; dieselbe Regel in `public.auftrag_nr_text()` (Migration 60) | `auftragsNr()` und darüber alle Anzeigen einer Auftragsnummer |
