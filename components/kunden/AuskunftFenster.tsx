import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { fetchKundeAuskunft } from "@/lib/api/customers";
import { auftragZeile, auskunftDateiname, auskunftUmfang, belegZeile, reifenNotizZeile, satzZeile, stammdatenZeilen, type AuskunftDaten, type Zeile } from "@/lib/auskunft";
import { formatEUR } from "@/lib/helpers";
import { auftragsNr } from "@/lib/testkunde";
import { PROTOKOLL_SCHWAERZEN_MONATE, RECHNUNG_SEITE_CSS } from "@/lib/constants";
import { Blatt } from "@/components/Blatt";
import { dateiHerunterladen } from "@/lib/download";

// Auskunftsauszug je Kunde (Fahrplan E10, v103): alles, was zu diesem Kunden gespeichert ist, als
// Schriftstück zum Ausdrucken oder „Als PDF sichern", und als Datei (JSON) für eine elektronische
// Kopie (Art. 15 Abs. 3 DSGVO). Nur Admin und Superadmin; die Datenbank prüft es
// (`kunde_auskunft()`, Migration 64).
//
// Gedruckt wird über die Druckfunktion des Browsers, wie die Rechnung: Das ist ein A4-Brief, kein
// Etikett, und er entsteht am Rechner im Büro. Der Abschnitt zu Zwecken, Rechtsgrundlagen und
// Speicherdauer ist ein Vorschlag – vor dem Versand mit der eigenen Datenschutzerklärung abgleichen;
// der Hinweis dazu steht nur in der App, nicht auf dem Papier.

