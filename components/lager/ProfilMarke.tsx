import type { EingelagertesRad, TireStorage } from "@/lib/types";
import { PROFIL_GESETZLICH_MM, PROFIL_HINWEIS_MM, PROFIL_KRITISCH_MM } from "@/lib/constants";
import { profilLage, profilText, satzProfilMm } from "@/lib/helpers";

// Die Profiltiefe eines Satzes als farbige Marke – überall dieselbe (docs/lager.md,
// „Ein Wert für den Satz – oder vier Räder einzeln").
//
// Warum als eigene Komponente: Die Zahl steht inzwischen an vier Stellen – Auftragsfenster,
// Lagerregal, Platz-Historie, Saisonliste. Vier Schreibweisen derselben Zahl wären vier
// Gelegenheiten, sie unterschiedlich zu runden, unterschiedlich einzufärben oder die
// Erfassungsart zu vergessen. Hier steht sie einmal, und sie fragt satzProfilMm(), das den
// Unterschied zwischen Sammelwert und schwächstem Rad kennt.
//
// Die Farbe meint den ZUSTAND, nicht die Belegung – dasselbe Vokabular wie beim Kundenzustand
// und im Radbild (docs/design-system.md).

const GRENZEN = { hinweis: PROFIL_HINWEIS_MM, kritisch: PROFIL_KRITISCH_MM };

export function ProfilMarke({ satz, raeder, praefix = "Profil" }: {
  satz: Pick<TireStorage, "erfassungsart" | "profiltiefe_mm" | "anzahl_raeder">;
  raeder: EingelagertesRad[];
  // „Profil 6,5 mm" in Listen, leer im Auftragsfenster, wo die Überschrift es schon sagt.
  praefix?: string;
}) {
  const mm = satzProfilMm(satz, raeder);
  const lage = profilLage(mm, GRENZEN);
  const einzeln = (satz.erfassungsart ?? "sammel") === "einzeln";
  const gemessen = raeder.filter((r) => r.profiltiefe_mm != null).length;

  // Ohne Messung keine Marke, sondern eine Lücke, die als Lücke aussieht. Eine graue Marke
  // mit „–" behauptete, es sei ein Zustand erfasst worden.
  if (mm == null) {
    return (
      <span className="profil-marke profil-ohne" title={einzeln ? "Einzelerfassung, aber noch kein Rad gemessen" : "Keine Profiltiefe erfasst"}>
        {praefix ? `${praefix} –` : "–"}
      </span>
    );
  }

  const titel = einzeln
    ? `Schwächstes von ${gemessen} gemessenen ${gemessen === 1 ? "Rad" : "Rädern"}` +
      (satz.anzahl_raeder ? ` (Satz: ${satz.anzahl_raeder})` : "")
    : "Ein Wert für den ganzen Satz";

  return (
    <span className={`profil-marke profil-${lage}`} title={titel}>
      {praefix ? `${praefix} ` : ""}
      {profilText(mm)}
      {/* Das Zeichen für „das ist der schlechteste von mehreren Werten". Kurz, weil es in
          jeder Tabellenzeile steht – die ganze Erklärung steht im Tooltip. */}
      {einzeln && <span className="profil-min" aria-hidden="true"> ↓</span>}
      {mm < PROFIL_GESETZLICH_MM && <span className="profil-warn"> ⚠</span>}
    </span>
  );
}
