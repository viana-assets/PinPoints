import { useEffect, useRef, useState } from "react";
import type { Customer, Employee, Order } from "@/lib/types";
import { ORDER_STATUS_LABEL } from "@/lib/constants";
import { KALENDER_VON_STUNDE, KALENDER_BIS_STUNDE } from "@/lib/constants";
import { auftragsZeitraum, employeeColorFor, gezogenerTermin, hhmmAus, layoutSpalten, terminAusKlick, toDateStr, zeitfenster } from "@/lib/calendar";
import { kundeFuerAuftrag } from "@/lib/laufkunde";

// Tages- und Wochenansicht als Stundenraster (Block B).
//
// EINE Komponente für beide: Der Unterschied zwischen „ein Tag" und „sieben Tage" ist die
// Länge einer Liste, nicht eine andere Ansicht. Zwei Komponenten wären zwei Stellen, an denen
// man dieselbe Überlappungsrechnung ändern müsste – und eine davon vergisst man.
//
// DIE FARBREGEL, wie überall in dieser App:
//
//     Die FARBE trägt den Techniker, die FORM den Zustand.
//
// Ein Auftrag hat beides gleichzeitig – wer fährt, und wie weit er ist. Eine Farbe kann nur
// eine von beiden Fragen beantworten. Also: Farbe = Person (stabil je Mitarbeiter, dieselbe
// wie die Punkte im Monatskalender), Form = Zustand (erledigt blasser mit Haken, storniert
// schraffiert und durchgestrichen, noch niemandem zugeteilt grau und gestrichelt).
//
// Ein Techniker sieht hier ohnehin nur eigene Termine – das entscheidet nicht diese
// Komponente, sondern RLS (Migration 13/15): Fremde Aufträge kommen gar nicht erst an.

// Wie hoch eine Stunde im Raster ist. Das war eine Konstante; seit dem Zoom ist es ein
// Ausgangswert. Die Grenzen sind gemessen, nicht geraten: Unter 14 px passt keine Uhrzeit mehr
// an die Linie, über 120 px scrollt man für einen halben Tag.
const RASTER_STUNDE_STANDARD = 52;
const RASTER_STUNDE_MIN = 14;
const RASTER_STUNDE_MAX = 120;

export type RasterAuftrag = Order & { kunde: Customer | null; mitarbeiterIds: string[] };

function statusKlasse(status: string): string {
  return `tm-${status}`;
}

