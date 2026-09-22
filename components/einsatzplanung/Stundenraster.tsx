import { useEffect, useRef, useState } from "react";
import type { Customer, Employee, Order } from "@/lib/types";
import { ORDER_STATUS_LABEL } from "@/lib/constants";
import { KALENDER_VON_STUNDE, KALENDER_BIS_STUNDE } from "@/lib/constants";
import { auftragsZeitraum, employeeColorFor, hhmmAus, layoutSpalten, terminAusKlick, toDateStr, zeitfenster } from "@/lib/calendar";

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
function TerminBlock({ auftrag, employees, vonMinute, stundePx, onOeffnen }: {
  auftrag: RasterAuftrag & { start: number; ende: number; geschaetzt: boolean; spalte: number; spalten: number };
  employees: Employee[];
  vonMinute: number;
  stundePx: number;
  onOeffnen: (id: string) => void;
}) {
  const hoehe = ((auftrag.ende - auftrag.start) / 60) * stundePx;
  const oben = ((auftrag.start - vonMinute) / 60) * stundePx;
  const breite = 100 / auftrag.spalten;
  const wer = auftrag.mitarbeiterIds;
  const farbe = wer.length > 0 ? employeeColorFor(employees, wer[0]) : null;
  const namen = wer.map((id) => employees.find((e) => e.id === id)?.name).filter(Boolean).join(", ");

  return (
    <div
      className={`tm-block ${statusKlasse(auftrag.status)}${farbe ? "" : " tm-ohne-person"}${auftrag.geschaetzt ? " tm-geschaetzt" : ""}`}
      role="button"
      tabIndex={0}
      // `stopPropagation`: Die Tagesspalte darunter legt bei einem Klick einen neuen Auftrag
      // an. Ohne das hier würde jeder Klick auf einen bestehenden Termin zusätzlich das
      // Fenster „Neuer Auftrag" aufziehen.
      onClick={(e) => { e.stopPropagation(); onOeffnen(auftrag.id); }}
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
    </div>
  );
}

export function Stundenraster({ tage, auftraege, customers, employees, orderEmployees, standardDauerMin, onOeffnen, onSlot }: {
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
}) {
  const heute = toDateStr(new Date());

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

  // Aufträge je Tag, getrennt nach „hat eine Uhrzeit" und „hat keine".
  const proTag = tage.map((tag) => {
    const datum = toDateStr(tag);
    const desTages = auftraege.filter((o) => o.order_date === datum);
    const mitZeit: (RasterAuftrag & { start: number; ende: number; geschaetzt: boolean })[] = [];
    const ohneZeit: RasterAuftrag[] = [];

    for (const o of desTages) {
      const angereichert: RasterAuftrag = {
        ...o,
        kunde: customers.find((c) => c.id === o.customer_id) ?? null,
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
export function RasterLegende({ employees, sichtbareIds }: {
  employees: Employee[];
  sichtbareIds: string[];
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
    </div>
  );
}
