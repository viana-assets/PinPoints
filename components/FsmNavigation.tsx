"use client";
import { Fragment, useSyncExternalStore } from "react";
import type { ModulEintrag, TabKey } from "@/lib/module";
import {
  navAlleUmschalten, navAlleZu, navAufbau, navSichtbareModule, navUmschalten, navZuAbonnieren, navZuAusText, navZuMerken, navZuRoh,
  navZuRohServer, type NavGruppe,
} from "@/lib/navGruppen";
import { NavItem } from "@/components/NavItem";

// Die FSM-Seitenleiste (v176): vier Hauptseiten, darunter die Bereiche wie unter „Weitere“ am Handy, zum Ein- und
// Ausklappen; „System“ unten. Die Regeln stehen in lib/navGruppen.ts. Am Handy ist #iconNav die untere Leiste –
// dort zeigt sie nur die Hauptseiten (alles mit `nav-secondary` ist ausgeblendet), den Rest hat „Weitere“.
export function FsmNavigation({ module, tab, hinweisDa, zusatz, onTab }: {
  // Nur die Module, die diese Rolle sehen darf.
  module: ModulEintrag[];
  tab: TabKey;
  // Wartet in diesem Modul etwas (wie der rote Hinweis auf „Weitere“)? Zeigt einen Punkt am zugeklappten Bereich.
  hinweisDa: (tab: TabKey) => boolean;
  zusatz?: (tab: TabKey) => React.ReactNode;
  onTab: (tab: TabKey) => void;
}) {
  const zu = navZuAusText(useSyncExternalStore(navZuAbonnieren, navZuRoh, navZuRohServer));
  const aufbau = navAufbau(module);
  const alleTitel = [...aufbau.gruppen, ...(aufbau.unten ? [aufbau.unten] : [])].map((g) => g.titel);
  const alleZu = navAlleZu(zu, alleTitel);

  const setzen = (neu: Set<string>) => navZuMerken(neu);

  const eintrag = (m: ModulEintrag, klasse?: string) => (
    <NavItem key={m.tab} className={klasse} active={tab === m.tab} onClick={() => onTab(m.tab)}
      icon={<m.Icon />} label={m.label} zusatz={zusatz?.(m.tab)} />
  );

  const gruppe = (g: NavGruppe) => {
    const offen = !zu.has(g.titel);
    const punkt = !offen && g.module.some((m) => hinweisDa(m.tab));
    return (
      <Fragment key={g.titel}>
        <button type="button" className={"nav-gruppe-kopf nav-secondary" + (offen ? "" : " zu")} aria-expanded={offen}
          onClick={() => setzen(navUmschalten(zu, g.titel))}>
          <svg className="nav-gruppe-pfeil" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          <span className="nav-gruppe-titel">{g.titel}</span>
          {!offen && (
            <span className="nav-gruppe-rechts">
              {punkt && <span className="nav-gruppe-punkt" aria-label="Hier wartet etwas" />}
              <span className="nav-gruppe-anz" aria-label={`${g.module.length} Seiten`}>{g.module.length}</span>
            </span>
          )}
        </button>
        {navSichtbareModule(g, zu, tab).map((m) => eintrag(m, "nav-secondary nav-eingerueckt"))}
      </Fragment>
    );
  };

  return (
    <>
      {aufbau.haupt.map((m) => eintrag(m))}
      {alleTitel.length > 0 && (
        <>
          <div className="nav-divider nav-secondary" />
          <div className="nav-bereiche nav-secondary">
            <span>Bereiche</span>
            <button type="button" className="nav-alle" onClick={() => setzen(navAlleUmschalten(zu, alleTitel))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 9 5-5 5 5M7 15l5 5 5-5" /></svg>
              {alleZu ? "Alle auf" : "Alle zu"}
            </button>
          </div>
        </>
      )}
      {aufbau.gruppen.map(gruppe)}
      <div className="nav-spacer nav-secondary" />
      {aufbau.unten && <div className="nav-unten nav-secondary">{gruppe(aufbau.unten)}</div>}
    </>
  );
}