// Ein Termin im Raster. Absichtlich ein div mit role="button": In den Block passt bei kurzen
// Terminen kaum Text, und ein echter Knopf brächte eigene Innenabstände mit, die die Höhe
// verfälschen – die Höhe ist hier aber die Aussage.
function TerminBlock({ auftrag, employees, vonMinute, stundePx, onOeffnen, ziehbar, zieht, geradeGezogen }: {
  auftrag: RasterAuftrag & { start: number; ende: number; geschaetzt: boolean; spalte: number; spalten: number };
  employees: Employee[];
  vonMinute: number;
  stundePx: number;
  onOeffnen: (id: string) => void;
  // Darf dieser Termin gezogen werden (offen oder in Arbeit, und wer schaut, darf Aufträge
  // ändern)? Die Bewegung selbst steuert das Raster – der Block trägt nur die Angaben, die es
  // dafür braucht, als data-Attribute.
  ziehbar: boolean;
  zieht: boolean;
  // Ein Loslassen nach dem Ziehen löst im Browser oft noch einen Klick aus. Der darf den
  // Auftrag nicht öffnen – man wollte verschieben, nicht nachsehen.
  geradeGezogen: () => boolean;
}) {
  const hoehe = ((auftrag.ende - auftrag.start) / 60) * stundePx;
  const oben = ((auftrag.start - vonMinute) / 60) * stundePx;
  const breite = 100 / auftrag.spalten;
  const wer = auftrag.mitarbeiterIds;
  const farbe = wer.length > 0 ? employeeColorFor(employees, wer[0]) : null;
  const namen = wer.map((id) => employees.find((e) => e.id === id)?.name).filter(Boolean).join(", ");

  return (
    <div
      className={`tm-block ${statusKlasse(auftrag.status)}${farbe ? "" : " tm-ohne-person"}${auftrag.geschaetzt ? " tm-geschaetzt" : ""}${zieht ? " tm-zieht" : ""}`}
      role="button"
      tabIndex={0}
      data-ziehbar={ziehbar ? "1" : undefined}
      data-id={auftrag.id}
      data-datum={auftrag.order_date}
      data-start={auftrag.start}
      data-ende={auftrag.ende}
      data-geschaetzt={auftrag.geschaetzt ? "1" : undefined}
      // `stopPropagation`: Die Tagesspalte darunter legt bei einem Klick einen neuen Auftrag
      // an. Ohne das hier würde jeder Klick auf einen bestehenden Termin zusätzlich das
      // Fenster „Neuer Auftrag" aufziehen.
      onClick={(e) => { e.stopPropagation(); if (geradeGezogen()) return; onOeffnen(auftrag.id); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOeffnen(auftrag.id); } }}
      title={[
        `${hhmmAus(auftrag.start)}–${hhmmAus(auftrag.ende)}${auftrag.geschaetzt ? " (Ende angenommen)" : ""}`,
        auftrag.kunde?.name,
        auftrag.title,
        namen || "niemandem zugeteilt",
        ORDER_STATUS_LABEL[auftrag.status],
      ].filter(Boolean).join(" · ")}
      style={{
        // Position und Höhe MÜSSEN hier stehen: Sie sind kein Layoutstil, sondern die
        // gerechnete Aussage dieses einen Termins – seine Lage im Tag. Alles Übrige
        // (Farben, Formen, Abstände) steht im Stilblatt.
        top: `${oben}px`,
        height: `${Math.max(hoehe, 17)}px`,
        left: `${auftrag.spalte * breite}%`,
        width: `calc(${breite}% - 3px)`,
        // `backgroundColor` und NICHT `background`: Die Kurzform setzt `background-image`
        // mit zurück, und weil ein Stilattribut jede Regel schlägt, verschwand damit die
        // Schraffur des stornierten Termins – sichtbar war sie nur bei Aufträgen ohne
        // zugeteilte Person, wo hier gar keine Farbe steht. (Beim Umbenennen der Klasse am
        // 17.09.2026 aufgefallen.)
        ...(farbe ? { backgroundColor: farbe, borderColor: farbe } : {}),
      }}
    >
      <span className="tm-zeit">
        {hhmmAus(auftrag.start)}
        {/* Der Zustand als Zeichen, nicht als zweite Farbe. */}
        {auftrag.status === "in_arbeit" && <span aria-hidden="true"> ▶</span>}
        {auftrag.status === "erledigt" && <span aria-hidden="true"> ✓</span>}
        {auftrag.status === "storniert" && <span aria-hidden="true"> ✕</span>}
      </span>
      <span className="tm-wer">{auftrag.kunde?.name || auftrag.title}</span>
      {/* Die Unterkante zum Länger- und Kürzerziehen. Nur bei ziehbaren Terminen. */}
      {ziehbar && <span className="tm-griff" data-griff="ende" aria-hidden="true" />}
    </div>
  );
}

// Was während eines Zuges gemerkt wird. In einem Ref, nicht im Zustand: Die Listener hängen
// genau einmal am Raster (siehe die Zoomgeste) und lesen alles von hier.
type Zug = {
  id: string;
  modus: "verschieben" | "dauer";
  datum: string;          // Ausgangstag
  start: number;          // Ausgangslage in Minuten
  ende: number;
  geschaetzt: boolean;    // Ende nur angenommen – beim reinen Verschieben bleibt es das
  griffAbstand: number;   // Minuten zwischen Terminbeginn und Anfasspunkt
  x0: number; y0: number; // wo angefasst wurde
  x: number; y: number;   // wo der Zeiger jetzt ist
  aktiv: boolean;         // läuft der Zug schon (Maus: nach 4 px, Finger: nach langem Drücken)?
  timer: ReturnType<typeof setTimeout> | null;
  ziel: { datum: string; start: number; ende: number } | null;
};
// Wie lange der Finger liegen muss, bis ein Termin „anspringt". Kürzer verwechselt sich mit
// dem Scrollen, länger fühlt sich an, als passiere nichts. 400 ms ist, was Kalender am Handy
// üblicherweise nehmen.
const LANG_DRUECKEN_MS = 400;

