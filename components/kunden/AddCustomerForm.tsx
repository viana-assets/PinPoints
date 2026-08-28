import { useState } from "react";
import type { Employee } from "@/lib/types";
import { todayStr } from "@/lib/helpers";

// Formular "Neuer Kunde" (Tab "Neu"): legt einen Kunden an und kann optional im selben
// Schritt gleich einen ersten Auftrag mit anlegen. Ausgelagert aus app/page.tsx,
// siehe docs/roadmap.md Phase 2.
export function AddCustomerForm({ onAdd, employees }: {
  onAdd: (f: {
    name: string; address: string; phone_mobile: string; phone_landline: string; note: string;
    orderTitle: string; orderDescription: string; orderDate: string; orderTime: string; assignedEmployeeId: string;
  }) => Promise<boolean>;
  employees: Employee[];
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [mobile, setMobile] = useState("");
  const [landline, setLandline] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // Ruft z. B. ein neuer Kunde direkt an, kann im gleichen Zug schon der passende
  // Auftrag angelegt werden – Titel leer lassen, wenn (noch) kein Auftrag ansteht.
  const [orderTitle, setOrderTitle] = useState("");
  const [orderDesc, setOrderDesc] = useState("");
  const [orderDate, setOrderDate] = useState(todayStr());
  const [orderTime, setOrderTime] = useState("");
  const [empId, setEmpId] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      setStatus({ text: "Bitte Name und Adresse angeben.", ok: false });
      return;
    }
    setBusy(true);
    setStatus({ text: "Suche Adresse auf der Karte…", ok: true });
    const found = await onAdd({
      name: name.trim(), address: address.trim(), phone_mobile: mobile.trim(), phone_landline: landline.trim(), note: note.trim(),
      orderTitle, orderDescription: orderDesc, orderDate, orderTime, assignedEmployeeId: empId,
    });
    setBusy(false);
    setStatus(found
      ? { text: orderTitle.trim() ? "✔ Kunde und Auftrag angelegt, Kunde auf Karte platziert." : "✔ Kunde hinzugefügt und auf Karte platziert.", ok: true }
      : { text: "Adresse nicht gefunden – Kunde wurde ohne Kartenposition angelegt.", ok: false });
    setName(""); setAddress(""); setMobile(""); setLandline(""); setNote("");
    setOrderTitle(""); setOrderDesc(""); setOrderDate(todayStr()); setOrderTime(""); setEmpId("");
  }

  return (
    <form className="tabpanel active" onSubmit={submit}>
      <div className="field"><label>Name des Kunden *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Müller GmbH" /></div>
      <div className="field"><label>Adresse * (Straße, PLZ Ort)</label><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="z. B. Fürther Str. 12, 90429 Nürnberg" /></div>
      <div className="field"><label>Mobil (optional)</label><input type="text" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="0151 …" /></div>
      <div className="field"><label>Festnetz (optional)</label><input type="text" value={landline} onChange={(e) => setLandline(e.target.value)} placeholder="0911 …" /></div>
      <div className="field"><label>Notiz (optional)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Winterreifen 205/55 R16" /></div>

      <hr />
      <h4 style={{ margin: "0 0 2px" }}>Gleich einen Auftrag anlegen (optional)</h4>
      <div className="small" style={{ marginBottom: 6 }}>Z. B. wenn der Kunde gerade selbst anruft – Titel leer lassen, wenn noch kein Auftrag ansteht.</div>
      <div className="field"><label>Titel</label><input type="text" value={orderTitle} onChange={(e) => setOrderTitle(e.target.value)} placeholder="z. B. Reifenwechsel Winter" /></div>
      <div className="field"><label>Beschreibung (optional)</label><textarea value={orderDesc} onChange={(e) => setOrderDesc(e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>Datum</label><input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
        <div className="field"><label>Uhrzeit (optional)</label><input type="time" value={orderTime} onChange={(e) => setOrderTime(e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Mitarbeiter (optional)</label>
        <select value={empId} onChange={(e) => setEmpId(e.target.value)}>
          <option value="">Kein Mitarbeiter</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      <button className="btn-primary btn-block" type="submit" disabled={busy}>Kunde hinzufügen &amp; auf Karte platzieren</button>
      {status && <div className="small" style={{ color: status.ok ? "var(--green)" : "var(--red)" }}>{status.text}</div>}
    </form>
  );
}
