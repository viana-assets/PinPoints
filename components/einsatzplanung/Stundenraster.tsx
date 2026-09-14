import type { Customer, Employee, Order } from "@/lib/types";
import { ORDER_STATUS_LABEL } from "@/lib/constants";
import { STANDARD_DAUER_MIN, KALENDER_VON_STUNDE, KALENDER_BIS_STUNDE } from "@/lib/constants";
import { auftragsZeitraum, employeeColorFor, hhmmAus, layoutSpalten, toDateStr, zeitfenster } from "@/lib/calendar";

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

const RASTER_STUNDE_PX = 52;

export type RasterAuftrag = Order & { kunde: Customer | null; mitarbeiterIds: string[] };

function statusKlasse(status: string): string {
  return `tm-${status}`;
}

// Ein Termin im Raster. Absichtlich ein div mit role="button": In den Block passt bei kurzen
// Terminen kaum Text, und ein echter Knopf brächte eigene Innenabstände mit, die die Höhe
// verfälschen – die Höhe ist hier aber die Aussage.
function TerminBlock({ auftrag, employees, vonMinute, onOeffnen }: {
  auftrag: RasterAuftrag & { start: number; ende: number; geschaetzt: boolean; spalte: number; spalten: number };
  employees: Employee[];
  vonMinute: number;
  onOeffnen: (id: string) => void;
}) {
  const hoehe = ((auftrag.ende - auftrag.start) / 60) * RASTER_STUNDE_PX;
  const oben = ((auftrag.start - vonMinute) / 60) * RASTER_STUNDE_PX;
  const breite = 100 / auftrag.spalten;
  const wer = auftrag.mitarbeiterIds;
  const farbe = wer.length > 0 ? employeeColorFor(employees, wer[0]) : null;
  const namen = wer.map((id) => employees.find((e) => e.id === id)?.name).filter(Boolean).join(", ");

  return (
    <div
      className={`termin ${statusKlasse(auftrag.status)}${farbe ? "" : " tm-ohne-person"}${auftrag.geschaetzt ? " tm-geschaetzt" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOeffnen(auftrag.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOeffnen(auftrag.id); } }}
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
        ...(farbe ? { background: farbe, borderColor: farbe } : {}),
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

export function Stundenraster({ tage, auftraege, customers, employees, orderEmployees, onOeffnen }: {
  // Ein Tag in der Tagesansicht, sieben in der Wochenansicht – sonst ändert sich nichts.
  tage: Date[];
  auftraege: Order[];
  customers: Customer[];
  employees: Employee[];
  orderEmployees: Record<string, string[]>;
  onOeffnen: (id: string) => void;
}) {
  const heute = toDateStr(new Date());

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
      const zeitraum = auftragsZeitraum(o, STANDARD_DAUER_MIN);
      if (zeitraum) mitZeit.push({ ...angereichert, ...zeitraum });
      else ohneZeit.push(angereichert);
    }
    return { tag, datum, mitZeit: layoutSpalten(mitZeit), ohneZeit };
  });

  // EIN Zeitfenster für alle gezeigten Tage. In der Woche müssen die Stundenlinien über alle
  // sieben Spalten auf derselben Höhe liegen – sonst vergleicht man Äpfel mit Birnen.
  const { vonStunde, bisStunde } = zeitfenster(
    proTag.flatMap((t) => t.mitZeit),
    KALENDER_VON_STUNDE,
    KALENDER_BIS_STUNDE
  );
  const stunden = Array.from({ length: bisStunde - vonStunde }, (_, i) => vonStunde + i);
  const vonMinute = vonStunde * 60;
  const gesamtHoehe = stunden.length * RASTER_STUNDE_PX;

  // Aufträge ohne Uhrzeit dürfen nicht verschwinden. Sie ins Raster zu setzen ginge nur mit
  // einer erfundenen Zeit; sie wegzulassen hieße, dass ein Auftrag im Kalender fehlt, den es
  // gibt. Also eine eigene Leiste darüber, sichtbar und als Lücke erkennbar.
  const ohneZeitGesamt = proTag.reduce((n, t) => n + t.ohneZeit.length, 0);

  return (
    <div className={"raster" + (tage.length > 1 ? " raster-woche" : " raster-tag")}>
      <div className="raster-kopf">
        <div className="rk-spalte-zeit" />
        {proTag.map(({ tag, datum }) => (
          <div key={datum} className={"rk-tag" + (datum === heute ? " ist-heute" : "")}>
            <span className="rk-wochentag">{tag.toLocaleDateString("de-DE", { weekday: "short" })}</span>
            <span className="rk-datum">{tag.getDate()}.{tag.getMonth() + 1}.</span>
          </div>
        ))}
      </div>

      {ohneZeitGesamt > 0 && (
        <div className="raster-ohnezeit">
          <div className="rk-spalte-zeit">ohne Uhrzeit</div>
          {proTag.map(({ datum, ohneZeit }) => (
            <div key={datum} className="roz-tag">
              {ohneZeit.map((o) => (
                <button
                  key={o.id} type="button" className="roz-chip"
                  title={`${o.kunde?.name || o.title} – keine Uhrzeit gepflegt`}
                  onClick={() => onOeffnen(o.id)}
                >
                  {o.kunde?.name || o.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="raster-leib" style={{ height: `${gesamtHoehe}px` }}>
        <div className="rk-spalte-zeit rl-stunden">
          {stunden.map((h) => (
            <div key={h} className="rl-stunde" style={{ height: `${RASTER_STUNDE_PX}px` }}>
              <span>{String(h).padStart(2, "0")}:00</span>
            </div>
          ))}
        </div>
        {proTag.map(({ datum, mitZeit }) => (
          <div key={datum} className={"rl-tag" + (datum === heute ? " ist-heute" : "")}>
            {stunden.map((h) => (
              <div key={h} className="rl-linie" style={{ height: `${RASTER_STUNDE_PX}px` }} />
            ))}
            {mitZeit.map((a) => (
              <TerminBlock
                key={a.id} auftrag={a} employees={employees}
                vonMinute={vonMinute} onOeffnen={onOeffnen}
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