function datum(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

// Gespeichert wird über lib/download.ts (seit v136 eine Funktion für alle Exporte).
const herunterladen = (name: string, inhalt: string) => dateiHerunterladen(name, inhalt, "application/json;charset=utf-8");

function Tabelle({ zeilen }: { zeilen: Zeile[] }) {
  return (
    <table className="ak-tabelle">
      <tbody>
        {zeilen.map(([a, b], i) => <tr key={i}><th>{a}</th><td>{b}</td></tr>)}
      </tbody>
    </table>
  );
}

export function AuskunftFenster({ kundeId, onClose }: { kundeId: string; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [daten, setDaten] = useState<AuskunftDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    fetchKundeAuskunft(supabase, kundeId)
      .then((d) => { if (!abgebrochen) setDaten(d); })
      .catch((e) => { if (!abgebrochen) setFehler(e instanceof Error ? e.message : String(e)); });
    return () => { abgebrochen = true; };
  }, [supabase, kundeId]);

  const b = daten?.betrieb;
  const verantwortlich = b ? [b.firma, b.inhaber && b.inhaber !== b.firma ? b.inhaber : null, b.strasse, [b.plz, b.ort].filter(Boolean).join(" "), b.telefon, b.email].filter((x) => !!x?.trim()).join(" · ") : "";

  return (
    // Seit v135 ein Blatt wie alle Fenster (components/Blatt.tsx, Breite „dokument“).
    <Blatt titel="Auskunft über gespeicherte Daten" label="Auskunftsauszug" breite="dokument"
      ebene="druck-fenster modal-rechnung" className="ak-fenster" onClose={onClose}
      fuss={daten ? <>
        <button type="button" className="btn-secondary" onClick={() => herunterladen(auskunftDateiname(daten, "json"), JSON.stringify(daten, null, 2))}>
          Als Datei (JSON)
        </button>
        <button type="button" className="btn-primary" onClick={() => window.print()}>Drucken / als PDF sichern</button>
      </> : undefined}>
      {/* A4 mit Rand – dieselbe Seite wie die Rechnung, eingehängt nur solange dieses Fenster offen ist. */}
      <style>{RECHNUNG_SEITE_CSS}</style>
      {fehler && <div className="hinweis-pflicht druck-weg">{fehler}</div>}
      {!daten && !fehler && <div className="db-leer druck-weg">Wird zusammengestellt …</div>}
      {daten && (
        <>
          <div className="hinweis-pflicht druck-weg">
            Zwecke, Rechtsgrundlagen und Speicherdauer unten sind ein Vorschlag – vor dem Versand mit der
            eigenen Datenschutzerklärung abgleichen. Der Auszug ist vertraulich: nur an die Person selbst.
          </div>
          <div className="druckbogen ak-dokument">
            <h1>Auskunft über die zu Ihrer Person gespeicherten Daten</h1>
            <p className="ak-klein">nach Art. 15 DSGVO · erstellt am {datum(daten.erstellt_am)}</p>
            {verantwortlich && <p><b>Verantwortlich:</b> {verantwortlich}</p>}

            <h2>Überblick</h2>
            <Tabelle zeilen={auskunftUmfang(daten)} />

            <h2>Stammdaten</h2>
            <Tabelle zeilen={stammdatenZeilen(daten.kunde)} />

            {daten.fahrzeuge.length > 0 && (<>
              <h2>Fahrzeuge</h2>
              <Tabelle zeilen={daten.fahrzeuge.map((f) => [f.kennzeichen || "ohne Kennzeichen", [f.modell, f.reifengroesse, f.notiz].filter(Boolean).join(" · ") || "–"])} />
            </>)}

            {daten.auftraege.length > 0 && (<>
              <h2>Aufträge und Termine</h2>
              <Tabelle zeilen={daten.auftraege.map(auftragZeile)} />
            </>)}

            {daten.reifensaetze.length > 0 && (<>
              <h2>Eingelagerte Reifen</h2>
              <Tabelle zeilen={daten.reifensaetze.map(satzZeile)} />
            </>)}

            {daten.reifen_notizen && daten.reifen_notizen.length > 0 && (<>
              <h2>Notizen zu einzelnen Reifen</h2>
              <Tabelle zeilen={daten.reifen_notizen.map(reifenNotizZeile)} />
            </>)}

            {daten.rechnungen.length > 0 && (<>
              <h2>Rechnungen</h2>
              <Tabelle zeilen={daten.rechnungen.map((r) => [`${r.nummer} · ${datum(r.datum)}`, `${r.art === "storno" ? "Stornorechnung" : "Rechnung"} · ${formatEUR(r.brutto)} brutto`])} />
            </>)}

            {daten.belege && daten.belege.length > 0 && (<>
              <h2>Fotos und Unterschriften</h2>
              <Tabelle zeilen={daten.belege.map(belegZeile)} />
              <p className="ak-klein">Die Bilder selbst geben wir Ihnen auf Wunsch als Dateien heraus.</p>
            </>)}

            {daten.kontakte.length > 0 && (<>
              <h2>Kontakte</h2>
              <Tabelle zeilen={daten.kontakte.map((k) => [datum(k.datum), k.notiz || "Kontakt"])} />
            </>)}

            <h2>Änderungsprotokoll</h2>
            <p>
              {daten.protokoll.eintraege === 0
                ? "Zu Ihren Daten gibt es keine Einträge im Änderungsprotokoll."
                : `Das Änderungsprotokoll hält fest, wer wann einen Datensatz angelegt oder geändert hat. Zu Ihren Daten gibt es ${daten.protokoll.eintraege} Einträge (${datum(daten.protokoll.aeltester)} bis ${datum(daten.protokoll.neuester)}). Personenbezogene Inhalte darin werden nach ${PROTOKOLL_SCHWAERZEN_MONATE} Monaten geschwärzt.`}
            </p>

            <h2>Zwecke, Rechtsgrundlagen, Speicherdauer</h2>
            <p>
              Wir verarbeiten Ihre Daten, um Aufträge zu planen und auszuführen, Ihre Reifen einzulagern,
              Termine mit Ihnen abzustimmen und Leistungen abzurechnen (Art. 6 Abs. 1 lit. b DSGVO), sowie zur
              Erfüllung gesetzlicher Aufbewahrungspflichten für Rechnungen und Buchungsbelege (Art. 6 Abs. 1
              lit. c DSGVO). Die Daten stammen von Ihnen selbst. Sie werden gespeichert, solange die
              Geschäftsbeziehung besteht; Rechnungen für die Dauer der gesetzlichen Aufbewahrungsfristen.
              {daten.belege && daten.belege.length > 0 && " Fotos und Ihre Unterschrift halten den Zustand Ihres Fahrzeugs und die ausgeführte Arbeit fest, damit sich bei einer Reklamation nachvollziehen lässt, was gemacht wurde."}
            </p>
            <p>
              Empfänger: Dienstleister, die für uns Hosting und Datenbank betreiben (Auftragsverarbeitung). Zur
              Anzeige Ihres Standorts auf der Karte wird die Anschrift an einen Kartendienst übermittelt.
            </p>
            <p>
              Sie haben das Recht auf Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit
              und Widerspruch sowie das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
            </p>
            {daten.auftraege.some((a) => a.nummer < 0) && <p className="ak-klein">Enthält Testaufträge ({daten.auftraege.filter((a) => a.nummer < 0).map((a) => auftragsNr(a.nummer)).join(", ")}).</p>}
          </div>
        </>
      )}
    </Blatt>
  );
}
