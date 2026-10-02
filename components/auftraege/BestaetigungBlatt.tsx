import { useState } from "react";
import type { Betrieb, Customer, Order } from "@/lib/types";
import {
  BESTAETIGUNG_ART_LABEL, bestaetigungBetreff, bestaetigungText, handynummer, versandLink, type BestaetigungArt,
} from "@/lib/terminBestaetigung";
import { todayStr } from "@/lib/helpers";

// Terminbestätigung oder -erinnerung an den Kunden (Fahrplan E9, v104).
//
// Die App schreibt den Text, verschickt wird er vom eigenen Gerät: WhatsApp, SMS oder E-Mail öffnen
// sich mit fertigem Text, man sieht ihn dort noch einmal und tippt auf „Senden". Kein Versanddienst,
// keine Absenderadresse (Entscheidung 02.10.2026). Der Text bleibt hier änderbar – „bitte Hof
// hinten" oder eine andere Uhrzeit gehören in genau diesen einen Text, nicht in die Vorlage.
export function BestaetigungBlatt({ auftrag, kunde, kennzeichen, betrieb, onClose }: {
  auftrag: Pick<Order, "order_date" | "time" | "end_time">;
  // Wie ihn `kundeFuerAuftrag` liefert – bei der Laufkundschaft der Laufkunde.
  kunde: Customer;
  kennzeichen: string[];
  betrieb: Pick<Betrieb, "firma" | "telefon"> | null;
  onClose: () => void;
}) {
  const heute = todayStr();
  const [art, setArt] = useState<BestaetigungArt>(auftrag.order_date > heute ? "bestaetigung" : "erinnerung");
  const vorschlag = (a: BestaetigungArt) => bestaetigungText({ art: a, auftrag, kunde, kennzeichen, betrieb, heute });
  const [text, setText] = useState(() => vorschlag(art));
  const [kopiert, setKopiert] = useState(false);
  const betreff = bestaetigungBetreff({ art, auftrag, betrieb });

  const handy = handynummer(kunde);
  const wege = [
    { weg: "whatsapp" as const, text: "WhatsApp", link: versandLink("whatsapp", handy, text, betreff), fehlt: "keine Handynummer mit Vorwahl" },
    { weg: "sms" as const, text: "SMS", link: versandLink("sms", handy, text, betreff), fehlt: "keine Handynummer" },
    { weg: "email" as const, text: "E-Mail", link: versandLink("email", kunde.email, text, betreff), fehlt: "keine E-Mail-Adresse" },
  ];

  function artWechseln(a: BestaetigungArt) {
    // Ein schon geänderter Text wird nur nach Rückfrage ersetzt.
    if (text !== vorschlag(art) && !confirm("Den geänderten Text durch die Vorlage ersetzen?")) return;
    setArt(a);
    setText(vorschlag(a));
  }

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2500);
    } catch {
      setKopiert(false);
    }
  }

  return (
    <div className="modal-overlay auswahl-overlay modal-bestaetigung" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="auswahl-blatt am-breit ar-blatt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Termin an den Kunden schicken">
        <div className="ab-griff" />
        <div className="ar-blatt-kopf">
          <div className="ab-titel">An den Kunden schicken</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <div className="lg-lagerwahl ar-segment" role="group" aria-label="Art">
          {(Object.keys(BESTAETIGUNG_ART_LABEL) as BestaetigungArt[]).map((a) => (
            <button key={a} type="button" className={art === a ? "aktiv" : ""} aria-pressed={art === a} onClick={() => artWechseln(a)}>
              {BESTAETIGUNG_ART_LABEL[a]}
            </button>
          ))}
        </div>
        <label className="nk-feld">
          <span>Text – hier noch änderbar</span>
          <textarea rows={11} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="be-wege">
          {wege.map((w) => w.link ? (
            <a key={w.weg} className={"be-weg " + w.weg} href={w.link} target={w.weg === "whatsapp" ? "_blank" : undefined} rel="noreferrer">{w.text}</a>
          ) : (
            <span key={w.weg} className="be-weg aus" title={w.fehlt}>{w.text}<small>{w.fehlt}</small></span>
          ))}
          <button type="button" className="be-weg kopie" onClick={() => void kopieren()}>{kopiert ? "Kopiert ✓" : "Text kopieren"}</button>
        </div>
        <span className="small">
          Verschickt wird vom eigenen Gerät – WhatsApp, SMS oder E-Mail öffnen sich mit diesem Text, „Senden“ tippst du dort.
        </span>
      </div>
    </div>
  );
}
