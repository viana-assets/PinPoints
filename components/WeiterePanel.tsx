import type { ModulEintrag, TabKey } from "@/lib/module";
import { weitereGruppen } from "@/lib/module";

// Die Kachelseite „Weitere" am Handy (neu gestaltet am 26.09.2026, Entwurf „V · Weitere").
//
// Vorher eine lange Liste gleich aussehender Zeilen. Jetzt Kacheln nach Gruppen, und jede Kachel
// sagt, ob dort etwas wartet („3 noch nicht ausgestellt") – orange, wenn etwas zu tun ist. Die
// Zahlen kommen aus app/page.tsx und nur aus dem, was ohnehin geladen ist; fehlt eine, steht die
// Beschreibung aus lib/module.ts da.

export type WeitereHinweis = { text: string; dringend?: boolean };

export function WeiterePanel({ module, hinweise, onOeffnen }: {
  module: ModulEintrag[];
  hinweise: Partial<Record<TabKey, WeitereHinweis>>;
  onOeffnen: (tab: TabKey) => void;
}) {
  return (
    <div className="tabpanel active">
      <div className="wt-seite">
        {weitereGruppen(module).map((g) => (
          <div key={g.titel} className="wt-gruppe">
            <span className="op-gruppe-titel">{g.titel.toUpperCase()}</span>
            <div className="wt-kacheln">
              {g.module.map((m) => {
                const h = hinweise[m.tab];
                return (
                  <button key={m.tab} type="button" className="wt-kachel" onClick={() => onOeffnen(m.tab)}>
                    <span className={"wt-symbol" + (h?.dringend ? " dringend" : "")}><m.Icon /></span>
                    <span className="wt-titel">{m.label}</span>
                    <span className={"wt-info" + (h?.dringend ? " dringend" : "")}>{h?.text ?? m.beschreibung}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
