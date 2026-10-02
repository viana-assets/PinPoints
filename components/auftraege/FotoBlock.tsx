import { useRef, useState } from "react";
import type { AuftragBeleg, BelegArt } from "@/lib/types";
import { BELEG_ART_LABEL, BELEG_ARTEN } from "@/lib/constants";
import { belegeNachArt, belegStand } from "@/lib/belege";
import { bildVerkleinern } from "@/lib/belegBild";
import { formatDate } from "@/lib/helpers";

// Fotos und Unterschrift am Auftrag (Fahrplan E3, Migration 65, v105).
//
// Vorher/nachher fotografieren – Profil, Felge, ein Kratzer, den der Kunde schon mitgebracht hat –
// und am Ende den Kunden auf dem Handy quittieren lassen. Bei einer Reklamation ist das der
// Unterschied zwischen Aussage gegen Aussage und einem Beleg.
//
// Die Fotos gehen über die Kamera des Handys, nicht über einen eigenen Kamerabildschirm: Die
// eingebaute Kamera fokussiert, blitzt und kennt der Techniker. Bewusst OHNE `capture`: Damit
// erzwänge das Handy die Kamera, und ein Foto aus der Galerie – vorhin ohne Netz gemacht – ließe
// sich nicht mehr nachreichen. So fragt es „Foto aufnehmen / Mediathek". Vor dem Hochladen wird das
// Bild auf 1600 Pixel verkleinert (lib/belegBild.ts) – am Straßenrand ist oft nur Mobilfunk da.
//
// Nur mit Netz: Ein Foto ist zu groß für den Ausgangskorb (lib/offline/), und ein „gespeichert",
// das in Wahrheit auf dem Handy liegt, wäre bei einem Beleg das Falsche.
//
// Ändern gibt es nicht (Migration 65). Löschen nur mit dem Löschrecht für Aufträge, mit Rückfrage.

export type BelegeImAuftrag = {
  liste: AuftragBeleg[];
  laedt: boolean;
  // Pfad → zeitlich begrenzter Anzeige-Link (lib/api/belege.ts, `belegLinks`).
  links: Record<string, string>;
  darfHinzufuegen: boolean;
  darfLoeschen: boolean;
  onHochladen: (art: BelegArt, datei: Blob, masse: { breite: number; hoehe: number }, beschriftung: string | null) => Promise<void>;
  onLoeschen: (beleg: AuftragBeleg) => Promise<void>;
};

const FOTO_ARTEN = BELEG_ARTEN.filter((a) => a !== "unterschrift");

