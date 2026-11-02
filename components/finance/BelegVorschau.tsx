"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useFinBuchungBelegbilder, useFinDateiLink } from "@/lib/queries/hooks";
import { useKurzbefehle } from "./arbeitsplatz/Werkzeuge";

// Das Belegbild in der rechten Spalte des Arbeitsplatzes (v187, Entwurf: „rechts immer der Beleg zur gewählten Zeile“):
// Foto klein als Bild, PDF und E-Rechnung als Kachel. F4 oder Klick öffnet die Datei groß in einem neuen Tab.
// Woher: der gebuchte Beleg aus dem Belegeingang und was an der Buchung hängt (Migration 114).
export function BelegVorschau({ supabase, buchungId }: { supabase: SupabaseClient; buchungId: string }) {
  const bilderQ = useFinBuchungBelegbilder(supabase, buchungId, true);
  const erstes = bilderQ.data?.[0] ?? null;
  const linkQ = useFinDateiLink(supabase, erstes?.pfad ?? null, !!erstes);
  const link = linkQ.data ?? null;
  const bild = !!erstes && erstes.typ.startsWith("image/");
  const weitere = (bilderQ.data?.length ?? 0) - 1;

  // F4 öffnet sofort – der Link liegt schon bereit (nach einem Warten würde der Browser das Fenster blockieren).
  useKurzbefehle((b) => {
    if (b !== "beleg" || !link) return false;
    window.open(link, "_blank", "noopener");
    return true;
  });

  if (bilderQ.isPending) return <div className="ap-beleg leer"><span className="small">Beleg lädt …</span></div>;
  if (!erstes) return <div className="ap-beleg leer"><span className="small">Kein Belegbild</span></div>;
  return (
    <a className={"ap-beleg" + (bild ? " bild" : "")} href={link ?? undefined} target="_blank" rel="noopener noreferrer"
      aria-label={`Beleg ${erstes.name} öffnen (F4)`} onClick={(e) => { if (!link) e.preventDefault(); }}>
      {bild && link ? <img src={link} alt={`Beleg ${erstes.name}`} /> : (
        <span className="ap-beleg-kachel" aria-hidden="true">{/xml/.test(erstes.typ) ? "XML" : /pdf/.test(erstes.typ) ? "PDF" : "Datei"}</span>
      )}
      <span className="ap-beleg-fuss"><span>{erstes.name}{weitere > 0 ? ` · +${weitere}` : ""}</span><span>F4 groß</span></span>
    </a>
  );
}
