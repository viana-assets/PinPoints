// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChatFenster } from "@/components/chat/ChatFenster";
import { ChatBlase } from "@/components/chat/ChatBlase";
import { PlatzBlatt } from "@/components/lager/PlatzBlatt";
import type { ChatBezug, ChatNachricht, ChatPerson } from "@/lib/chat";

// Der Team-Chat in der Oberfläche (Migration 80, v129).

beforeAll(() => {
  window.matchMedia ||= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  window.HTMLElement.prototype.scrollIntoView ||= () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const personen: ChatPerson[] = [
  { id: "ich", name: "Vitali", rolle: "admin" },
  { id: "jan", name: "Jan", rolle: "techniker" },
];
const auftrag: ChatBezug = { art: "auftrag", id: "o1", titel: "Auftrag #114 · Räderwechsel", unter: "Uwe Brenner · Do 8.10." };
const nachrichten: ChatNachricht[] = [
  { id: "n1", autor: "jan", text: "@Vitali was soll ich berechnen?", bezug_art: "auftrag", bezug_id: "o1", bezug_titel: auftrag.titel, bezug_unter: auftrag.unter, erwaehnt: ["ich"], created_at: new Date().toISOString() },
  { id: "n2", autor: "ich", text: "12,50 je Rad", bezug_art: "kunde", bezug_id: "c1", bezug_titel: "Kunde gelöscht", bezug_unter: null, erwaehnt: [], created_at: new Date().toISOString() },
];

function fenster(teil: Partial<Parameters<typeof ChatFenster>[0]> = {}) {
  const props = {
    nachrichten, laedt: false, fehler: null, personen, ichId: "ich", darfSchreiben: true, online: true,
    bezug: null, onBezug: vi.fn(), vorschlaege: () => [auftrag],
    onSenden: vi.fn(async () => {}), onReagieren: vi.fn(async () => {}), kannOeffnen: () => true, onBezugOeffnen: vi.fn(), onClose: vi.fn(),
    ...teil,
  };
  render(<ChatFenster {...props} />);
  return props;
}

describe("Team-Chat", () => {
  it("zeigt Name, Karte und Erwähnung; die Karte öffnet den Auftrag, eine gelöschte nichts", () => {
    const p = fenster();
    expect(screen.getByText("Jan")).toBeTruthy();
    expect(screen.getByText("@Vitali").className).toBe("ch-at");
    fireEvent.click(screen.getByText("Auftrag #114 · Räderwechsel"));
    expect(p.onBezugOeffnen).toHaveBeenCalledWith(expect.objectContaining({ art: "auftrag", id: "o1" }));
    expect(screen.getByText("Kunde gelöscht").closest("button")).toBeNull();
  });

  it("@ schlägt Personen vor, die Auswahl landet im Text und als Erwähnung", async () => {
    const p = fenster();
    const feld = screen.getByLabelText("Nachricht") as HTMLTextAreaElement;
    fireEvent.change(feld, { target: { value: "Danke @J", selectionStart: 8 } });
    fireEvent.click(screen.getByRole("option", { name: /Jan/ }));
    expect(feld.value).toBe("Danke @Jan ");
    fireEvent.change(feld, { target: { value: "Danke @Jan erledigt", selectionStart: 19 } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(p.onSenden).toHaveBeenCalledWith({ text: "Danke @Jan erledigt", bezug: null, erwaehnt: ["jan"], antwortAuf: null, foto: null }));
  });

  it("die angehängte Karte geht mit und lässt sich entfernen; „+“ hängt eine an", () => {
    const p = fenster({ bezug: auftrag });
    fireEvent.click(screen.getByRole("button", { name: "Karte entfernen" }));
    expect(p.onBezug).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Auftrag oder Kunde anhängen" }));
    fireEvent.change(screen.getByLabelText("Auftrag oder Kunde suchen"), { target: { value: "114" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "Karte anhängen" })).getByText("Auftrag #114 · Räderwechsel"));
    expect(p.onBezug).toHaveBeenCalledWith(auftrag);
  });

  it("ohne Netz gesperrt, ohne Schreibrecht nur lesen", () => {
    fenster({ online: false });
    fireEvent.change(screen.getByLabelText("Nachricht"), { target: { value: "hallo" } });
    expect((screen.getByRole("button", { name: "Senden" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Ohne Netz/)).toBeTruthy();
    cleanup();
    fenster({ darfSchreiben: false });
    expect(screen.queryByLabelText("Nachricht")).toBeNull();
    expect(screen.getByText(/nur mitlesen|mitlesen, aber nicht schreiben/)).toBeTruthy();
  });

  it("die Blase zeigt die Zahl, ab 100 als 99+", () => {
    render(<ChatBlase zahl={3} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Team-Chat, 3 ungelesen" })).toBeTruthy();
    cleanup();
    render(<ChatBlase zahl={0} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Team-Chat" }).textContent).toBe("");
    cleanup();
    render(<ChatBlase zahl={150} onClick={() => {}} />);
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("Reaktion: Leiste öffnen, 👍 setzen; meine ❤️ unter der Nachricht nimmt sie zurück (Migration 81)", async () => {
    const mitReaktion = [{ ...nachrichten[0], reaktionen: [{ profile_id: "ich", emoji: "❤️" }, { profile_id: "jan", emoji: "❤️" }] }, nachrichten[1]];
    const p = fenster({ nachrichten: mitReaktion });
    const chip = screen.getByRole("button", { name: "❤️ 2: Du, Jan" });
    fireEvent.click(chip);
    await waitFor(() => expect(p.onReagieren).toHaveBeenCalledWith("n1", null));
    fireEvent.click(screen.getAllByRole("button", { name: "Reagieren oder antworten" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Reaktion 👍" }));
    await waitFor(() => expect(p.onReagieren).toHaveBeenCalledWith("n1", "👍"));
  });

  it("Antworten: Zitat an der Eingabe, geht mit; im Verlauf steht das Zitat über der Antwort", async () => {
    const mitAntwort = [...nachrichten, { ...nachrichten[1], id: "n3", text: "Mach ich", antwort_auf: "n1", bezug_art: null, bezug_id: null, bezug_titel: null }];
    const p = fenster({ nachrichten: mitAntwort });
    expect(screen.getByRole("button", { name: "Antwort auf Jan" }).textContent).toContain("was soll ich berechnen?");
    fireEvent.click(screen.getAllByRole("button", { name: "Reagieren oder antworten" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "↩ Antworten" }));
    expect(screen.getByText("Antwort an Jan")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nachricht"), { target: { value: "ok", selectionStart: 2 } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(p.onSenden).toHaveBeenCalledWith(expect.objectContaining({ text: "ok", antwortAuf: "n1" })));
    await waitFor(() => expect(screen.queryByText("Antwort an Jan")).toBeNull());
  });

  it("ohne Schreibrecht keine Reaktionsknöpfe", () => {
    fenster({ darfSchreiben: false, onReagieren: undefined });
    expect(screen.queryByRole("button", { name: "Reagieren oder antworten" })).toBeNull();
  });

  it("Lagerplatz: „In den Chat“ nur mit dem Recht", () => {
    const props = {
      slot: { id: "p1", warehouse_id: "w1", code: "A-11", note: null, created_at: "" }, wo: "Hauptlager", satz: null, kunde: null, fahrzeug: null,
      raeder: [], gruende: [], verlauf: [], customers: [], raederFuer: () => [], lagergebuehrJeMonat: null,
      canAssign: false, canDelete: false, onClose: () => {}, onAuslagern: () => {}, onBearbeiten: () => {}, onEtikett: () => {},
      onAufkleber: () => {}, onLoeschen: () => {},
    };
    render(<PlatzBlatt {...props} />);
    expect(screen.queryByRole("button", { name: "In den Chat" })).toBeNull();
    cleanup();
    const onInDenChat = vi.fn();
    render(<PlatzBlatt {...props} onInDenChat={onInDenChat} />);
    fireEvent.click(screen.getByRole("button", { name: "In den Chat" }));
    expect(onInDenChat).toHaveBeenCalled();
  });

  // Einzelchats, Bearbeiten/Löschen, Fotos, Ältere laden (Migration 84, v137)
  it("Bearbeiten: eigene Nachricht in die Eingabe, ✓ speichert; „bearbeitet“ an der Uhrzeit", async () => {
    const onBearbeiten = vi.fn(async () => {});
    const liste = [nachrichten[0], { ...nachrichten[1], bearbeitet_am: new Date().toISOString() }];
    fenster({ nachrichten: liste, onBearbeiten, onLoeschen: vi.fn(async () => {}) });
    expect(screen.getByText(/bearbeitet ·/)).toBeTruthy();
    // Fremde Nachricht: kein Bearbeiten
    fireEvent.click(screen.getAllByRole("button", { name: "Reagieren oder antworten" })[0]);
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Reagieren oder antworten" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    const feld = screen.getByLabelText("Nachricht") as HTMLTextAreaElement;
    expect(feld.value).toBe("12,50 je Rad");
    expect(screen.getByText("Nachricht bearbeiten")).toBeTruthy();
    fireEvent.change(feld, { target: { value: "13,00 je Rad", selectionStart: 12 } });
    fireEvent.click(screen.getByRole("button", { name: "Änderung speichern" }));
    await waitFor(() => expect(onBearbeiten).toHaveBeenCalledWith("n2", "13,00 je Rad"));
    await waitFor(() => expect(screen.queryByText("Nachricht bearbeiten")).toBeNull());
  });

  it("nach 24 Stunden kein Bearbeiten mehr, Löschen schon – mit Rückfrage; gelöscht steht „Nachricht gelöscht“", async () => {
    const onLoeschen = vi.fn(async () => {});
    const alt = { ...nachrichten[1], created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() };
    fenster({ nachrichten: [alt], onBearbeiten: vi.fn(async () => {}), onLoeschen });
    fireEvent.click(screen.getByRole("button", { name: "Reagieren oder antworten" }));
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(screen.getByText(/für alle löschen/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(onLoeschen).toHaveBeenCalledWith("n2"));
    cleanup();
    fenster({ nachrichten: [{ ...nachrichten[1], text: "", geloescht_am: new Date().toISOString(), reaktionen: [{ profile_id: "jan", emoji: "👍" }] }] });
    expect(screen.getByText("Nachricht gelöscht")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reagieren oder antworten" })).toBeNull();
    expect(screen.queryByRole("button", { name: /👍/ })).toBeNull();
  });

  it("Foto: auswählen, Vorschau, geht mit der Nachricht; im Verlauf groß ansehen", async () => {
    // jsdom kennt keine Blob-Adressen (Nodes eigene erwartet einen Node-Blob).
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:vorschau");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const klein = { blob: new Blob(["x"], { type: "image/jpeg" }), breite: 1600, hoehe: 1200 };
    const p = fenster({ fotoVerkleinern: async () => klein });
    const datei = new File(["roh"], "foto.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Foto auswählen"), { target: { files: [datei] } });
    await waitFor(() => expect(screen.getByAltText("Gewähltes Foto")).toBeTruthy());
    // Ohne Text sendbar
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(p.onSenden).toHaveBeenCalledWith(expect.objectContaining({ text: "", foto: klein })));
    cleanup();
    const mitFoto = [{ ...nachrichten[1], text: "", foto_pfad: "ich/a.jpg", foto_breite: 1600, foto_hoehe: 1200 }];
    fenster({ nachrichten: mitFoto, fotoLinks: { "ich/a.jpg": "https://bild.example/a" } });
    fireEvent.click(screen.getByRole("button", { name: "Foto groß ansehen" }));
    expect((screen.getByAltText("Foto im Chat, groß") as HTMLImageElement).src).toBe("https://bild.example/a");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByAltText("Foto im Chat, groß")).toBeNull();
  });

  it("Liste der Chats: Team oben, Einzelchats mit Zahl, neue Unterhaltung; die Zahl der anderen steht am Knopf", () => {
    const onWechseln = vi.fn();
    const unterhaltungen = [
      { partner: null, letzte_am: new Date().toISOString(), letzte_von: "jan", letzte_text: "Moin", letzte_foto: false, ungelesen: 0 },
      { partner: "jan", letzte_am: new Date().toISOString(), letzte_von: "jan", letzte_text: "Kurz Zeit?", letzte_foto: false, ungelesen: 2 },
    ];
    const mehrPersonen = [...personen, { id: "mira", name: "Mira", rolle: "user" }];
    fenster({ unterhaltungen, onWechseln, personen: mehrPersonen });
    fireEvent.click(screen.getByRole("button", { name: "Alle Chats, 2 ungelesen" }));
    const zeilen = screen.getAllByRole("listitem");
    expect(zeilen.map((z) => z.querySelector("b")?.textContent)).toEqual(["Team-Chat", "Jan", "Mira"]);
    expect(screen.getByText("NEUE UNTERHALTUNG")).toBeTruthy();
    expect(within(zeilen[0]).getByText("Jan: Moin")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Jan, 2 ungelesen" }));
    expect(onWechseln).toHaveBeenCalledWith("jan");
  });

  it("Einzelchat: Kopf mit Namen, keine @-Vorschläge, kein Name über fremden Nachrichten", () => {
    fenster({ partner: "jan", onWechseln: vi.fn(), nachrichten: [{ ...nachrichten[0], kanal: "direkt", an: "ich", erwaehnt: [] }] });
    expect(screen.getByRole("dialog", { name: "Einzelchat mit Jan" })).toBeTruthy();
    expect(screen.getByText(/nur ihr beide/)).toBeTruthy();
    expect(screen.queryByText("Jan", { selector: ".ch-wer" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Nachricht"), { target: { value: "@J", selectionStart: 2 } });
    expect(screen.queryByRole("listbox", { name: "Erwähnen" })).toBeNull();
    expect((screen.getByLabelText("Nachricht") as HTMLTextAreaElement).placeholder).toBe("Nachricht an Jan");
  });

  it("Ältere Nachrichten laden", () => {
    const onMehrLaden = vi.fn();
    fenster({ hatMehr: true, onMehrLaden });
    fireEvent.click(screen.getByRole("button", { name: "Ältere Nachrichten laden" }));
    expect(onMehrLaden).toHaveBeenCalled();
    cleanup();
    fenster({ hatMehr: false, onMehrLaden });
    expect(screen.queryByRole("button", { name: "Ältere Nachrichten laden" })).toBeNull();
  });
});
