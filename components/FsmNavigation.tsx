"use client";
import type { ModulEintrag, TabKey } from "@/lib/module";
import { FSM_NAV_ZU, navAufbau, type NavGruppe } from "@/lib/navGruppen";
import { BereichNavigation, type BereichEintrag, type BereichGruppe } from "@/components/BereichNavigation";

// Die FSM-Seitenleiste (v176): vier Hauptseiten, darunter die Bereiche wie unter „Weitere“ am Handy, zum Ein- und
// Ausklappen; „System“ unten. Die Regeln stehen in lib/navGruppen.ts, die Leiste selbst seit v178 in
// components/BereichNavigation.tsx (dieselbe für Finance).
const alsEintrag = (m: ModulEintrag): BereichEintrag<TabKey> => ({ key: m.tab, label: m.label, Icon: m.Icon });
const alsGruppe = (g: NavGruppe): BereichGruppe<TabKey> => ({ titel: g.titel, eintraege: g.module.map(alsEintrag) });

export function FsmNavigation({ module, tab, hinweisDa, zusatz, onTab }: {
  // Nur die Module, die diese Rolle sehen darf.
  module: ModulEintrag[];
  tab: TabKey;
  // Wartet in diesem Modul etwas (wie der rote Hinweis auf „Weitere“)? Zeigt einen Punkt am zugeklappten Bereich.
  hinweisDa: (tab: TabKey) => boolean;
  zusatz?: (tab: TabKey) => React.ReactNode;
  onTab: (tab: TabKey) => void;
}) {
  const aufbau = navAufbau(module);
  return (
    <BereichNavigation haupt={aufbau.haupt.map(alsEintrag)} gruppen={aufbau.gruppen.map(alsGruppe)}
      unten={aufbau.unten ? alsGruppe(aufbau.unten) : null} aktiv={tab} speicher={FSM_NAV_ZU}
      hinweisDa={hinweisDa} zusatz={zusatz} onWahl={onTab} />
  );
}
