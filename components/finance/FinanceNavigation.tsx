"use client";
import { BereichNavigation, type BereichEintrag } from "@/components/BereichNavigation";
import { navZuSpeicher } from "@/lib/navGruppen";
import { FIN_NAV_ZU_MERKER, financeNavAufbau, type FinanceSeite, type FinanceSeiteKey } from "@/lib/finance/seiten";
import { FINANCE_ICONS } from "./FinanceBereich";

// Die Finance-Seitenleiste am Rechner (v178, Stufe A): Hauptseiten oben, Bereiche wie unter „Weitere“ am Handy,
// „System“ unten – derselbe Aufbau wie in FSM (components/BereichNavigation.tsx), mit eigenem Merker.
const FIN_NAV_ZU = navZuSpeicher(FIN_NAV_ZU_MERKER);
const alsEintrag = (s: FinanceSeite): BereichEintrag<FinanceSeiteKey> => ({ key: s.key, label: s.label, Icon: FINANCE_ICONS[s.key] });

export function FinanceNavigation({ seiten, aktiv, onSeite }: {
  // Nur die Seiten, die diese Person sehen darf.
  seiten: FinanceSeite[];
  aktiv: FinanceSeiteKey | null;
  onSeite: (s: FinanceSeiteKey) => void;
}) {
  const a = financeNavAufbau(seiten);
  const gruppe = (g: { titel: string; seiten: FinanceSeite[] }) => ({ titel: g.titel, eintraege: g.seiten.map(alsEintrag) });
  return (
    <BereichNavigation haupt={a.haupt.map(alsEintrag)} gruppen={a.gruppen.map(gruppe)} unten={a.unten ? gruppe(a.unten) : null}
      aktiv={aktiv} speicher={FIN_NAV_ZU} onWahl={onSeite} />
  );
}
