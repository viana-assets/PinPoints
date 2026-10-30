"use client";
import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { navAlleUmschalten, navAlleZu, navUmschalten, navZuAusText, type NavZuSpeicher } from "@/lib/navGruppen";
import { NavItem } from "@/components/NavItem";

// Die Seitenleiste am Rechner in Bereichen (v176 für FSM, seit v178 auch für Finance): oben die Hauptseiten,
// darunter die Bereiche wie unter „Weitere“ am Handy zum Ein- und Ausklappen, ein Bereich unten angeheftet
// („System“). Die Regeln stehen in lib/navGruppen.ts. Am Handy ist #iconNav die untere Leiste – dort zeigt sie
// nur die Hauptseiten (alles mit `nav-secondary` ist ausgeblendet), den Rest hat „Weitere“.

export type BereichEintrag<K extends string> = { key: K; label: string; Icon: React.ComponentType };
export type BereichGruppe<K extends string> = { titel: string; eintraege: BereichEintrag<K>[] };

export function BereichNavigation<K extends string>({ haupt, gruppen, unten, aktiv, speicher, hinweisDa, zusatz, onWahl }: {
  haupt: BereichEintrag<K>[];
  gruppen: BereichGruppe<K>[];
  unten: BereichGruppe<K> | null;
  aktiv: K | null;
  // Wo sich die Leiste merkt, welche Bereiche zu sind – je System ein eigener (lib/navGruppen.ts).
  speicher: NavZuSpeicher;
  // Wartet auf dieser Seite etwas? Zeigt einen Punkt am zugeklappten Bereich.
  hinweisDa?: (key: K) => boolean;
  zusatz?: (key: K) => ReactNode;
  onWahl: (key: K) => void;
}) {
  const zu = navZuAusText(useSyncExternalStore(speicher.abonnieren, speicher.roh, speicher.server));
  const alleTitel = [...gruppen, ...(unten ? [unten] : [])].map((g) => g.titel);
  const alleZu = navAlleZu(zu, alleTitel);

  const eintrag = (m: BereichEintrag<K>, klasse?: string) => (
    <NavItem key={m.key} className={klasse} active={aktiv === m.key} onClick={() => onWahl(m.key)}
      icon={<m.Icon />} label={m.label} zusatz={zusatz?.(m.key)} />
  );

  const gruppe = (g: BereichGruppe<K>) => {
    const offen = !zu.has(g.titel);
    const punkt = !offen && !!hinweisDa && g.eintraege.some((m) => hinweisDa(m.key));
    // Zugeklappt bleibt die Seite stehen, auf der man gerade ist (`navSichtbareModule` in lib/navGruppen.ts).
    const sichtbar = offen ? g.eintraege : g.eintraege.filter((m) => m.key === aktiv);
    return (
      <Fragment key={g.titel}>
        <button type="button" className={"nav-gruppe-kopf nav-secondary" + (offen ? "" : " zu")} aria-expanded={offen}
          onClick={() => speicher.merken(navUmschalten(zu, g.titel))}>
          <svg className="nav-gruppe-pfeil" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          <span className="nav-gruppe-titel">{g.titel}</span>
          {!offen && (
            <span className="nav-gruppe-rechts">
              {punkt && <span className="nav-gruppe-punkt" aria-label="Hier wartet etwas" />}
              <span className="nav-gruppe-anz" aria-label={`${g.eintraege.length} Seiten`}>{g.eintraege.length}</span>
            </span>
          )}
        </button>
        {sichtbar.map((m) => eintrag(m, "nav-secondary nav-eingerueckt"))}
      </Fragment>
    );
  };

  return (
    <>
      {haupt.map((m) => eintrag(m))}
      {alleTitel.length > 0 && (
        <>
          <div className="nav-divider nav-secondary" />
          <div className="nav-bereiche nav-secondary">
            <span>Bereiche</span>
            <button type="button" className="nav-alle" onClick={() => speicher.merken(navAlleUmschalten(zu, alleTitel))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 9 5-5 5 5M7 15l5 5 5-5" /></svg>
              {alleZu ? "Alle auf" : "Alle zu"}
            </button>
          </div>
        </>
      )}
      {gruppen.map(gruppe)}
      <div className="nav-spacer nav-secondary" />
      {unten && <div className="nav-unten nav-secondary">{gruppe(unten)}</div>}
    </>
  );
}