export function Stundenraster({ tage, auftraege, customers, employees, orderEmployees, standardDauerMin, onOeffnen, onSlot, onVerschieben }: {
  // Ein Tag in der Tagesansicht, sieben in der Wochenansicht – sonst ändert sich nichts.
  tage: Date[];
  auftraege: Order[];
  customers: Customer[];
  employees: Employee[];
  orderEmployees: Record<string, string[]>;
  // Wie lang ein Termin ohne gepflegtes Ende gilt – das Terminraster aus den
  // Betriebseinstellungen (Migration 38). Kommt von außen, damit hier und im Auftragsfenster
  // dieselbe Zahl gilt: Sonst zeichnete der Kalender eine andere Dauer, als das Formular
  // vorschlägt.
  standardDauerMin: number;
  onOeffnen: (id: string) => void;
  // Klick in eine freie Stelle des Rasters: Datum und Uhrzeit des angeklickten Punktes.
  // `von`/`bis` sind null, wenn in die Leiste „ohne Uhrzeit" geklickt wurde – dann steht der
  // Tag fest und die Zeit noch nicht. Fehlt die Eigenschaft (Techniker-Ansicht), ist das
  // Raster nur zum Ansehen da.
  onSlot?: (datum: string, von: string | null, bis: string | null) => void;
  // Ein Termin wurde gezogen (25.09.2026). `bis` ist null, wenn nur verschoben wurde und das
  // Ende vorher schon nur angenommen war – dann bleibt es angenommen. Fehlt die Eigenschaft,
  // darf niemand ziehen.
  onVerschieben?: (id: string, datum: string, von: string, bis: string | null) => void;
}) {
  const heute = toDateStr(new Date());

  // Der laufende Zug fürs Zeichnen (Zustand) und für die Listener (Ref).
  const [zug, setZug] = useState<{ id: string; datum: string; start: number; ende: number } | null>(null);
  const zugRef = useRef<Zug | null>(null);
  // Kurz nach einem Zug gesperrt: Der Klick, den der Browser beim Loslassen noch schickt,
  // soll weder den Auftrag öffnen noch einen neuen anlegen.
  const klickSperreRef = useRef(false);
  const geradeGezogen = () => klickSperreRef.current;

  // Wie hoch eine Stunde gerade ist. Zwei Finger auf dem Touchgerät, Strg+Rad am Rechner,
  // und zwei Knöpfe für alle, die weder das eine noch das andere haben.
  const [stundePx, setStundePx] = useState(RASTER_STUNDE_STANDARD);
  const leibRef = useRef<HTMLDivElement | null>(null);

  // Der laufende Zoom: Fingerabstand und Stundenhöhe beim Aufsetzen.
  //
  // WARUM EIN REF UND KEINE NORMALEN VARIABLEN: Die erste Fassung hielt beides in
  // Variablen INNERHALB des Effekts und führte `stundePx` in der Abhängigkeitsliste.
  // Damit wurde der Effekt bei jeder Zoomänderung abgeräumt und neu aufgebaut – und die
  // Variablen fingen bei null wieder an. Die Folge am Handy: Man zieht die Finger
  // auseinander, es springt EINMAL ein Stück, und danach passiert nichts mehr, weil die
  // neue `bewegung()` einen Startabstand von 0 vorfindet und sofort aussteigt. Ein
  // `touchstart` kommt nicht mehr, die Finger liegen ja schon auf. Man musste zwanzigmal
  // neu aufsetzen statt einmal zu ziehen.
  //
  // Ein Ref überlebt das Rendern. Und weil die Listener nichts mehr aus dem Zustand lesen,
  // hängt der Effekt an nichts mehr und wird genau einmal aufgebaut.
  // `klickSchlucken`: Manche Browser schicken nach einer Zwei-Finger-Geste trotzdem noch ein
  // `click` hinterher. Ohne diese Sperre legte ein Zoomvorgang am Handy einen Auftrag an.
  // Geschluckt wird GENAU EIN Klick, und ein neues Antippen mit einem Finger hebt die Sperre
  // ohnehin auf – eine Sperre, die liegen bleibt, wäre schlimmer als der Klick, den sie
  // verhindern soll.
  const gesteRef = useRef({ startAbstand: 0, startHoehe: RASTER_STUNDE_STANDARD, klickSchlucken: false });
  // Spiegelt den Zustand für `anfang()`, das die Höhe beim Aufsetzen braucht. Eigener kleiner
  // Effekt, damit die Listener davon unberührt bleiben.
  const hoeheRef = useRef(stundePx);
  useEffect(() => { hoeheRef.current = stundePx; }, [stundePx]);

  function inGrenzen(h: number): number {
    return Math.max(RASTER_STUNDE_MIN, Math.min(RASTER_STUNDE_MAX, h));
  }
  function zoomen(faktor: number) {
    setStundePx((h) => inGrenzen(h * faktor));
  }

  // Native Listener statt onWheel/onTouchMove: React hängt diese Ereignisse passiv ein, und
  // ein passiver Listener darf `preventDefault()` nicht aufrufen. Ohne das zoomt statt des
  // Rasters die ganze Seite – am Handy besonders unangenehm, weil man danach erst wieder
  // herausfinden muss, wie man die Seite zurückbekommt.
  useEffect(() => {
    const leib = leibRef.current;
    if (!leib) return;

    function rad(e: WheelEvent) {
      // Nur mit Strg bzw. der Trackpad-Zwei-Finger-Geste (die der Browser als Strg+Rad
      // meldet). Ohne diese Bedingung könnte man nicht mehr normal scrollen.
      if (!e.ctrlKey) return;
      e.preventDefault();
      setStundePx((h) => inGrenzen(h * (e.deltaY > 0 ? 0.92 : 1.08)));
    }

    function abstand(e: TouchEvent): number {
      const [a, b] = [e.touches[0], e.touches[1]];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    function anfang(e: TouchEvent) {
      // Ein bewusstes Antippen mit einem Finger hebt eine noch liegende Sperre auf.
      if (e.touches.length === 1) gesteRef.current.klickSchlucken = false;
      if (e.touches.length !== 2) return;
      // Auch hier schon abwehren: Safari entscheidet früh, ob die Geste der Seite gehört.
      e.preventDefault();
      gesteRef.current = { ...gesteRef.current, startAbstand: abstand(e), startHoehe: hoeheRef.current };
    }
    function bewegung(e: TouchEvent) {
      const g = gesteRef.current;
      if (e.touches.length !== 2 || g.startAbstand === 0) return;
      e.preventDefault();
      setStundePx(inGrenzen(g.startHoehe * (abstand(e) / g.startAbstand)));
    }
    function ende(e: TouchEvent) {
      // Erst wenn weniger als zwei Finger liegen, ist die Geste vorbei. Hebt jemand einen
      // Finger und setzt ihn wieder auf, soll nicht mitten im Ziehen neu gerechnet werden.
      if (e.touches.length < 2) {
        if (gesteRef.current.startAbstand !== 0) gesteRef.current.klickSchlucken = true;
        gesteRef.current.startAbstand = 0;
      }
    }
    // Safari auf dem iPhone meldet eine Zwei-Finger-Geste ZUSÄTZLICH als `gesture*` und
    // zoomt sonst die ganze Seite, auch wenn die Touch-Ereignisse abgewehrt sind.
    function gesteAbwehren(e: Event) { e.preventDefault(); }

    leib.addEventListener("wheel", rad, { passive: false });
    leib.addEventListener("touchstart", anfang, { passive: false });
    leib.addEventListener("touchmove", bewegung, { passive: false });
    leib.addEventListener("touchend", ende);
    leib.addEventListener("touchcancel", ende);
    leib.addEventListener("gesturestart", gesteAbwehren);
    leib.addEventListener("gesturechange", gesteAbwehren);
    return () => {
      leib.removeEventListener("wheel", rad);
      leib.removeEventListener("touchstart", anfang);
      leib.removeEventListener("touchmove", bewegung);
      leib.removeEventListener("touchend", ende);
      leib.removeEventListener("touchcancel", ende);
      leib.removeEventListener("gesturestart", gesteAbwehren);
      leib.removeEventListener("gesturechange", gesteAbwehren);
    };
    // Leere Liste, und das ist der Punkt: Die Listener lesen nichts aus dem Zustand, sondern
    // alles aus Refs. Ein Effekt, der sich während einer laufenden Geste neu aufbaut, bricht
    // die Geste ab – siehe der Kommentar bei `gesteRef`.
  }, []);

  // ---------------------------------------------------------------- Termine ziehen
  //
  // Maus: anfassen und ziehen (ab 4 px Bewegung), unten an der Kante für die Dauer.
  // Finger: LANG DRÜCKEN, dann ziehen. Ohne das langes Drücken wäre jedes Scrollen über einen
  // Termin ein Verschieben – und der Kalender am Handy besteht fast nur aus Terminen.
  //
  // Wie beim Zoomen hängen die Listener nativ und genau einmal am Raster und lesen alles aus
  // Refs. Der Grund ist derselbe: Nur ein nicht-passiver `touchmove` darf das Scrollen der
  // Seite anhalten, und ein Effekt, der sich mitten im Zug neu aufbaut, bricht ihn ab.
  const liveRef = useRef({ stundePx, vonMinute: 0, onVerschieben });
  useEffect(() => {
    const leib = leibRef.current;
    if (!leib) return;
    // Der Takt fürs Weiterrollen am Rand (siehe `randRollen`).
    const rollen: { id: ReturnType<typeof setInterval> | null } = { id: null };

    function spalteBei(x: number): { datum: string; top: number } | null {
      for (const el of Array.from(leib!.querySelectorAll<HTMLElement>(".rl-tag"))) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x < r.right) return { datum: el.dataset.datum || "", top: r.top };
      }
      return null;
    }
    function spalteVon(datum: string): { datum: string; top: number } | null {
      const el = leib!.querySelector<HTMLElement>(`.rl-tag[data-datum="${datum}"]`);
      return el ? { datum, top: el.getBoundingClientRect().top } : null;
    }
    function minuteBei(y: number, top: number): number {
      const { stundePx: px, vonMinute: von } = liveRef.current;
      return von + ((y - top) / px) * 60;
    }

    function beginnen(ziel: EventTarget | null, x: number, y: number): boolean {
      const el = (ziel as Element | null)?.closest?.<HTMLElement>('.tm-block[data-ziehbar="1"]');
      if (!el || !liveRef.current.onVerschieben) return false;
      const start = Number(el.dataset.start);
      const ende = Number(el.dataset.ende);
      const datum = el.dataset.datum || "";
      const spalte = spalteVon(datum);
      zugRef.current = {
        id: el.dataset.id || "",
        modus: (ziel as Element).closest?.("[data-griff]") ? "dauer" : "verschieben",
        datum, start, ende, geschaetzt: el.dataset.geschaetzt === "1",
        griffAbstand: spalte ? minuteBei(y, spalte.top) - start : 0,
        x0: x, y0: y, x, y, aktiv: false, timer: null, ziel: null,
      };
      return true;
    }
    function aktivieren() {
      const z = zugRef.current;
      if (!z) return;
      z.aktiv = true;
      setZug({ id: z.id, datum: z.datum, start: z.start, ende: z.ende });
      // Kurzes Brummen am Handy: Jetzt hängt der Termin am Finger.
      try { navigator.vibrate?.(12); } catch { /* nicht jedes Gerät kann das */ }
      rollen.id = setInterval(randRollen, 40);
    }
    function bewegen(x: number, y: number) {
      const z = zugRef.current;
      if (!z || !z.aktiv) return;
      z.x = x; z.y = y;
      const spalte = (z.modus === "verschieben" ? spalteBei(x) : null) ?? spalteVon(z.ziel?.datum ?? z.datum);
      if (!spalte) return;
      const neu = gezogenerTermin(z.modus, minuteBei(y, spalte.top), z.griffAbstand, z.start, z.ende);
      const datum = z.modus === "verschieben" ? spalte.datum : z.datum;
      if (z.ziel && z.ziel.datum === datum && z.ziel.start === neu.start && z.ziel.ende === neu.ende) return;
      z.ziel = { datum, ...neu };
      setZug({ id: z.id, datum, start: neu.start, ende: neu.ende });
    }
    function beenden(abbrechen: boolean) {
      const z = zugRef.current;
      zugRef.current = null;
      if (!z) return;
      if (z.timer) clearTimeout(z.timer);
      if (rollen.id) { clearInterval(rollen.id); rollen.id = null; }
      if (!z.aktiv) return;
      klickSperreRef.current = true;
      setTimeout(() => { klickSperreRef.current = false; }, 450);
      setZug(null);
      const ziel = z.ziel;
      if (abbrechen || !ziel) return;
      if (ziel.datum === z.datum && ziel.start === z.start && ziel.ende === z.ende) return;
      // Nur verschoben und das Ende war bisher angenommen: Es bleibt angenommen (null).
      const bis = z.modus === "verschieben" && z.geschaetzt ? null : hhmmAus(ziel.ende);
      liveRef.current.onVerschieben?.(z.id, ziel.datum, hhmmAus(ziel.start), bis);
    }

    // Am Rand weiterrollen: Am Handy passt kaum ein halber Tag auf den Bildschirm. Liegt der
    // Finger unten oder oben an, rollt die Seite nach; in der Woche auch zur Seite.
    function randRollen() {
      const z = zugRef.current;
      if (!z || !z.aktiv) return;
      const flaeche = leib!.closest<HTMLElement>(".tabpanel");
      if (flaeche) {
        const r = flaeche.getBoundingClientRect();
        const leiste = flaeche.querySelector<HTMLElement>(".planung-leiste")?.getBoundingClientRect().bottom ?? r.top;
        if (z.y < leiste + 36) flaeche.scrollTop -= 10;
        else if (z.y > r.bottom - 48) flaeche.scrollTop += 10;
      }
      const woche = leib!.closest<HTMLElement>(".raster-woche");
      if (woche && woche.scrollWidth > woche.clientWidth) {
        const r = woche.getBoundingClientRect();
        if (z.x > r.right - 28) woche.scrollLeft += 10;
        else if (z.x < r.left + 70) woche.scrollLeft -= 10;
      }
      bewegen(z.x, z.y);
    }

    // --- Finger
    //
    // Bewegung und Loslassen hängen am BERÜHRTEN ELEMENT, nicht am Raster: Zieht man einen
    // Termin auf einen anderen Tag, baut React ihn in der anderen Spalte neu auf und nimmt den
    // alten Knoten aus dem Dokument. Die Touch-Ereignisse gehen aber weiter an genau diesen
    // alten Knoten – und von einem abgehängten Knoten steigt nichts mehr zum Raster auf. Der
    // Termin bliebe mitten im Zug am Finger kleben.
    let beruehrt: EventTarget | null = null;
    function fingerLos() {
      if (!beruehrt) return;
      beruehrt.removeEventListener("touchmove", fingerZieht as EventListener);
      beruehrt.removeEventListener("touchend", fingerAb as EventListener);
      beruehrt.removeEventListener("touchcancel", fingerAb as EventListener);
      beruehrt = null;
    }
    function fingerAuf(e: TouchEvent) {
      if (e.touches.length !== 1) { fingerLos(); beenden(true); return; }
      const t = e.touches[0];
      if (!beginnen(e.target, t.clientX, t.clientY)) return;
      zugRef.current!.timer = setTimeout(aktivieren, LANG_DRUECKEN_MS);
      fingerLos();
      beruehrt = e.target;
      beruehrt?.addEventListener("touchmove", fingerZieht as EventListener, { passive: false });
      beruehrt?.addEventListener("touchend", fingerAb as EventListener, { passive: false });
      beruehrt?.addEventListener("touchcancel", fingerAb as EventListener, { passive: false });
    }
    function fingerZieht(e: TouchEvent) {
      const z = zugRef.current;
      if (!z) return;
      const t = e.touches[0];
      if (!z.aktiv) {
        // Bewegt sich der Finger vor Ablauf der Zeit, ist es Scrollen – dann nichts tun.
        if (Math.hypot(t.clientX - z.x0, t.clientY - z.y0) > 8) { fingerLos(); beenden(true); }
        return;
      }
      e.preventDefault();
      bewegen(t.clientX, t.clientY);
    }
    function fingerAb(e: TouchEvent) {
      const z = zugRef.current;
      if (!z) return;
      // Nach einem Zug kein Klick hinterher (der sonst den Auftrag öffnete).
      if (z.aktiv && e.cancelable) e.preventDefault();
      fingerLos();
      beenden(e.type === "touchcancel");
    }
    // Das Kontextmenü beim langen Drücken (Android) würde den Zug unterbrechen.
    function kontextmenue(e: Event) {
      if (zugRef.current) e.preventDefault();
    }

    // --- Maus
    function mausAuf(e: PointerEvent) {
      if (e.pointerType === "touch" || e.button !== 0) return;
      if (!beginnen(e.target, e.clientX, e.clientY)) return;
      e.preventDefault(); // keine Textmarkierung beim Ziehen
      window.addEventListener("pointermove", mausZieht);
      window.addEventListener("pointerup", mausAb);
      window.addEventListener("keydown", taste);
    }
    function mausZieht(e: PointerEvent) {
      const z = zugRef.current;
      if (!z) return;
      if (!z.aktiv) {
        if (Math.hypot(e.clientX - z.x0, e.clientY - z.y0) < 4) return;
        aktivieren();
      }
      bewegen(e.clientX, e.clientY);
    }
    function mausLos() {
      window.removeEventListener("pointermove", mausZieht);
      window.removeEventListener("pointerup", mausAb);
      window.removeEventListener("keydown", taste);
    }
    function mausAb() { mausLos(); beenden(false); }
    function taste(e: KeyboardEvent) {
      if (e.key === "Escape") { mausLos(); beenden(true); }
    }

    leib.addEventListener("touchstart", fingerAuf, { passive: true });
    leib.addEventListener("contextmenu", kontextmenue);
    leib.addEventListener("pointerdown", mausAuf);
    return () => {
      leib.removeEventListener("touchstart", fingerAuf);
      leib.removeEventListener("contextmenu", kontextmenue);
      fingerLos();
      leib.removeEventListener("pointerdown", mausAuf);
      mausLos();
      if (rollen.id) clearInterval(rollen.id);
    };
  }, []);

  // Aufträge je Tag, getrennt nach „hat eine Uhrzeit" und „hat keine".
  // Während eines Zuges steht der Termin schon dort, wo er landen würde – das IST die
  // Vorschau. Kein Geisterbild daneben: Die Überlappungsspalten rechnen sich live mit.
  const gezeigt = zug
    ? auftraege.map((o) => (o.id === zug.id
      ? { ...o, order_date: zug.datum, time: hhmmAus(zug.start), end_time: hhmmAus(zug.ende) }
      : o))
    : auftraege;
  const proTag = tage.map((tag) => {
    const datum = toDateStr(tag);
    const desTages = gezeigt.filter((o) => o.order_date === datum);
    const mitZeit: (RasterAuftrag & { start: number; ende: number; geschaetzt: boolean })[] = [];
    const ohneZeit: RasterAuftrag[] = [];

    for (const o of desTages) {
      const angereichert: RasterAuftrag = {
        ...o,
        // Bei der Laufkundschaft der eingetragene Laufkunde (Migration 57, lib/laufkunde.ts).
        kunde: kundeFuerAuftrag(o, customers) ?? null,
        mitarbeiterIds: orderEmployees[o.id] ?? [],
      };
      const zeitraum = auftragsZeitraum(o, standardDauerMin);
      if (zeitraum) mitZeit.push({ ...angereichert, ...zeitraum });
      else ohneZeit.push(angereichert);
    }
    return { tag, datum, mitZeit: layoutSpalten(mitZeit), ohneZeit };
  });

  // EIN Zeitfenster für alle gezeigten Tage. In der Woche müssen die Stundenlinien über alle
  // sieben Spalten auf derselben Höhe liegen – sonst vergleicht man Äpfel mit Birnen.
  const { vonStunde: natVon, bisStunde: natBis } = zeitfenster(
    proTag.flatMap((t) => t.mitZeit),
    KALENDER_VON_STUNDE,
    KALENDER_BIS_STUNDE
  );

  // Herauszoomen tut ZWEI Dinge auf einmal, und das ist Absicht: Die Stunden werden flacher
  // UND das gezeigte Fenster wird weiter, bis am Ende der ganze Tag von 0 bis 24 Uhr dasteht.
  // Nur flacher zu werden brächte nichts – man sähe dieselben elf Stunden, nur gequetscht.
  // Nur weiter zu werden auch nicht – es passte nicht mehr aufs Bild.
  //
  // Gleitend statt in Stufen: Ein Sprung von „7–18 Uhr" auf „0–24 Uhr" bei einem bestimmten
  // Zoomwert sähe aus, als wäre etwas kaputtgegangen.
  const spanne = Math.max(0, Math.min(1,
    (RASTER_STUNDE_STANDARD - stundePx) / (RASTER_STUNDE_STANDARD - RASTER_STUNDE_MIN)
  ));
  const vonStunde = Math.round(natVon - natVon * spanne);
  const bisStunde = Math.round(natBis + (24 - natBis) * spanne);

  const stunden = Array.from({ length: bisStunde - vonStunde }, (_, i) => vonStunde + i);
  const vonMinute = vonStunde * 60;
  const gesamtHoehe = stunden.length * stundePx;
  // Was die Zug-Listener brauchen, nach jedem Rendern frisch – sie selbst werden nie neu gebaut.
  useEffect(() => { liveRef.current = { stundePx, vonMinute, onVerschieben }; });

  // Klick auf eine freie Stelle der Tagesspalte: Aus der Höhe wird die Uhrzeit.
  //
  // Gemessen wird gegen die Spalte selbst (`getBoundingClientRect`) und NICHT über
  // `nativeEvent.offsetY`: Letzteres ist relativ zum getroffenen Element, und getroffen wird
  // fast immer eine der Stundenlinien – der Wert wäre dann die Position innerhalb dieser einen
  // Linie, also höchstens eine Stunde. Ein Fehler, der nur beim Klick in die obere Hälfte des
  // Tages nicht auffällt.
  function slotKlick(e: React.MouseEvent<HTMLDivElement>, datum: string) {
    if (!onSlot) return;
    if (gesteRef.current.klickSchlucken) { gesteRef.current.klickSchlucken = false; return; }
    // Nach einem Zug kommt oft noch ein Klick auf der Spalte an – er darf kein „Neuer Auftrag"
    // werden.
    if (geradeGezogen()) return;
    const kasten = e.currentTarget.getBoundingClientRect();
    const { von, bis } = terminAusKlick(e.clientY - kasten.top, stundePx, vonMinute, standardDauerMin);
    onSlot(datum, von, bis);
  }

  // Bei flachen Stunden steht nicht mehr an jeder Linie eine Uhrzeit – sie überlappen sich
  // sonst. Ab 14 px nur noch jede vierte, ab 24 px jede zweite.
  const beschriftungJede = stundePx < 20 ? 4 : stundePx < 34 ? 2 : 1;

  // Aufträge ohne Uhrzeit dürfen nicht verschwinden. Sie ins Raster zu setzen ginge nur mit
  // einer erfundenen Zeit; sie wegzulassen hieße, dass ein Auftrag im Kalender fehlt, den es
  // gibt. Also eine eigene Leiste darüber, sichtbar und als Lücke erkennbar.
  const ohneZeitGesamt = proTag.reduce((n, t) => n + t.ohneZeit.length, 0);

  return (
    <div className={"raster" + (tage.length > 1 ? " raster-woche" : " raster-tag")}>
      <div className="raster-kopf">
        {/* Die Knöpfe stehen in der Stundenspalte, also dort, was sie verändern. Sie sind
            nicht der bequemste Weg – das sind zwei Finger –, aber der einzige, den eine Maus
            hat. */}
        <div className="rk-spalte-zeit raster-zoom">
          <button type="button" title="Stunden flacher – zeigt mehr vom Tag"
            disabled={stundePx <= RASTER_STUNDE_MIN + 0.01} onClick={() => zoomen(1 / 1.25)}>−</button>
          <button type="button" title="Stunden höher"
            disabled={stundePx >= RASTER_STUNDE_MAX - 0.01} onClick={() => zoomen(1.25)}>+</button>
        </div>
        {proTag.map(({ tag, datum }) => (
          <div key={datum} className={"rk-tag" + (datum === heute ? " ist-heute" : "")}>
            <span className="rk-wochentag">{tag.toLocaleDateString("de-DE", { weekday: "short" })}</span>
            <span className="rk-datum">{tag.getDate()}.{tag.getMonth() + 1}.</span>
          </div>
        ))}
      </div>

      {/* Die Leiste steht jetzt IMMER da und nicht mehr nur, wenn etwas drin ist. Grund: Sie
          ist seit dem Kalender-Klick auch eine Fläche zum Anlegen – ein Termin, bei dem der
          Tag feststeht und die Uhrzeit noch nicht. Eine Fläche, die nur erscheint, wenn schon
          etwas darin liegt, kann man nicht benutzen, um das erste hineinzulegen. */}
      {(ohneZeitGesamt > 0 || !!onSlot) && (
        <div className="raster-ohnezeit">
          <div className="rk-spalte-zeit">ohne Uhrzeit</div>
          {proTag.map(({ datum, ohneZeit }) => (
            <div
              key={datum}
              className={"roz-tag" + (onSlot ? " roz-anlegbar" : "")}
              title={onSlot ? "Klicken: Auftrag an diesem Tag, ohne feste Uhrzeit" : undefined}
              onClick={onSlot ? () => onSlot(datum, null, null) : undefined}
            >
              {ohneZeit.map((o) => (
                <button
                  key={o.id} type="button" className="roz-chip"
                  title={`${o.kunde?.name || o.title} – keine Uhrzeit gepflegt`}
                  onClick={(e) => { e.stopPropagation(); onOeffnen(o.id); }}
                >
                  {o.kunde?.name || o.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="raster-leib" ref={leibRef} style={{ height: `${gesamtHoehe}px` }}>
        <div className="rk-spalte-zeit rl-stunden">
          {stunden.map((h) => (
            <div key={h} className="rl-stunde" style={{ height: `${stundePx}px` }}>
              {h % beschriftungJede === 0 && <span>{String(h).padStart(2, "0")}:00</span>}
            </div>
          ))}
        </div>
        {proTag.map(({ datum, mitZeit }) => (
          <div
            key={datum}
            data-datum={datum}
            className={"rl-tag" + (datum === heute ? " ist-heute" : "") + (onSlot ? " rl-anlegbar" : "")}
            title={onSlot ? "Klicken: neuer Auftrag zu dieser Uhrzeit" : undefined}
            onClick={onSlot ? (e) => slotKlick(e, datum) : undefined}
          >
            {stunden.map((h) => (
              <div key={h} className="rl-linie" style={{ height: `${stundePx}px` }} />
            ))}
            {mitZeit.map((a) => (
              <TerminBlock
                key={a.id} auftrag={a} employees={employees}
                vonMinute={vonMinute} stundePx={stundePx} onOeffnen={onOeffnen}
                ziehbar={!!onVerschieben && (a.status === "offen" || a.status === "in_arbeit")}
                zieht={zug?.id === a.id}
                geradeGezogen={geradeGezogen}
              />
            ))}
          </div>
        ))}
      </div>

      {proTag.every((t) => t.mitZeit.length === 0 && t.ohneZeit.length === 0) && (
        <div className="empty">Keine Aufträge in diesem Zeitraum.</div>
      )}
    </div>
  );
}

// Legende. Sie erklärt die eine Sache, die man nicht erraten kann – dass die Farbe die Person
// meint und nicht den Zustand.
export function RasterLegende({ employees, sichtbareIds, ziehen = false }: {
  employees: Employee[];
  sichtbareIds: string[];
  // Dürfen Termine gezogen werden? Dann sagt die Legende, wie – am Handy errät man das
  // lange Drücken nicht.
  ziehen?: boolean;
}) {
  const gezeigt = employees.filter((e) => sichtbareIds.includes(e.id));
  return (
    <div className="raster-legende">
      {gezeigt.map((e) => (
        <span key={e.id}>
          <i style={{ background: employeeColorFor(employees, e.id) }} /> {e.name}
        </span>
      ))}
      <span><i className="leg-ohne" /> niemandem zugeteilt</span>
      <span className="rl-form">Form: ▶ in Arbeit · ✓ erledigt · ✕ storniert · gestricheltes Ende = angenommen</span>
      {ziehen && (
        <span className="rl-form">Verschieben: Termin ziehen (am Handy lange drücken) · Dauer: an der Unterkante ziehen</span>
      )}
    </div>
  );
}
