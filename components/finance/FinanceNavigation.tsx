"use client";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BereichNavigation, type BereichEintrag } from "@/components/BereichNavigation";
import { navZuSpeicher } from "@/lib/navGruppen";
import { FIN_NAV_ZU_MERKER, financeNavAufbau, type FinanceSeite, type FinanceSeiteKey } from "@/lib/finance/seiten";
import { navZahl } from "@/lib/finance/kopfleiste";
import { FINANCE_ICONS } from "./FinanceBereich";
import { useFinanceStand, type FinanceRechte } from "./FinanceKopfleiste";
import { useAmRechner } from "@/lib/amRechner";

// Die Finance-Seitenleiste am Rechner (v178, Stufe A): Hauptseiten oben, Bereiche wie unter „Weitere“ am Handy,
// „System“ unten – derselbe Aufbau wie in FSM (components/BereichNavigation.tsx), mit eigenem Merker.
// Seit v187 mit Zahlen wie im Entwurf: Belege im Entwurf, Bankumsätze ohne Zuordnung, überfällige offene Posten
// (lib/finance/kopfleiste.ts, `navZahl`). Am Handy sind sie ausgeblendet (die Übersicht nennt sie dort).
const FIN_NAV_ZU = navZuSpeicher(FIN_NAV_ZU_MERKER);
const alsEintrag = (s: FinanceSeite): BereichEintrag<FinanceSeiteKey> => ({ key: s.key, label: s.label, Icon: FINANCE_ICONS[s.key] });

export function FinanceNavigation({ seiten, aktiv, onSeite, supabase, jahr, darf }: {
  // Nur die Seiten, die diese Person sehen darf.
  seiten: FinanceSeite[];
  aktiv: FinanceSeiteKey | null;
  onSeite: (s: FinanceSeiteKey) => void;
  // Für die Zahlen (ohne: keine Zahlen).
  supabase?: SupabaseClient;
  jahr?: number;
  darf?: FinanceRechte;
}) {
  const a = financeNavAufbau(seiten);
  const amRechner = useAmRechner();
  const gruppe = (g: { titel: string; seiten: FinanceSeite[] }) => ({ titel: g.titel, eintraege: g.seiten.map(alsEintrag) });
  return (
    <BereichNavigation haupt={a.haupt.map(alsEintrag)} gruppen={a.gruppen.map(gruppe)} unten={a.unten ? gruppe(a.unten) : null}
      aktiv={aktiv} speicher={FIN_NAV_ZU} onWahl={onSeite}
      zusatz={amRechner && supabase && jahr && darf ? (k) => <NavZahl key={k} seite={k} supabase={supabase} jahr={jahr} darf={darf} /> : undefined} />
  );
}

// Je Eintrag eine kleine Komponente: die Abfragen teilt react-query, gerechnet wird nur, was dieser Eintrag zeigt.
function NavZahl({ seite, supabase, jahr, darf }: { seite: FinanceSeiteKey; supabase: SupabaseClient; jahr: number; darf: FinanceRechte }) {
  const [heute] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  // Nur laden, was dieser Eintrag zählt (die Einstellungen des Jahres lädt der Bereich ohnehin).
  const brauche = seite === "belege" ? ["finance.belege"] : seite === "bank" ? ["finance.bank"] : seite === "op" ? ["finance.belege", "finance.rechnungen"] : [];
  const n = navZahl(seite, useFinanceStand(supabase, jahr, heute, (b, v) => brauche.includes(b) && darf(b, v)));
  if (!n) return null;
  return <span className={"fi-nav-zahl" + (seite === "op" ? " ruhig" : "")} aria-label={`${n} offen`}>{n}</span>;
}
