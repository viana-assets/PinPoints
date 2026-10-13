"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { Customer, Order, UserSettings } from "@/lib/types";
import { todayStr, nextOrder, effectiveColor, kundenMitTermin, type KundenZustand } from "@/lib/helpers";
import { MAP_STYLES, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, type MapStyleKey } from "@/lib/mapStyles";
import { buendeln, nadelTerminText, BUENDEL_BIS_ZOOM, BUENDEL_AUSWAHL_AB, type KartenPunkt, type TagesStation } from "@/lib/karte";
import { nadelHtml, stationHtml, buendelHtml, NADEL_MASS, KREIS_MASS, STATION_MASS } from "@/components/karte/nadel";

// Die Karte der Startseite (v144, Fahrplan C5 – der letzte große Block aus app/page.tsx, nach dem
// Muster von useLagerAktionen): Leaflet laden und einrichten, Kartenstil, Nadeln und Bündel im
// sichtbaren Ausschnitt, Tagesmodus mit Stationen und Wegen, Hervorheben und Wählen, die
// Kundenkarte an ihrer Nadel, „Mein Standort“. Der Code ist unverändert umgezogen; die Kommentare
// stehen, wo sie standen.
//
// Warum vieles in Refs liegt und nicht im Zustand: Leaflet ruft seine Handler außerhalb des
// React-Renderzyklus auf. Was dort gelesen wird, muss aktuell sein, ohne dass die Karte bei jedem
// Rendern neu aufgebaut wird (siehe `liveRef` in app/page.tsx).

// Höchstzahl gleichzeitig gezeichneter Kartenmarker. Leaflet legt je Marker ein DOM-Element an;
// bei mehreren tausend Kunden im Bild wird das Zoomen und Verschieben spürbar zäh. Es werden
// ohnehin nur Marker im sichtbaren Ausschnitt gezeichnet, und weit weg fasst die Karte seit v79
// zu Bündeln zusammen (BUENDEL_BIS_ZOOM, lib/karte.ts) – diese Grenze fängt nur noch den Fall
// ab, dass auf einer nahen Zoomstufe sehr viele Kunden dicht beieinander liegen.
const MAX_MARKER = 600;

function escapeHtml(str: string): string {
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] as string));
}

export type KartenAusschnitt = { nadeln: number; gebuendelt: number; buendel: number; ausgelassen: number };

export type KartenKontext = {
  loading: boolean;
  settings: UserSettings;
  customers: Customer[];
  orders: Order[];
  sichtbareZustaende: KundenZustand[];
  // Lebt in app/page.tsx, weil die Seite selbst ihn auch liest.
  liveRef: MutableRefObject<{ customers: Customer[]; orders: Order[]; settings: UserSettings; sichtbareZustaende: KundenZustand[]; kartenKundeId: string | null; tagStationId: string | null }>;
  kartenKundeId: string | null;
  tagStationId: string | null;
  positionSetzenZiel: { lat: number; lng: number; zoom: number } | null;
  positionSetzenRef: MutableRefObject<string | null>;
  setKartenKundeId: (id: string | null) => void;
  setTagStationId: (id: string | null) => void;
  setKartenAusschnitt: (f: (vorher: KartenAusschnitt) => KartenAusschnitt) => void;
  setFehler: (t: string | null) => void;
  setStandortSucht: (v: boolean) => void;
  positionAusKarteSpeichern: (kundenId: string, lat: number, lng: number) => Promise<void>;
};

