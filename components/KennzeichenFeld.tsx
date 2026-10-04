import type { InputHTMLAttributes } from "react";
import { kennzeichenGross } from "@/lib/kennzeichen";

// Eingabefeld für ein Kennzeichen (04.10.2026, v108): schreibt immer in Großbuchstaben.
//
// Anlass: Am iPhone musste man beim Anlegen eines Fahrzeugs vor jedem Buchstaben die Umschalttaste
// tippen. `autoCapitalize="characters"` stellt die Bildschirmtastatur von Anfang an auf groß; was
// trotzdem klein ankommt (Rechner-Tastatur, Einfügen, Android-Tastaturen, die den Hinweis
// übergehen), wird beim Tippen umgewandelt. Die Schreibmarke bleibt dabei stehen, wo sie war –
// sonst spränge sie bei jedem Buchstaben ans Ende.
//
// Verwendet überall, wo ein Kennzeichen eingetippt wird: Kundenfenster (Fahrzeuge), Auftrag
// („Neues Kennzeichen"), Einlagerung („+ Fahrzeug dieses Kunden anlegen"), Admin › Transporter.
export function KennzeichenFeld({ value, onWert, ...rest }:
  Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: string; onWert: (wert: string) => void }) {
  return (
    <input
      {...rest}
      type="text" value={value}
      autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
      onChange={(e) => {
        const el = e.target;
        const gross = kennzeichenGross(el.value);
        if (gross !== el.value) {
          const [a, b] = [el.selectionStart, el.selectionEnd];
          el.value = gross;
          if (a !== null && b !== null) el.setSelectionRange(a, b);
        }
        onWert(gross);
      }}
    />
  );
}
