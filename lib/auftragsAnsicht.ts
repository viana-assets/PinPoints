import type { Order } from "./types";
import { rechnungOffen } from "./helpers";

// Die Regeln hinter der neu gestalteten Auftragsliste (26.09.2026, Entwurf „K · Aufträge").
// Reine Funktionen, geprüft in tests/auftragsAnsicht.test.ts.
//
// Die Frage, die die Liste beantworten soll: „Was ist noch zu tun?" – nicht „was gab es je".
// Deshalb stehen abgeschlossene Aufträge von gestern und früher nicht mehr standardmäßig da;
// ein Knopf am Ende holt sie zurück.

type A = Pick<Order, "status" | "order_date" | "time" | "rechnung_noetig" | "rechnung_erstellt_am" | "deleted_at" | "order_number">;

// Abgeschlossen = es ist nichts mehr zu tun: erledigt ohne offene Rechnung, oder storniert.
// Ein erledigter Auftrag, dessen Rechnung noch fehlt, ist NICHT abgeschlossen – er ist Arbeit.
export function abgeschlossen(o: A): boolean {
  return (o.status === "erledigt" && !rechnungOffen(o)) || o.status === "storniert";
}

// Standardmäßig ausgeblendet: abgeschlossen UND vor heute. Die von heute bleiben stehen – man
// soll sehen, was heute geschafft wurde.
export function ausgeblendet(o: A, heute: string): boolean {
  return o.order_date < heute && abgeschlossen(o);
}

export type AuftragsSortierung = "anstehend" | "neu" | "kunde" | "nr";

export const AUFTRAGS_SORTIERUNG_LABEL: Record<AuftragsSortierung, string> = {
  anstehend: "Anstehende zuerst",
  neu: "Neueste zuerst",
  kunde: "Kunde A–Z",
  nr: "Auftragsnummer",
};

export type AuftragsGruppe<O> = {
  // „liegen" = vergangen, aber noch nicht abgeschlossen; „tag" = ein Kalendertag ab heute
  // (bzw. jeder Tag bei „neu"); „vergangen" = abgeschlossene vergangene Tage; „flach" = ohne Tage.
  art: "liegen" | "tag" | "vergangen" | "flach";
  datum: string | null;
  auftraege: O[];
};

const zeitschluessel = (o: A) => o.order_date + (o.time ?? "");

// Die Aufträge in Gruppen, so wie die Liste sie zeigt. Die Eingabe ist bereits gefiltert.
//
// „Anstehende zuerst": oben, was liegen geblieben ist (vergangen, nicht abgeschlossen – ältestes
// zuerst), dann heute und die folgenden Tage aufsteigend, ganz unten – nur wenn eingeblendet –
// die abgeschlossenen vergangenen Tage, jüngster zuerst.
export function auftragsGruppen<O extends A>(
  orders: O[],
  heute: string,
  sort: AuftragsSortierung,
  kundeName: (o: O) => string
): AuftragsGruppe<O>[] {
  if (sort === "kunde" || sort === "nr") {
    const sortiert = orders.slice().sort((a, b) =>
      sort === "nr" ? b.order_number - a.order_number : kundeName(a).localeCompare(kundeName(b), "de") || zeitschluessel(a).localeCompare(zeitschluessel(b)));
    return sortiert.length ? [{ art: "flach", datum: null, auftraege: sortiert }] : [];
  }
  const nachTagen = (liste: O[], art: "tag" | "vergangen"): AuftragsGruppe<O>[] => {
    const gruppen: AuftragsGruppe<O>[] = [];
    for (const o of liste) {
      const letzte = gruppen[gruppen.length - 1];
      if (letzte && letzte.datum === o.order_date) letzte.auftraege.push(o);
      else gruppen.push({ art, datum: o.order_date, auftraege: [o] });
    }
    return gruppen;
  };
  const auf = (a: O, b: O) => zeitschluessel(a).localeCompare(zeitschluessel(b));
  if (sort === "neu") {
    return nachTagen(orders.slice().sort((a, b) => zeitschluessel(b).localeCompare(zeitschluessel(a))), "tag");
  }
  const liegen = orders.filter((o) => o.order_date < heute && !abgeschlossen(o)).sort(auf);
  const ab = orders.filter((o) => o.order_date >= heute).sort(auf);
  const alt = orders.filter((o) => o.order_date < heute && abgeschlossen(o)).sort((a, b) => auf(b, a));
  return [
    ...(liegen.length ? [{ art: "liegen" as const, datum: null, auftraege: liegen }] : []),
    ...nachTagen(ab, "tag"),
    ...nachTagen(alt, "vergangen"),
  ];
}
