// Fotos im Team-Chat (Migration 84, v137). Das Bild steht im Verlauf in seinem Seitenverhältnis –
// der Platz ist schon da, bevor es geladen ist, damit der Verlauf beim Laden nicht springt. Ein
// Tipp öffnet es groß (Ebene 10004 wie die Fotos am Auftrag).

export function ChatFotoBild({ breite, hoehe, link, onGross }: {
  breite: number | null | undefined;
  hoehe: number | null | undefined;
  link: string | undefined;
  onGross: (link: string) => void;
}) {
  const verhaeltnis = breite && hoehe ? `${breite} / ${hoehe}` : "4 / 3";
  return (
    <button type="button" className="ch-foto" style={{ aspectRatio: verhaeltnis }} disabled={!link}
      onClick={() => link && onGross(link)} aria-label="Foto groß ansehen">
      {link ? <img src={link} alt="Foto im Chat" loading="lazy" /> : <span className="ch-foto-laedt">Foto lädt …</span>}
    </button>
  );
}

// Escape schließt es über das Chatfenster (dort steht die Reihenfolge aller offenen Ebenen).
export function ChatFotoGross({ link, onClose }: { link: string; onClose: () => void }) {
  return (
    <div className="modal-overlay ch-gross" role="dialog" aria-label="Foto" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <button type="button" className="dm-zu ch-gross-zu" onClick={onClose} aria-label="Foto schließen">×</button>
      <img src={link} alt="Foto im Chat, groß" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