function zeitText(iso: string): string {
  return `${formatDate(iso.slice(0, 10))} ${new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}

export function FotoBlock({ belege, vorschlagArt, onUnterschreiben }: {
  belege: BelegeImAuftrag;
  // Vor der Arbeit „vorher", danach „nachher" – die Seite weiß, wo der Auftrag steht.
  vorschlagArt: BelegArt;
  onUnterschreiben: (() => void) | null;
}) {
  const [art, setArt] = useState<BelegArt>(vorschlagArt);
  const [beschriftung, setBeschriftung] = useState("");
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gross, setGross] = useState<AuftragBeleg | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);

  const gruppen = belegeNachArt(belege.liste);
  const stand = belegStand(belege.liste);

  async function dateienGewaehlt(liste: FileList | null) {
    const dateien = Array.from(liste ?? []);
    if (eingabe.current) eingabe.current.value = "";
    if (dateien.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFehler("Keine Verbindung – Fotos gehen nur mit Netz. Mit der Kamera-App fotografieren und später hier aus der Mediathek hinzufügen.");
      return;
    }
    setFehler(null);
    try {
      for (let i = 0; i < dateien.length; i++) {
        setLaeuft(dateien.length > 1 ? `lädt ${i + 1} von ${dateien.length} …` : "lädt hoch …");
        const klein = await bildVerkleinern(dateien[i]);
        await belege.onHochladen(art, klein.blob, { breite: klein.breite, hoehe: klein.hoehe }, beschriftung);
      }
      setBeschriftung("");
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das Foto konnte nicht hochgeladen werden.");
    } finally {
      setLaeuft(null);
    }
  }

  async function loeschen(b: AuftragBeleg) {
    const was = b.art === "unterschrift" ? "Diese Unterschrift" : "Dieses Foto";
    if (!confirm(`${was} endgültig löschen? Das lässt sich nicht rückgängig machen.`)) return;
    setLaeuft("löscht …");
    setFehler(null);
    try {
      await belege.onLoeschen(b);
      setGross(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Das Löschen hat nicht geklappt.");
    } finally {
      setLaeuft(null);
    }
  }

  function vorschau(b: AuftragBeleg, klasse: string) {
    const link = belege.links[b.pfad];
    return (
      <button key={b.id} type="button" className={klasse} onClick={() => setGross(b)}
        aria-label={`${BELEG_ART_LABEL[b.art]}${b.beschriftung ? `: ${b.beschriftung}` : ""}, ${zeitText(b.created_at)}`}>
        {link ? <img src={link} alt="" loading="lazy" /> : <span className="fo-platzhalter">…</span>}
        {b.beschriftung && b.art !== "unterschrift" && <span className="fo-beschriftung">{b.beschriftung}</span>}
      </button>
    );
  }

  return (
    <div className="db-karte ao-karte fo-karte">
      <div className="db-karte-kopf">
        <span className="db-karte-titel">Fotos &amp; Unterschrift</span>
        <span className="small">{belege.laedt ? "lädt …" : `${stand.fotos} ${stand.fotos === 1 ? "Foto" : "Fotos"}${stand.unterschrift ? " · unterschrieben" : ""}`}</span>
      </div>

      {gruppen.map((g) => (
        <div key={g.art} className="fo-gruppe">
          <span className="fo-gruppe-titel">{BELEG_ART_LABEL[g.art]}</span>
          <div className="fo-raster">{g.belege.map((b) => vorschau(b, "fo-bild"))}</div>
        </div>
      ))}

      {belege.darfHinzufuegen && (
        <div className="fo-neu">
          <div className="lg-lagerwahl ar-segment" role="group" aria-label="Was zeigt das Foto?">
            {FOTO_ARTEN.map((a) => (
              <button key={a} type="button" className={art === a ? "aktiv" : ""} aria-pressed={art === a} onClick={() => setArt(a)}>
                {BELEG_ART_LABEL[a]}
              </button>
            ))}
          </div>
          <input
            type="text" className="fo-text" value={beschriftung} maxLength={80}
            placeholder="Beschriftung, z. B. „Felge VL“ (freiwillig)"
            onChange={(e) => setBeschriftung(e.target.value)} aria-label="Beschriftung"
          />
          <input
            ref={eingabe} type="file" accept="image/*" multiple hidden
            onChange={(e) => void dateienGewaehlt(e.target.files)}
          />
          <button type="button" className="dm-plus" disabled={!!laeuft} onClick={() => eingabe.current?.click()}>
            {laeuft ?? `+ Foto „${BELEG_ART_LABEL[art]}“ hinzufügen`}
          </button>
        </div>
      )}

      <div className="fo-unterschrift">
        {stand.unterschrift ? (
          <>
            {vorschau(stand.unterschrift, "fo-bild fo-sig")}
            <span className="small">
              Unterschrieben{stand.unterschrift.beschriftung ? ` von ${stand.unterschrift.beschriftung}` : ""} am {zeitText(stand.unterschrift.created_at)}
            </span>
          </>
        ) : (
          <span className="small">Noch keine Unterschrift des Kunden.</span>
        )}
        {onUnterschreiben && belege.darfHinzufuegen && (
          <button type="button" className="lg-knopf" disabled={!!laeuft} onClick={onUnterschreiben}>
            {stand.unterschrift ? "Neu unterschreiben lassen" : "Kunde unterschreiben lassen"}
          </button>
        )}
      </div>

      {fehler && <div className="hinweis-pflicht">{fehler}</div>}

      {gross && (
        <div className="modal-overlay modal-foto fo-licht" onClick={(e) => { e.stopPropagation(); setGross(null); }}>
          <div className="fo-gross" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={BELEG_ART_LABEL[gross.art]}>
            <div className="ar-blatt-kopf">
              <div className="ab-titel">
                {BELEG_ART_LABEL[gross.art]}{gross.beschriftung ? ` · ${gross.beschriftung}` : ""}
              </div>
              <button type="button" className="modal-close" onClick={() => setGross(null)} aria-label="Schließen">×</button>
            </div>
            {belege.links[gross.pfad]
              ? <img className={gross.art === "unterschrift" ? "fo-gross-sig" : undefined} src={belege.links[gross.pfad]} alt="" />
              : <span className="small">Das Bild lädt noch …</span>}
            <div className="fo-gross-fuss">
              <span className="small">aufgenommen {zeitText(gross.created_at)}{gross.breite && gross.hoehe ? ` · ${gross.breite}×${gross.hoehe}` : ""}</span>
              {belege.darfLoeschen && (
                <button type="button" className="lg-knopf gefahr" disabled={!!laeuft} onClick={() => void loeschen(gross)}>
                  {laeuft ?? "Löschen"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
