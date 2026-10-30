"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { fehlerText } from "@/components/FehlerHinweis";
import { qk } from "@/lib/queries/keys";
import { useFinBuchungDateien } from "@/lib/queries/hooks";
import { finBelegDateiLink, finBuchungDateiHochladen } from "@/lib/api/finance";
import { dateiMangel } from "@/lib/finance/belege";
import { bildVerkleinern } from "@/lib/belegBild";

// Belegbild an einer Buchung (Stufe F, Migration 114, v186): Foto, PDF oder E-Rechnung an jeder Buchung – auch an
// Bank-, Kassen- und Stapelbuchungen. Angehängt ist angehängt (GoBD): kein Entfernen; falsch → Storno und neu buchen.
export function BelegBilder({ supabase, buchungId, darfAnhaengen }: { supabase: SupabaseClient; buchungId: string; darfAnhaengen: boolean }) {
  const queryClient = useQueryClient();
  const dateienQ = useFinBuchungDateien(supabase, buchungId, true);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  if (dateienQ.isError) return <span className="small">Belegbilder an Buchungen gibt es ab Migration 114.</span>;
  const dateien = dateienQ.data ?? [];

  async function anhaengen(f: File) {
    const mangel = dateiMangel(f);
    if (mangel) { setFehler(mangel); return; }
    setLaeuft(true);
    setFehler(null);
    try {
      const bild = f.type.startsWith("image/");
      const blob = bild ? (await bildVerkleinern(f)).blob : f;
      await finBuchungDateiHochladen(supabase, buchungId, blob, bild ? f.name.replace(/\.\w+$/, "") + ".jpg" : f.name);
      await queryClient.invalidateQueries({ queryKey: qk.finBuchungDateien(buchungId) });
      await queryClient.invalidateQueries({ queryKey: ["finance", "pruefung"] });
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  }

  async function zeigen(pfad: string) {
    try { window.open(await finBelegDateiLink(supabase, pfad), "_blank", "noopener"); } catch (e) { setFehler(fehlerText(e)); }
  }

  return (
    <div className="fi-belegbilder">
      <span className="op-gruppe-titel">BELEG</span>
      {dateienQ.isPending ? <span className="small">Lädt …</span> : dateien.length === 0 ? <span className="small">Kein Belegbild angehängt.</span> : (
        <div className="fi-belegbilder-liste">
          {dateien.map((d) => <button key={d.id} type="button" className="es-knopf" onClick={() => void zeigen(d.pfad)}>{d.name}</button>)}
        </div>
      )}
      {darfAnhaengen && dateien.length < 10 && (
        <label className={"btn-secondary fi-knopf fi-dateiwahl" + (laeuft ? " deaktiviert" : "")}>
          {laeuft ? "lädt hoch …" : "Belegbild anhängen"}
          <input type="file" disabled={laeuft} accept="image/*,application/pdf,.xml,application/xml,text/xml" aria-label="Belegbild anhängen"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void anhaengen(f); }} />
        </label>
      )}
      {fehler && <div className="fi-hinweis fi-rot" role="alert">{fehler}</div>}
    </div>
  );
}