export function useKarte(ctx: KartenKontext) {
  const {
    loading, settings, customers, orders, sichtbareZustaende, liveRef, kartenKundeId, tagStationId, positionSetzenZiel, positionSetzenRef,
    setKartenKundeId, setTagStationId, setKartenAusschnitt, setFehler, setStandortSucht, positionAusKarteSpeichern,
  } = ctx;

  // Welche Nadel ist gerade hervorgehoben? Als Ref und nicht als Zustand: Beim Überfahren der
  // Kundenliste soll NICHT die ganze Seite neu gezeichnet werden – es wird nur eine Klasse an
  // einem einzigen Kartenelement gesetzt. Bei 400 Zeilen ist das der Unterschied zwischen
  // „reagiert sofort" und „hakt".
  const hervorgehobeneNadelRef = useRef<string | null>(null);

  const mapDivRef = useRef<HTMLDivElement | null>(null);

  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const markerIndexRef = useRef<Record<string, any>>({});
  // Bündel (seit v79): die Bündelmarker und zu jedem gebündelten Kunden sein Bündel – damit das
  // Überfahren einer Listenzeile auch dann etwas zeigt, wenn der Kunde keine eigene Nadel hat.
  const buendelMarkerRef = useRef<any[]>([]);
  const buendelVonKundeRef = useRef<Record<string, any>>({});
  // Tagesmodus: eigene Schicht für Stationen und Linien, je Auftrag ein Marker.
  const tagLayerRef = useRef<any>(null);
  const tagIndexRef = useRef<Record<string, any>>({});
  const tagGezeichnetRef = useRef<unknown>(null);
  const standortRef = useRef<any>(null);
  const baseLayerRef = useRef<any>(null);
  const overlayLayerRef = useRef<any>(null);
  // Leaflet wird seit Roadmap-Phase 8 als npm-Paket dynamisch geladen (vorher ein <script>
  // von cdnjs ohne integrity-Attribut, siehe app/layout.tsx). Das Modul liegt hier statt in
  // window.L – bewusst als any typisiert, weil der Kartenstil-Schalter mit L.Control.extend
  // arbeitet; eine vollständige Typisierung der Karte ist ein eigener Schritt.
  const leafletRef = useRef<any>(null);

  // Getrennt von liveRef, weil die Menge erst weiter unten entsteht (sie hängt an den
  // gefilterten Terminen) – und syncMarkers läuft außerhalb des React-Renderzyklus.
  const terminKundenRef = useRef<Set<string> | null>(null);
  // Der Tag auf der Karte (Termine → Heute/Morgen), aus demselben Grund als Ref.
  const tagRef = useRef<{
    stationen: TagesStation[];
    wege: { punkte: [number, number][]; farbe: string }[];
    farbeVon: (s: TagesStation) => string | null;
  } | null>(null);

  // Auswahl auf der Karte: Nadel antippen → Kundenkarte, Station antippen → Station im Streifen.
  // Als Ref, weil die Marker ihre Klick-Handler einmal bekommen und danach außerhalb des
  // React-Renderzyklus leben (gleiche Technik wie liveRef). Gesetzt wird der Inhalt weiter unten
  // bei den Nadeln, wo platzFuerKarte steht.
  const kartenWahlRef = useRef<(kundenId: string) => void>(() => {});
  const tagWahlRef = useRef<(orderId: string) => void>(() => {});

  // Die Karte an den Startpunkt schieben – erst NACH dem Rendern, weil sie beim Wechsel von
  // einem Vollseiten-Reiter gerade erst eine Breite bekommt. invalidateSize() sagt Leaflet,
  // dass es sich neu vermessen soll; ohne das rechnet es mit der alten Größe (oder mit 0) und
  // der Ausschnitt sitzt daneben.
  useEffect(() => {
    if (!positionSetzenZiel) return;
    const t = setTimeout(() => {
      const karte = mapRef.current;
      if (!karte) return;
      karte.invalidateSize();
      karte.setView([positionSetzenZiel.lat, positionSetzenZiel.lng], positionSetzenZiel.zoom);
    }, 150);
    return () => clearTimeout(t);
  }, [positionSetzenZiel]);

  // Leaflet rechnet mit einer selbst gemerkten Containergröße weiter und merkt von sich aus
  // nicht, wenn sich die Box ändert. Genau dafür ist ein ResizeObserver da: er feuert, wenn
  // sich die Größe TATSÄCHLICH geändert hat – beim Wechsel zwischen Vollseiten-Modul und
  // normalem Tab, beim Verkleinern des Fensters, beim Öffnen der Entwicklerwerkzeuge, beim
  // Drehen des Handys – und sonst nie.
  //
  // Was hier vorher stand, war ein forceFullReflow(): das gesamte #app-Element kurz auf
  // display:none und zurück, dazu window.scrollTo(0,0) und ein invalidateSize() auf einem
  // 30-ms-Timer, angestoßen von vier globalen Listenern (resize, visibilitychange, pageshow,
  // focus), die nie wieder abgemeldet wurden. Das war der Versuch, ein Layout-Problem durch
  // Erzwingen von Neuberechnungen zu übertönen – mit zwei eigenen Fehlern: der Timer riet die
  // Wartezeit (war das Layout langsamer, maß Leaflet die falsche Breite), und weil sich
  // forceFullReflow den vorherigen Inline-display-Wert merkte, konnten zwei gleichzeitige
  // Aufrufe – beim Öffnen der Entwicklerwerkzeuge feuern resize, focus und visibilitychange
  // praktisch zeitgleich – am Ende display:none stehen lassen.
  useEffect(() => {
    const el = mapDivRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const beobachter = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
    });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [loading]);

  // Rückkehr aus dem Verlaufsspeicher (Zurück-Taste, Wischgeste): dabei ändert sich die
  // Containergröße nicht, der ResizeObserver feuert also nicht – Leaflet braucht hier trotzdem
  // einen Anstoß, weil der Browser die Seite aus einem eingefrorenen Zustand wiederherstellt.
  useEffect(() => {
    function beiRueckkehr(e: PageTransitionEvent) {
      if (e.persisted) mapRef.current?.invalidateSize({ animate: false });
    }
    window.addEventListener("pageshow", beiRueckkehr);
    return () => window.removeEventListener("pageshow", beiRueckkehr);
  }, []);

  // ---------------------------------------------------------------- Karte initialisieren
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    async function tryInit() {
      const L: any = (await import("leaflet")).default;
      if (cancelled) return;
      leafletRef.current = L;
      if (!mapDivRef.current) {
        setTimeout(tryInit, 60);
        return;
      }
      if (mapRef.current) return;
      // Ohne Leaflets eigene Zoomknöpfe: Zoom, Ebenen und Standort sitzen seit v79 als eine
      // Spalte rechts unten (components/karte/KartenBedienung.tsx), im Stil der übrigen Seiten.
      const map = L.map(mapDivRef.current, { zoomControl: false }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
      mapRef.current = map;
      markerLayerRef.current = L.layerGroup().addTo(map);
      tagLayerRef.current = L.layerGroup().addTo(map);
      applyMapStyle(settings.map_style as MapStyleKey);
      // Beim Verschieben und Zoomen die sichtbaren Marker neu bestimmen (Roadmap Phase 10).
      map.on("moveend", syncMarkers);
      map.on("zoomend", syncMarkers);
      // Punkt von Hand setzen (Migration 35). Der Handler liegt hier, weil die Karte genau
      // einmal entsteht; er tut nichts, solange kein Kunde darauf wartet.
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const kundenId = positionSetzenRef.current;
        if (!kundenId) return;
        void positionAusKarteSpeichern(kundenId, e.latlng.lat, e.latlng.lng);
      });
      // Auch nach einer Größenänderung neu bestimmen: kommt die Karte aus einem
      // Vollseiten-Modul zurück, ist der sichtbare Ausschnitt ein anderer als vorher.
      map.on("resize", syncMarkers);
      map.on("resize", () => tagAusrichten());
      // Ein Tipp auf eine freie Stelle der Karte schließt die Kundenkarte – wie ein Tipp neben
      // ein Auswahlblatt. Nadeln und Bedienflächen lösen diesen Klick nicht aus (siehe
      // kartenFlaecheSperren).
      map.on("click", () => {
        if (positionSetzenRef.current) return;
        setKartenKundeId(null);
        setTagStationId(null);
      });
      syncMarkers();
    }
    void tryInit();
    return () => { cancelled = true; };
  }, [loading]);

  function applyMapStyle(styleKey: MapStyleKey) {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const def = MAP_STYLES[styleKey] || MAP_STYLES.strasse;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    if (overlayLayerRef.current) { map.removeLayer(overlayLayerRef.current); overlayLayerRef.current = null; }
    baseLayerRef.current = L.tileLayer(def.baseUrl, { maxZoom: 19, attribution: def.baseAttr });
    baseLayerRef.current.addTo(map);
    baseLayerRef.current.bringToBack();
    if (def.overlayUrl) {
      overlayLayerRef.current = L.tileLayer(def.overlayUrl, { maxZoom: 19, attribution: def.overlayAttr });
      overlayLayerRef.current.addTo(map);
    }
  }
  useEffect(() => {
    if (mapRef.current) applyMapStyle(settings.map_style as MapStyleKey);
  }, [settings.map_style]);

  // Bedienflächen auf der Karte (Pillen, Knöpfe, Kundenkarte, Streifen) liegen IM
  // Kartencontainer – nur so sitzen sie am Rechner genau über der Kartenspalte. Leaflet greift
  // Zieh- und Zoomgesten aber am Container ab: Ohne diese Sperre verschöbe ein Wischen über
  // den Streifen die Karte, und ein Tipp auf einen Knopf zählte zusätzlich als Kartenklick und
  // schlösse die Kundenkarte gleich wieder.
  //
  // Bewusst von Hand statt über L.DomEvent: Die Flächen entstehen mit dem ersten Rendern, das
  // Leaflet-Modul wird erst danach nachgeladen. `_leaflet_disable_click` ist das Merkmal, an
  // dem Leaflet selbst seine Bedienelemente erkennt. `click` wird NICHT angehalten – daran
  // hängen die onClick-Handler von React.
  const kartenFlaecheSperren = useCallback((el: HTMLElement | null) => {
    const f = el as (HTMLElement & { _kartenGesperrt?: boolean; _leaflet_disable_click?: boolean }) | null;
    if (!f || f._kartenGesperrt) return;
    f._kartenGesperrt = true;
    f._leaflet_disable_click = true;
    const halt = (e: Event) => e.stopPropagation();
    for (const art of ["mousedown", "touchstart", "pointerdown", "dblclick", "contextmenu", "wheel"]) {
      f.addEventListener(art, halt, { passive: true });
    }
  }, []);

  // ---------------------------------------------------------------- Nadeln
  //
  // Seit v79 (Entwurf W) zeichnet eine Funktion alle Formen: components/karte/nadel.ts. Dieselbe
  // Funktion zeichnet die Legende – sie kann also nichts erklären, was es auf der Karte nicht gibt.
  function makeIcon(zustand: KundenZustand, ungefaehr: boolean, schild: string | null) {
    const L = leafletRef.current;
    if (zustand === "kein-interesse") {
      return L.divIcon({
        className: "custom-pin", html: nadelHtml(zustand, ungefaehr, schild),
        iconSize: [KREIS_MASS, KREIS_MASS], iconAnchor: [KREIS_MASS / 2, KREIS_MASS / 2],
      });
    }
    return L.divIcon({
      className: "custom-pin", html: nadelHtml(zustand, ungefaehr, schild),
      iconSize: [NADEL_MASS.breite, NADEL_MASS.hoehe], iconAnchor: [NADEL_MASS.breite / 2, NADEL_MASS.spitzeY],
    });
  }

  // Nadel zu einer Kundenzeile hervorheben. Greift bewusst direkt auf das Kartenelement zu,
  // statt über React zu gehen: Leaflet verwaltet diese Elemente selbst, und ein
  // Zustandswechsel je Mausbewegung wäre hier verschwendet.
  //
  // Hier stand bis zum 14.09.2026 eine Abfrage auf `(hover: hover)` – gedacht als Schutz davor,
  // dass am Handy nach einem Tipp eine Nadel hervorgehoben stehen bleibt. Sie hat die Funktion
  // auf einem Windows-Notebook MIT Touchscreen komplett abgeschaltet: Solche Geräte melden
  // `(hover: none)`, obwohl eine Maus daran hängt. Der Touch-Fall ist anders gelöst: Beim
  // Antippen einer Zeile wird die Hervorhebung ausdrücklich zurückgenommen.
  //
  // Seit v79: Steckt der Kunde in einem Bündel, wird das Bündel hervorgehoben.
  function nadelHervorheben(kundenId: string | null) {
    const vorher = hervorgehobeneNadelRef.current;
    if (vorher === kundenId) return;
    const element = (id: string) =>
      (markerIndexRef.current[id] ?? buendelVonKundeRef.current[id])?.getElement() as HTMLElement | undefined;
    if (vorher) element(vorher)?.classList.remove("pin-hervor");
    hervorgehobeneNadelRef.current = kundenId;
    if (kundenId) element(kundenId)?.classList.add("pin-hervor");
  }

  // Die Klassen einer Nadel neu setzen – nach setIcon() ist ihr Element ein neues.
  function nadelKlassen(kundenId: string, marker: any) {
    const el = marker.getElement() as HTMLElement | undefined;
    if (!el) return;
    el.classList.toggle("pin-hervor", hervorgehobeneNadelRef.current === kundenId);
    el.classList.toggle("pin-gewaehlt", liveRef.current.kartenKundeId === kundenId);
  }

  function kundenNadelnLeeren() {
    const schicht = markerLayerRef.current;
    Object.values(markerIndexRef.current).forEach((m) => schicht.removeLayer(m));
    markerIndexRef.current = {};
    buendelMarkerRef.current.forEach((m) => schicht.removeLayer(m));
    buendelMarkerRef.current = [];
    buendelVonKundeRef.current = {};
  }

  function syncMarkers() {
    const L = leafletRef.current;
    const karte = mapRef.current;
    if (!L || !karte || !markerLayerRef.current || !tagLayerRef.current) return;

    // Tagesmodus: statt des Kundenbestands die Stationen des Tages. Neu gezeichnet wird nur,
    // wenn sich der Tag geändert hat – beim Verschieben der Karte bleibt alles, wie es ist.
    const tag = tagRef.current;
    if (tag) {
      if (Object.keys(markerIndexRef.current).length || buendelMarkerRef.current.length) kundenNadelnLeeren();
      if (tagGezeichnetRef.current !== tag) tagZeichnen(L, tag);
      return;
    }
    if (tagGezeichnetRef.current) {
      tagLayerRef.current.clearLayers();
      tagIndexRef.current = {};
      tagGezeichnetRef.current = null;
    }

    const { customers: custs, orders: ords, settings: s, sichtbareZustaende: sichtbar } = liveRef.current;
    // Aus `ords` und nicht aus dem Render-Wert: Diese Funktion wird auch von Leaflet-Ereignissen
    // aufgerufen, die einmal registriert wurden. Ein dort eingefangener Wert von damals wäre
    // beim Verschieben der Karte längst veraltet – deshalb liest hier alles aus `liveRef`.
    const mitTerminLive = kundenMitTermin(ords);
    const heute = todayStr();
    // Nur zeichnen, was im Bild ist (Roadmap Phase 10). `pad` nimmt einen Rand mit, damit beim
    // Schieben nichts nachträglich aufpoppt.
    const grenzen = karte.getBounds().pad(0.25);
    const zoom = karte.getZoom();
    const nurTermine = terminKundenRef.current;

    const kandidaten: { cust: Customer; zustand: KundenZustand }[] = [];
    custs.forEach((cust) => {
      if (cust.active === false || cust.lat == null || cust.lng == null) return;
      if (!grenzen.contains([cust.lat, cust.lng])) return;
      // Ausgeblendete Zustände fallen VOR der Obergrenze raus: sonst würden unsichtbare Nadeln
      // das Kontingent aufbrauchen und der Hinweis zählte Kunden mit, die man nicht sehen will.
      const zustand = effectiveColor(cust, s.period_months, heute, mitTerminLive.has(cust.id));
      // Bei einer Auswahl (Termine, Saisonliste) gelten die Zustands-Pillen nicht: Die Auswahl
      // ist dort die Frage, und ein in „Kunden" ausgeblendetes „Termin" versteckte sonst genau
      // die Termine, die man sehen will (gemeldet 26.09.2026). Die Pillen stehen dort deshalb
      // auch gar nicht erst.
      if (!nurTermine && !sichtbar.includes(zustand)) return;
      // Im Reiter „Termine" bleiben alle Kunden ohne Termin im gewählten Zeitraum außen vor.
      if (nurTermine && !nurTermine.has(cust.id)) return;
      kandidaten.push({ cust, zustand });
    });

    // Weit weg: nahe Nadeln zu Bündeln zusammenfassen (lib/karte.ts, BUENDEL_BIS_ZOOM).
    let einzeln: Set<string> | null = null;
    let buendelListe: ReturnType<typeof buendeln>["buendel"] = [];
    if (zoom <= BUENDEL_BIS_ZOOM && (!nurTermine || kandidaten.length >= BUENDEL_AUSWAHL_AB)) {
      const punkte: KartenPunkt[] = kandidaten.map(({ cust, zustand }) => {
        const pt = karte.project([cust.lat, cust.lng], zoom);
        return { id: cust.id, x: pt.x, y: pt.y, zustand };
      });
      const r = buendeln(punkte);
      einzeln = new Set(r.einzeln);
      buendelListe = r.buendel;
    }

    let nadeln = 0;
    let ausgelassen = 0;
    const seen = new Set<string>();
    for (const { cust, zustand } of kandidaten) {
      if (einzeln && !einzeln.has(cust.id)) continue;
      if (nadeln >= MAX_MARKER) { ausgelassen++; continue; }
      nadeln++;
      seen.add(cust.id);
      const ungefaehr = cust.geo_genauigkeit === "ungefaehr";
      // Terminnadeln tragen ihr Schild: heute die Uhrzeit, sonst Tag (nadelTerminText).
      const naechster = zustand === "termin" ? nextOrder(ordersForLive(cust.id, ords)) : null;
      const schild = naechster ? nadelTerminText(naechster, heute) : null;
      const schluessel = `${zustand}|${ungefaehr}|${schild ?? ""}`;
      const tooltip = `<b>${escapeHtml(cust.company || cust.name)}</b><br>${escapeHtml(cust.address)}` +
        (ungefaehr ? "<br><i>Ungefähre Position – nur die Straße war auffindbar</i>" : "");
      // Rot und Termin liegen oben: Rot ist, was heute zu tun ist, der Termin, wo man hinfährt.
      const ebene = zustand === "termin" ? 400 : zustand === "red" ? 200 : 0;

      let marker = markerIndexRef.current[cust.id];
      if (marker) {
        // Nur bei geänderter Form neu setzen: setIcon baut das Element neu, und syncMarkers
        // läuft bei jedem Verschieben für jede Nadel im Bild.
        if (marker._pinSchluessel !== schluessel) {
          marker.setIcon(makeIcon(zustand, ungefaehr, schild));
          marker._pinSchluessel = schluessel;
        }
        marker.setLatLng([cust.lat, cust.lng]);
        marker.setZIndexOffset(ebene);
        marker.setTooltipContent(tooltip);
      } else {
        marker = L.marker([cust.lat, cust.lng], { icon: makeIcon(zustand, ungefaehr, schild), zIndexOffset: ebene, riseOnHover: true });
        marker._pinSchluessel = schluessel;
        marker.bindTooltip(tooltip, { className: "cust-tip", direction: "top", offset: [0, -30] });
        const id = cust.id;
        marker.on("click", () => { marker.closeTooltip(); kartenWahlRef.current(id); });
        marker.addTo(markerLayerRef.current);
        markerIndexRef.current[cust.id] = marker;
      }
      nadelKlassen(cust.id, marker);
    }
    Object.keys(markerIndexRef.current).forEach((id) => {
      if (!seen.has(id)) {
        markerLayerRef.current.removeLayer(markerIndexRef.current[id]);
        delete markerIndexRef.current[id];
      }
    });

    // Bündel werden jedes Mal neu gebaut – es sind wenige, und ihr Inhalt ändert sich mit
    // jedem Zoomschritt.
    buendelMarkerRef.current.forEach((m) => markerLayerRef.current.removeLayer(m));
    buendelMarkerRef.current = [];
    buendelVonKundeRef.current = {};
    let gebuendelt = 0;
    const koordinate = new Map(kandidaten.map(({ cust }) => [cust.id, [cust.lat as number, cust.lng as number] as [number, number]]));
    for (const b of buendelListe) {
      gebuendelt += b.ids.length;
      const { html, groesse } = buendelHtml(b.ids.length, b.anteile);
      const m = L.marker(karte.unproject([b.x, b.y], zoom), {
        icon: L.divIcon({ className: "custom-pin", html, iconSize: [groesse, groesse], iconAnchor: [groesse / 2, groesse / 2] }),
        zIndexOffset: 1000,
        title: `${b.ids.length} Kunden – antippen zum Heranzoomen`,
      });
      // Heranzoomen, bis das Bündel aufgeht – mindestens eine Stufe, sonst stünde man bei
      // Kunden in derselben Straße vor demselben Bündel.
      m.on("click", () => {
        const grenze = L.latLngBounds(b.ids.map((id) => koordinate.get(id)));
        const z = Math.max(Math.min(karte.getBoundsZoom(grenze, false, L.point(60, 60)), BUENDEL_BIS_ZOOM + 3), zoom + 1);
        karte.setView(grenze.getCenter(), z);
      });
      m.addTo(markerLayerRef.current);
      buendelMarkerRef.current.push(m);
      for (const id of b.ids) buendelVonKundeRef.current[id] = m;
      if (hervorgehobeneNadelRef.current && b.ids.includes(hervorgehobeneNadelRef.current)) m.getElement()?.classList.add("pin-hervor");
    }

    const neu = { nadeln, gebuendelt, buendel: buendelListe.length, ausgelassen };
    setKartenAusschnitt((vorher) =>
      vorher.nadeln === neu.nadeln && vorher.gebuendelt === neu.gebuendelt && vorher.buendel === neu.buendel && vorher.ausgelassen === neu.ausgelassen ? vorher : neu
    );
  }
  function ordersForLive(customerId: string, ords: Order[]) {
    return ords.filter((o) => o.customer_id === customerId);
  }
  useEffect(() => { syncMarkers(); }, [customers, orders, settings.period_months, sichtbareZustaende]);

  // Der Tag auf der Karte: nummerierte Stationen und je Mitarbeiter eine gestrichelte Luftlinie
  // (warum Luftlinie: lib/karte.ts, tagesWege).
  function tagZeichnen(L: any, tag: NonNullable<typeof tagRef.current>) {
    const schicht = tagLayerRef.current;
    schicht.clearLayers();
    tagIndexRef.current = {};
    for (const w of tag.wege) {
      L.polyline(w.punkte, { color: w.farbe, weight: 3, opacity: 0.85, dashArray: "6 8", lineCap: "round", interactive: false, className: "kt-weg" }).addTo(schicht);
    }
    for (const st of tag.stationen) {
      const m = L.marker([st.lat, st.lng], {
        icon: L.divIcon({
          className: "custom-pin", html: stationHtml(st.nr, st.phase, tag.farbeVon(st), st.zeit),
          iconSize: [STATION_MASS, STATION_MASS], iconAnchor: [STATION_MASS / 2, STATION_MASS / 2],
        }),
        zIndexOffset: st.phase === "laeuft" ? 800 : st.phase === "kommt" ? 400 : 0,
        title: `${st.nr}. ${st.zeit}`,
      });
      m.on("click", () => tagWahlRef.current(st.orderId));
      m.addTo(schicht);
      tagIndexRef.current[st.orderId] = m;
      if (liveRef.current.tagStationId === st.orderId) m.getElement()?.classList.add("pin-gewaehlt");
    }
    tagGezeichnetRef.current = tag;
  }


  // Die Karte auf das ausrichten, was sie gerade zeigen soll: im Tagesmodus die Stationen, in
  // „Termine" (7 Tage, Anstehend, Alle) und in der Saisonliste die Kunden der Auswahl. Bis v83
  // tat sie das nur im Tagesmodus – bei den übrigen Zeiträumen blieb der Ausschnitt, wo er
  // war, und lagen die Termine woanders, stand dort „Keine Kunden in diesem Ausschnitt"
  // (gemeldet 26.09.2026).
  //
  // Am Handy ist die Karte beim Wählen meist gar nicht zu sehen (die Liste liegt vorn) – ein
  // Container ohne Größe kann nichts einpassen. Dann bleibt der Auftrag liegen und wird beim
  // nächsten „resize" erledigt, also sobald die Karte aufgeht.
  const tagAusrichtenOffenRef = useRef(false);
  function tagAusrichten() {
    const karte = mapRef.current;
    const L = leafletRef.current;
    const tag = tagRef.current;
    if (!tagAusrichtenOffenRef.current || !karte || !L) return;
    const auswahl = terminKundenRef.current;
    const punkte: [number, number][] = tag
      ? tag.stationen.map((st) => [st.lat, st.lng])
      : auswahl
        ? liveRef.current.customers
          .filter((c) => auswahl.has(c.id) && c.lat != null && c.lng != null)
          .map((c) => [c.lat as number, c.lng as number])
        : [];
    if (punkte.length === 0) { tagAusrichtenOffenRef.current = false; return; }
    const g = karte.getSize();
    if (g.x < 50 || g.y < 50) return;
    tagAusrichtenOffenRef.current = false;
    karte.fitBounds(L.latLngBounds(punkte), tag
      ? { paddingTopLeft: [40, 150], paddingBottomRight: [80, 210], maxZoom: 15 }
      : { paddingTopLeft: [40, 150], paddingBottomRight: [80, 70], maxZoom: 15 });
  }

  kartenWahlRef.current = (kundenId) => {
    setTagStationId(null);
    setKartenKundeId(kundenId);
    platzFuerKarte(kundenId, false);
  };
  tagWahlRef.current = (orderId) => {
    setKartenKundeId(null);
    setTagStationId(orderId);
  };

  // Die gewählte Nadel trägt einen orangen Ring – dieselbe Markierung wie „gewählt" überall.
  useEffect(() => {
    Object.entries(markerIndexRef.current).forEach(([id, m]) => nadelKlassen(id, m));
  // Nur beim Wechsel der Auswahl; nadelKlassen liest selbst aus den Refs (wie in app/page.tsx bis v143).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kartenKundeId]);
  useEffect(() => {
    Object.entries(tagIndexRef.current).forEach(([id, m]) =>
      (m.getElement() as HTMLElement | undefined)?.classList.toggle("pin-gewaehlt", id === tagStationId));
    // Nur verschieben, wenn die Station nicht ohnehin frei im Bild steht – oben liegen die
    // Pillen, unten der Streifen.
    const karte = mapRef.current;
    const st = tagStationId ? tagIndexRef.current[tagStationId] : null;
    if (!karte || !st) return;
    const pt = karte.latLngToContainerPoint(st.getLatLng());
    const g = karte.getSize();
    if (pt.x < 40 || pt.x > g.x - 80 || pt.y < 140 || pt.y > g.y - 210) karte.panTo(st.getLatLng());
  }, [tagStationId]);

  // Die Kundenkarte braucht Platz: am Handy liegt das Blatt über der unteren Hälfte, am Rechner
  // hängt die Karte über der Nadel. Liegt die Nadel dort, wo gleich die Karte steht, rückt die
  // Karte ein Stück – nicht jedes Mal, sonst springt sie bei jedem Tipp.
  function platzFuerKarte(kundenId: string, heranzoomen: boolean) {
    const karte = mapRef.current;
    const k = liveRef.current.customers.find((c) => c.id === kundenId);
    if (!karte || k?.lat == null || k.lng == null) return;
    const ll: [number, number] = [k.lat, k.lng];
    if (heranzoomen) karte.setView(ll, Math.max(karte.getZoom(), 16), { animate: false });
    const pt = karte.latLngToContainerPoint(ll);
    const g = karte.getSize();
    // Eine Frage des Platzes, nicht des Geräts: unter 700 px Breite ist die Karte ein Blatt.
    const blatt = window.matchMedia("(max-width: 700px)").matches;
    let dx = 0;
    let dy = 0;
    if (blatt) {
      if (pt.y > g.y - 400 || pt.y < 150) dy = pt.y - g.y * 0.3;
    } else {
      if (pt.y < 330) dy = pt.y - 360;
      else if (pt.y > g.y - 30) dy = pt.y - (g.y - 80);
      if (pt.x < 190) dx = pt.x - 210;
      else if (pt.x > g.x - 190) dx = pt.x - (g.x - 210);
    }
    if (dx || dy) karte.panBy([dx, dy]);
  }

  // Die Kundenkarte am Rechner an ihre Nadel hängen und beim Verschieben mitnehmen. Über
  // CSS-Variablen statt über React-Zustand: Das Verschieben feuert je Bild, ein Neuzeichnen der
  // ganzen Seite dafür wäre verschwendet. Am Handy (Blatt) ignoriert das CSS die Werte.
  const kartenKarteRef = useRef<HTMLDivElement | null>(null);
  const kartenKundeLage = useMemo(() => {
    const k = kartenKundeId ? customers.find((c) => c.id === kartenKundeId) : null;
    return k?.lat != null && k.lng != null ? [k.lat, k.lng] as [number, number] : null;
  }, [kartenKundeId, customers]);
  useLayoutEffect(() => {
    const karte = mapRef.current;
    if (!karte || !kartenKundeLage) return;
    const setzen = () => {
      const el = kartenKarteRef.current;
      if (!el) return;
      const pt = karte.latLngToContainerPoint(kartenKundeLage);
      const g = karte.getSize();
      const halb = el.offsetWidth / 2 + 12;
      el.style.setProperty("--x", Math.min(Math.max(pt.x, halb), g.x - halb) + "px");
      el.style.setProperty("--y", pt.y + "px");
      // Kein Platz über der Nadel: dann darunter.
      el.classList.toggle("unten", pt.y - el.offsetHeight - 44 < 12);
    };
    setzen();
    karte.on("move zoomend viewreset resize", setzen);
    return () => { karte.off("move zoomend viewreset resize", setzen); };
  }, [kartenKundeLage]);

  // Mein Standort: einmal abfragen und als blauen Punkt zeigen. Der Standort bleibt im Gerät –
  // er wird nirgends gespeichert und nirgends hingeschickt.
  function standortZeigen() {
    const karte = mapRef.current;
    const L = leafletRef.current;
    if (!karte || !L) return;
    if (!navigator.geolocation) { setFehler("Dieses Gerät gibt keinen Standort heraus."); return; }
    setStandortSucht(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStandortSucht(false);
        const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        if (standortRef.current) standortRef.current.setLatLng(ll);
        else standortRef.current = L.circleMarker(ll, { radius: 8, weight: 3, fillOpacity: 1, interactive: false, className: "kt-standort-punkt" }).addTo(karte);
        karte.setView(ll, Math.max(karte.getZoom(), 15));
      },
      () => {
        setStandortSucht(false);
        setFehler("Der Standort ist nicht verfügbar – bitte im Browser die Standortfreigabe für den MR Assistent erlauben.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }


  return {
    mapDivRef, mapRef, leafletRef, terminKundenRef, tagRef, tagAusrichtenOffenRef, kartenKarteRef,
    syncMarkers, tagAusrichten, nadelHervorheben, kartenFlaecheSperren, standortZeigen, platzFuerKarte, applyMapStyle,
  };
}
