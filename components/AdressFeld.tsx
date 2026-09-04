import { useEffect, useRef, useState } from "react";
import { sucheAdressen, type Adressvorschlag } from "@/lib/api/adressen";

// Adresseingabe mit Vorschlägen (siehe docs/kunden-und-karte.md).
//
// Das Feld bleibt ein ganz normales Textfeld: wer die Adresse kennt, tippt sie und drückt
// weiter, ohne dass ihm etwas dazwischenredet. Die Vorschläge sind ein Angebot, keine Pflicht –
// eine Adresse, die der Kartendienst nicht kennt, muss weiterhin eintragbar sein. Es gibt
// Neubaugebiete, und es gibt Kunden, die auf einem Hof ohne Straßennamen wohnen.
//
// Wird ein Vorschlag angenommen, kommt die Koordinate gleich mit. Das erspart die zweite
// Abfrage beim Speichern und – wichtiger – es kann nicht passieren, dass Adresstext und
// Kartenposition auseinanderlaufen.

// Wartezeit nach dem letzten Tastendruck. 350 ms ist die übliche Größenordnung: kurz genug,
// dass es sich sofort anfühlt, lang genug, dass beim Durchtippen eines Straßennamens nicht ein
// Dutzend Anfragen hinausgehen.
const TIPPPAUSE_MS = 350;
const MIN_ZEICHEN = 3;

export function AdressFeld({ wert, onChange, onVorschlagGewaehlt, platzhalter, id }: {
  wert: string;
  onChange: (wert: string) => void;
  // Wird nur beim Annehmen eines Vorschlags gerufen – mit Adresszeile UND Koordinate.
  onVorschlagGewaehlt?: (vorschlag: Adressvorschlag) => void;
  platzhalter?: string;
  id?: string;
}) {
  const [treffer, setTreffer] = useState<Adressvorschlag[]>([]);
  const [offen, setOffen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  // Der Text, zu dem die aktuell angezeigten Vorschläge gehören. Ohne ihn blitzt nach dem
  // Annehmen eines Vorschlags kurz die alte Liste zur neuen Eingabe auf.
  const gesucht = useRef("");
  const huelle = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const roh = wert.trim();
    if (roh.length < MIN_ZEICHEN || roh === gesucht.current) return;
    const abbruch = new AbortController();
    const uhr = setTimeout(async () => {
      setLaedt(true);
      try {
        const gefunden = await sucheAdressen(roh, abbruch.signal);
        gesucht.current = roh;
        setTreffer(gefunden);
        setOffen(gefunden.length > 0);
      } catch {
        // Kein Netz, Dienst weg, Abbruch durch den nächsten Tastendruck: in allen Fällen
        // bleibt das Feld ein Textfeld. Eine Fehlermeldung beim Tippen wäre lästiger als
        // stillschweigend keine Vorschläge.
        setTreffer([]);
        setOffen(false);
      } finally {
        setLaedt(false);
      }
    }, TIPPPAUSE_MS);
    return () => { clearTimeout(uhr); abbruch.abort(); };
  }, [wert]);

  // Klick daneben schließt die Liste. Ohne das bliebe sie über anderen Feldern stehen.
  useEffect(() => {
    if (!offen) return;
    function beiKlick(e: MouseEvent) {
      if (huelle.current && !huelle.current.contains(e.target as Node)) setOffen(false);
    }
    document.addEventListener("mousedown", beiKlick);
    return () => document.removeEventListener("mousedown", beiKlick);
  }, [offen]);

  function annehmen(v: Adressvorschlag) {
    gesucht.current = v.label.trim();
    onChange(v.label);
    onVorschlagGewaehlt?.(v);
    setOffen(false);
  }

  return (
    <div className="adressfeld" ref={huelle}>
      <input
        id={id}
        type="text"
        value={wert}
        placeholder={platzhalter}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (treffer.length > 0) setOffen(true); }}
        onKeyDown={(e) => { if (e.key === "Escape") setOffen(false); }}
      />
      {laedt && <span className="adressfeld-laedt">sucht …</span>}
      {offen && treffer.length > 0 && (
        <ul className="adressfeld-liste">
          {treffer.map((v) => (
            <li key={v.label}>
              {/* type="button": in einem Formular wäre der Vorgabewert "submit", und ein Klick
                  auf einen Vorschlag würde das Formular abschicken. */}
              <button type="button" onClick={() => annehmen(v)}>
                <span className="av-zeile1">{[v.strasse, v.hausnummer].filter(Boolean).join(" ")}</span>
                <span className="av-zeile2">{[v.plz, v.ort].filter(Boolean).join(" ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
