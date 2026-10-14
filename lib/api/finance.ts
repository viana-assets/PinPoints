import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, fetchPaged, q, qOne, qWrite } from "./client";
import type { FinEinstellungen, Kontenrahmen } from "@/lib/finance/einstellungen";
import type { FinBuchung, FinFestschreibung, FinKonto, FinPosten, FinSteuerschluessel } from "@/lib/finance/buchung";
import { standLesen, type FinRechnungenStand } from "@/lib/finance/rechnungen";
import { FIN_BELEG_BUCKET, belegDateiPfad, istXml, type FinBeleg, type FinLieferant } from "@/lib/finance/belege";
import type { FinBankimport, FinBankkonto, FinBankumsatz, Kontoauszug } from "@/lib/finance/bank";
import { ustStandLesen, type FinUstStand } from "@/lib/finance/steuern";
import type { FinAnlage } from "@/lib/finance/anlagen";
import type { FinMahnung } from "@/lib/finance/mahnung";
import type { FinPlanposten } from "@/lib/finance/liquiditaet";
import { protokolleLesen, type FinExportBeleg, type FinExportProtokoll } from "@/lib/finance/export";
import { vortragLesen, type AbschlussArt, type FinAbschlussposten, type FinVortragStand } from "@/lib/finance/abschluss";
import { euerLesen, saldenLesen, type FinEuerStand, type FinKontenblattZeile, type FinSaldo } from "@/lib/finance/auswertungen";

// Finance (Migration 87–92, docs/finance.md). F0 (v145): Einstellungen je Wirtschaftsjahr; F1 (v146): Konten, Journal;
// F3 (v147): Rechnungen mit „Rechnung nötig“, Zahlungen; F2 (v148): Belege, Lieferanten, Belegdateien;
// F4 (v149): Bankkonten, Kontoauszüge, Abgleich; F5 (v150): Umsatzsteuer-Voranmeldung (Probelauf).
// Lesen mit dem Recht „finance“, schreiben mit „finance.einstellungen“ – durchgesetzt von RLS.

export type FinEinstellungenStand =
  // Migration 87 ist noch nicht gelaufen: Die Seite sagt das, statt mit einem Fehler leer zu bleiben.
  | { status: "fehlt" }
  // `einstellungen: null` = für dieses Jahr noch nichts gespeichert (die Seite zeigt die Vorgabe).
  | { status: "da"; einstellungen: FinEinstellungen | null };

// Tabelle unbekannt: Postgres 42P01, PostgREST PGRST205 („not in the schema cache“).
const TABELLE_FEHLT = new Set(["42P01", "PGRST205"]);

const SPALTEN =
  "wirtschaftsjahr, rechtsform, gewinnermittlung, kontenrahmen, besteuerung, versteuerung, voranmeldung, dauerfrist, r13b_empfaenger, innergemeinschaftlich, wj_beginn_monat, start_datum, sammelposten, aktualisiert_am";

export async function fetchFinEinstellungen(supabase: SupabaseClient, jahr: number): Promise<FinEinstellungenStand> {
  try {
    const zeile = await q<FinEinstellungen>(
      "Die Finance-Einstellungen konnten nicht geladen werden",
      supabase.from("fin_einstellungen").select(SPALTEN).eq("wirtschaftsjahr", jahr).maybeSingle()
    );
    return { status: "da", einstellungen: zeile ?? null };
  } catch (e) {
    if (e instanceof ApiError && e.code && TABELLE_FEHLT.has(e.code)) return { status: "fehlt" };
    throw e;
  }
}

// Anlegen oder ändern in einem: je Wirtschaftsjahr gibt es genau eine Zeile (Primärschlüssel).
// Wer wann geändert hat, setzt die Datenbank (Trigger `fin_einstellungen_stempel`).
export async function saveFinEinstellungen(supabase: SupabaseClient, e: FinEinstellungen): Promise<void> {
  const { aktualisiert_am: _weg, ...felder } = e;
  void _weg;
  await qWrite(
    "Die Finance-Einstellungen konnten nicht gespeichert werden",
    supabase.from("fin_einstellungen").upsert(felder, { onConflict: "wirtschaftsjahr" })
  );
}

// ---------------------------------------------------------------- F1: Konten, Journal (Migration 88, v146)

export async function fetchFinKonten(supabase: SupabaseClient, rahmen: Kontenrahmen): Promise<FinKonto[]> {
  return fetchPaged<FinKonto>("Die Konten konnten nicht geladen werden", (von, bis) =>
    supabase.from("fin_konten").select("kontenrahmen, nummer, bezeichnung, kategorie, eigen, aktiv")
      .eq("kontenrahmen", rahmen).order("nummer").range(von, bis));
}

export async function fetchFinSteuerschluessel(supabase: SupabaseClient, rahmen: Kontenrahmen): Promise<FinSteuerschluessel[]> {
  const zeilen = await q<FinSteuerschluessel[]>("Die Steuerschlüssel konnten nicht geladen werden",
    supabase.from("fin_steuerschluessel").select("kontenrahmen, schluessel, bezeichnung, satz, art, ust_konto, vst_konto")
      .eq("kontenrahmen", rahmen).order("schluessel"));
  // numeric kommt als Text oder Zahl – einheitlich als Zahl.
  return (zeilen ?? []).map((s) => ({ ...s, satz: Number(s.satz) }));
}

// Das Journal eines Jahres mit allen Zeilen. Sortiert nach Nummer und id – eindeutig für das Blättern.
export async function fetchFinBuchungen(supabase: SupabaseClient, jahr: number): Promise<FinBuchung[]> {
  const alle = await fetchPaged<FinBuchung>("Die Buchungen konnten nicht geladen werden", (von, bis) =>
    supabase.from("fin_buchungen")
      .select("id, jahr, nr, datum, text, beleg, quelle, quelle_id, storno_von, storniert_durch, grund, erstellt_am, fin_buchungszeilen(id, posten, seite, konto, betrag, steuerschluessel, ist_steuer)")
      .eq("jahr", jahr).order("nr").order("id").range(von, bis));
  return alle.map((b) => ({
    ...b,
    fin_buchungszeilen: [...(b.fin_buchungszeilen ?? [])]
      .map((z) => ({ ...z, betrag: Number(z.betrag) }))
      .sort((a, c) => (a.id ?? 0) - (c.id ?? 0)),
  }));
}

export async function fetchFinFestschreibungen(supabase: SupabaseClient, jahr: number): Promise<FinFestschreibung[]> {
  return (await q<FinFestschreibung[]>("Die Festschreibungen konnten nicht geladen werden",
    supabase.from("fin_festschreibungen").select("jahr, monat, am").eq("jahr", jahr).order("monat"))) ?? [];
}

export type FinNeueBuchung = { datum: string; text: string; beleg: string; posten: FinPosten[] };

// Die Datenbank rechnet die Steuer, schreibt die Zeilen und vergibt die Nummer (`fin_buchen()`).
export async function finBuchen(supabase: SupabaseClient, b: FinNeueBuchung): Promise<{ id: string; jahr: number; nr: number }> {
  const r = await q<{ id: string; jahr: number; nr: number }>("Nicht gebucht",
    supabase.rpc("fin_buchen", { p_datum: b.datum, p_text: b.text, p_beleg: b.beleg, p_posten: b.posten }));
  if (!r) throw new ApiError("Nicht gebucht", { message: "Die Datenbank hat keine Nummer zurückgegeben." });
  return r;
}

export async function finStornieren(supabase: SupabaseClient, id: string, grund: string): Promise<{ id: string; jahr: number; nr: number }> {
  const r = await q<{ id: string; jahr: number; nr: number }>("Nicht storniert",
    supabase.rpc("fin_stornieren", { p_id: id, p_grund: grund }));
  if (!r) throw new ApiError("Nicht storniert", { message: "Die Datenbank hat keine Nummer zurückgegeben." });
  return r;
}

export async function finMonatFestschreiben(supabase: SupabaseClient, jahr: number, monat: number): Promise<number> {
  return (await q<number>("Nicht festgeschrieben", supabase.rpc("fin_monat_festschreiben", { p_jahr: jahr, p_monat: monat }))) ?? 0;
}

export async function finKontoAnlegen(supabase: SupabaseClient, k: Pick<FinKonto, "kontenrahmen" | "nummer" | "bezeichnung" | "kategorie">): Promise<void> {
  await qWrite("Das Konto konnte nicht angelegt werden", supabase.from("fin_konten").insert({ ...k, eigen: true }));
}

export async function finKontoAktiv(supabase: SupabaseClient, rahmen: Kontenrahmen, nummer: number, aktiv: boolean): Promise<void> {
  await qWrite("Das Konto konnte nicht geändert werden",
    supabase.from("fin_konten").update({ aktiv }).eq("kontenrahmen", rahmen).eq("nummer", nummer));
}

// ---------------------------------------------------------------- F3: Rechnungen, Zahlungen (Migration 89, v147)

export async function fetchFinRechnungenStand(supabase: SupabaseClient, jahr: number): Promise<FinRechnungenStand> {
  const roh = await q<unknown>("Finance › Rechnungen konnte nicht geladen werden", supabase.rpc("fin_rechnungen_stand", { p_jahr: jahr }));
  return standLesen(roh);
}

export async function finRechnungNachbuchen(supabase: SupabaseClient, rechnungId: string): Promise<void> {
  await q("Nicht gebucht", supabase.rpc("fin_rechnung_nachbuchen", { p_rechnung: rechnungId }));
}

export async function finRechnungBezahlt(supabase: SupabaseClient, rechnungId: string, art: "bar" | "bank", datum: string): Promise<{ nr: number }> {
  const r = await q<{ nr: number }>("Zahlung nicht erfasst", supabase.rpc("fin_rechnung_bezahlt", { p_rechnung: rechnungId, p_art: art, p_datum: datum }));
  return r ?? { nr: 0 };
}

export async function finZahlungZuruecknehmen(supabase: SupabaseClient, rechnungId: string, grund: string): Promise<void> {
  await q("Zahlung nicht zurückgenommen", supabase.rpc("fin_zahlung_zuruecknehmen", { p_rechnung: rechnungId, p_grund: grund }));
}

// ---------------------------------------------------------------- F2: Belege, Lieferanten (Migration 90, v148)

const BELEG_SPALTEN = "id, lieferant_id, belegdatum, belegnummer, text, faellig_am, posten, datei_pfad, datei_typ, datei_name, status, brutto, buchung_id, bezahlt_am, bezahlt_art, erstellt_am";

export async function fetchFinLieferanten(supabase: SupabaseClient): Promise<FinLieferant[]> {
  return (await q<FinLieferant[]>("Die Lieferanten konnten nicht geladen werden",
    supabase.from("fin_lieferanten").select("id, name, ust_id, konto, steuer, aktiv").order("name").order("id").range(0, 1999))) ?? [];
}

export async function finLieferantAnlegen(supabase: SupabaseClient, l: Pick<FinLieferant, "name" | "ust_id" | "konto" | "steuer">): Promise<FinLieferant> {
  return qOne<FinLieferant>("Der Lieferant konnte nicht angelegt werden",
    supabase.from("fin_lieferanten").insert({ ...l, name: l.name.trim() }).select("id, name, ust_id, konto, steuer, aktiv").single());
}

export async function finLieferantAendern(supabase: SupabaseClient, id: string, felder: Partial<Pick<FinLieferant, "name" | "ust_id" | "konto" | "steuer" | "aktiv">>): Promise<void> {
  await qWrite("Der Lieferant konnte nicht geändert werden", supabase.from("fin_lieferanten").update(felder).eq("id", id));
}

// Alle Entwürfe und die Belege des Jahres (Belegdatum). Ein Entwurf ist Arbeit – er gehört dazu, egal wie alt.
export async function fetchFinBelege(supabase: SupabaseClient, jahr: number): Promise<FinBeleg[]> {
  const alle = await fetchPaged<FinBeleg>("Die Belege konnten nicht geladen werden", (von, bis) =>
    supabase.from("fin_belege").select(BELEG_SPALTEN)
      .or(`status.eq.entwurf,and(belegdatum.gte.${jahr}-01-01,belegdatum.lte.${jahr}-12-31)`)
      .order("belegdatum", { ascending: false }).order("id").range(von, bis));
  // Teilzahlungen (Migration 93) je Beleg dazu – bezahlt ist ein Beleg erst mit `bezahlt_am`.
  const teile = await q<{ ziel_id: string; betrag: number }[]>("Die Teilzahlungen konnten nicht geladen werden",
    supabase.from("fin_teilzahlungen").select("id, ziel_id, betrag").eq("art", "beleg").eq("storniert", false).order("id").range(0, 4999));
  const teil = new Map<string, number>();
  for (const t of teile ?? []) teil.set(t.ziel_id, (teil.get(t.ziel_id) ?? 0) + Number(t.betrag));
  return alle.map((b) => ({
    ...b,
    teilbezahlt: Math.round((teil.get(b.id) ?? 0) * 100) / 100,
    brutto: b.brutto == null ? null : Number(b.brutto),
    posten: (b.posten ?? []).map((p) => ({ konto: p.konto ?? null, betrag: p.betrag == null ? null : Number(p.betrag), steuer: p.steuer ?? null })),
  }));
}

export type FinBelegFelder = Pick<FinBeleg, "lieferant_id" | "belegdatum" | "belegnummer" | "text" | "faellig_am" | "posten">;

// Ein Entwurf: anlegen (ohne id) oder ändern. Gebuchte Belege lehnt die Datenbank ab (fin_beleg_pruefen).
export async function finBelegSpeichern(supabase: SupabaseClient, id: string | null, felder: FinBelegFelder): Promise<string> {
  if (id) {
    await qWrite("Der Beleg konnte nicht gespeichert werden", supabase.from("fin_belege").update(felder).eq("id", id));
    return id;
  }
  const r = await qOne<{ id: string }>("Der Beleg konnte nicht angelegt werden", supabase.from("fin_belege").insert(felder).select("id").single());
  return r.id;
}

function belegSpeicherFehler(meldung: string): string {
  if (/row-level security|unauthorized|403/i.test(meldung)) return "Keine Berechtigung – Dateien gibt es nur zu einem Entwurf.";
  if (/bucket not found/i.test(meldung)) return "Der Speicher für Belege fehlt – Migration 90 ist nicht ausgeführt.";
  if (/payload too large|exceeded the maximum|413/i.test(meldung)) return "Die Datei ist zu groß (höchstens 10 MB).";
  if (/mime|type/i.test(meldung)) return "Diese Dateiart nimmt der Speicher nicht an.";
  return `Die Datei konnte nicht hochgeladen werden (${meldung}).`;
}

// Erst die neue Datei, dann der Eintrag am Beleg, zuletzt die alte Datei weg – so bleibt im schlimmsten
// Fall eine Datei ohne Eintrag (unsichtbar), nie ein Eintrag ohne Datei (lib/api/belege.ts, gleiches Muster).
export async function finBelegDateiHochladen(supabase: SupabaseClient, belegId: string, datei: Blob, name: string, alterPfad: string | null): Promise<string> {
  const typ = istXml({ type: datei.type, name }) ? "application/xml" : datei.type;
  const pfad = belegDateiPfad(belegId, name, new Date());
  const { error } = await supabase.storage.from(FIN_BELEG_BUCKET).upload(pfad, datei, { contentType: typ, upsert: false });
  if (error) throw new Error(belegSpeicherFehler(error.message));
  await qWrite("Die Datei ist hochgeladen, aber nicht am Beleg eingetragen",
    supabase.from("fin_belege").update({ datei_pfad: pfad, datei_typ: typ, datei_name: name.slice(0, 120) }).eq("id", belegId));
  if (alterPfad) await supabase.storage.from(FIN_BELEG_BUCKET).remove([alterPfad]);
  return pfad;
}

export async function finBelegDateiLink(supabase: SupabaseClient, pfad: string): Promise<string> {
  const { data, error } = await supabase.storage.from(FIN_BELEG_BUCKET).createSignedUrl(pfad, 15 * 60);
  if (error || !data?.signedUrl) throw new Error("Die Datei konnte nicht geöffnet werden.");
  return data.signedUrl;
}

// Entwurf verwerfen: erst die Datei, dann die Zeile.
export async function finBelegVerwerfen(supabase: SupabaseClient, b: Pick<FinBeleg, "id" | "datei_pfad">): Promise<void> {
  if (b.datei_pfad) await supabase.storage.from(FIN_BELEG_BUCKET).remove([b.datei_pfad]);
  await qWrite("Der Entwurf konnte nicht verworfen werden", supabase.from("fin_belege").delete().eq("id", b.id));
}

export async function finBelegBuchen(supabase: SupabaseClient, id: string, bezahlt: "bar" | "bank" | null, bezahltAm: string | null): Promise<{ nr: number; brutto: number }> {
  const r = await q<{ nr: number; brutto: number }>("Nicht gebucht",
    supabase.rpc("fin_beleg_buchen", { p_beleg: id, p_bezahlt: bezahlt, p_bezahlt_am: bezahltAm }));
  return { nr: r?.nr ?? 0, brutto: Number(r?.brutto ?? 0) };
}

export async function finBelegBezahlt(supabase: SupabaseClient, id: string, art: "bar" | "bank", datum: string): Promise<{ nr: number }> {
  return (await q<{ nr: number }>("Zahlung nicht erfasst", supabase.rpc("fin_beleg_bezahlt", { p_beleg: id, p_art: art, p_datum: datum }))) ?? { nr: 0 };
}

export async function finBelegZahlungZuruecknehmen(supabase: SupabaseClient, id: string, grund: string): Promise<void> {
  await q("Zahlung nicht zurückgenommen", supabase.rpc("fin_beleg_zahlung_zuruecknehmen", { p_beleg: id, p_grund: grund }));
}

export async function finBelegStornieren(supabase: SupabaseClient, id: string, grund: string): Promise<void> {
  await q("Nicht storniert", supabase.rpc("fin_beleg_stornieren", { p_beleg: id, p_grund: grund }));
}

// ---------------------------------------------------------------- F4: Bank, Kasse (Migration 91, v149)

const BANKUMSATZ_SPALTEN = "id, bankkonto_id, import_id, datum, valuta, betrag, zweck, name, iban, referenz, status, zuordnung, zuordnung_id, buchung_id, notiz";

export async function fetchFinBankkonten(supabase: SupabaseClient): Promise<FinBankkonto[]> {
  return (await q<FinBankkonto[]>("Die Bankkonten konnten nicht geladen werden",
    supabase.from("fin_bankkonten").select("id, name, iban, konto, aktiv").order("name").order("id"))) ?? [];
}

export async function finBankkontoAnlegen(supabase: SupabaseClient, k: Pick<FinBankkonto, "name" | "iban" | "konto">): Promise<FinBankkonto> {
  return qOne<FinBankkonto>("Das Bankkonto konnte nicht angelegt werden",
    supabase.from("fin_bankkonten").insert({ ...k, name: k.name.trim() }).select("id, name, iban, konto, aktiv").single());
}

export async function finBankkontoAendern(supabase: SupabaseClient, id: string, felder: Partial<Pick<FinBankkonto, "name" | "iban" | "konto" | "aktiv">>): Promise<void> {
  await qWrite("Das Bankkonto konnte nicht geändert werden", supabase.from("fin_bankkonten").update(felder).eq("id", id));
}

// Alle offenen Umsätze (egal wie alt – sie sind Arbeit) und alle des Jahres.
export async function fetchFinBankumsaetze(supabase: SupabaseClient, jahr: number): Promise<FinBankumsatz[]> {
  const alle = await fetchPaged<FinBankumsatz>("Die Bankumsätze konnten nicht geladen werden", (von, bis) =>
    supabase.from("fin_bankumsaetze").select(BANKUMSATZ_SPALTEN)
      .or(`status.eq.offen,and(datum.gte.${jahr}-01-01,datum.lte.${jahr}-12-31)`)
      .order("datum", { ascending: false }).order("id").range(von, bis));
  return alle.map((u) => ({ ...u, betrag: Number(u.betrag) }));
}

export async function fetchFinBankimporte(supabase: SupabaseClient): Promise<FinBankimport[]> {
  const zeilen = await q<FinBankimport[]>("Die Importe konnten nicht geladen werden",
    supabase.from("fin_bankimporte").select("id, bankkonto_id, dateiname, format, anzahl, neu, von, bis, endsaldo, endsaldo_am, erstellt_am")
      .order("erstellt_am", { ascending: false }).order("id").range(0, 199));
  return (zeilen ?? []).map((i) => ({ ...i, endsaldo: i.endsaldo == null ? null : Number(i.endsaldo) }));
}

export type FinBankEingelesen = { import_id: string; anzahl: number; neu: number; doppelt: number };

export async function finBankEinlesen(supabase: SupabaseClient, bankkontoId: string, dateiname: string, a: Kontoauszug): Promise<FinBankEingelesen> {
  const r = await q<FinBankEingelesen>("Der Kontoauszug wurde nicht eingelesen",
    supabase.rpc("fin_bank_einlesen", {
      p_bankkonto: bankkontoId, p_dateiname: dateiname.slice(0, 120), p_format: a.format, p_umsaetze: a.umsaetze,
      p_endsaldo: a.endsaldo, p_endsaldo_am: a.endsaldoAm,
    }));
  if (!r) throw new ApiError("Der Kontoauszug wurde nicht eingelesen", { message: "Die Datenbank hat nichts zurückgegeben." });
  return r;
}

export async function finBankImportZuruecknehmen(supabase: SupabaseClient, importId: string): Promise<number> {
  return (await q<number>("Der Import wurde nicht zurückgenommen", supabase.rpc("fin_bank_import_zuruecknehmen", { p_import: importId }))) ?? 0;
}

// `rest`: was danach noch offen ist (0 = bezahlt; Teilzahlungen seit Migration 93).
export async function finBankZuRechnung(supabase: SupabaseClient, umsatzId: string, rechnungId: string): Promise<{ nr: number; rest: number }> {
  const r = await q<{ nr: number; rest?: number }>("Nicht zugeordnet", supabase.rpc("fin_bank_zu_rechnung", { p_umsatz: umsatzId, p_rechnung: rechnungId }));
  return { nr: r?.nr ?? 0, rest: Number(r?.rest ?? 0) };
}

export async function finBankZuBeleg(supabase: SupabaseClient, umsatzId: string, belegId: string): Promise<{ nr: number; rest: number }> {
  const r = await q<{ nr: number; rest?: number }>("Nicht zugeordnet", supabase.rpc("fin_bank_zu_beleg", { p_umsatz: umsatzId, p_beleg: belegId }));
  return { nr: r?.nr ?? 0, rest: Number(r?.rest ?? 0) };
}

export async function finBankZuKonto(supabase: SupabaseClient, umsatzId: string, konto: number, steuer: string | null, text: string): Promise<{ nr: number }> {
  return (await q<{ nr: number }>("Nicht gebucht",
    supabase.rpc("fin_bank_zu_konto", { p_umsatz: umsatzId, p_konto: konto, p_steuer: steuer, p_text: text }))) ?? { nr: 0 };
}

export async function finBankIgnorieren(supabase: SupabaseClient, umsatzId: string, grund: string): Promise<void> {
  await q("Nicht geändert", supabase.rpc("fin_bank_ignorieren", { p_umsatz: umsatzId, p_grund: grund }));
}

export async function finBankAufheben(supabase: SupabaseClient, umsatzId: string, grund: string): Promise<void> {
  await q("Nicht aufgehoben", supabase.rpc("fin_bank_aufheben", { p_umsatz: umsatzId, p_grund: grund }));
}

// ---------------------------------------------------------------- F5: Steuern (Migration 92, v150)

export async function fetchFinUstStand(supabase: SupabaseClient, jahr: number): Promise<FinUstStand> {
  return ustStandLesen(await q<unknown>("Finance › Steuern konnte nicht geladen werden", supabase.rpc("fin_ust_stand", { p_jahr: jahr })));
}

// Hält die Abgabe fest – die Kennzahlen dieses Augenblicks legt die Datenbank ab (nächste Fassung).
export async function finUstAbgegeben(supabase: SupabaseClient, jahr: number, zeitraum: string, am: string, notiz: string): Promise<{ fassung: number }> {
  return (await q<{ fassung: number }>("Nicht festgehalten",
    supabase.rpc("fin_ust_abgegeben", { p_jahr: jahr, p_zeitraum: zeitraum, p_am: am, p_notiz: notiz }))) ?? { fassung: 0 };
}

export async function finSteuerJahrSpeichern(supabase: SupabaseClient, jahr: number, felder: { umsatz_vorjahr: number | null; sondervorauszahlung: number | null }): Promise<void> {
  await qWrite("Nicht gespeichert", supabase.from("fin_steuer_jahre").upsert({ jahr, ...felder }, { onConflict: "jahr" }));
}

// ---------------------------------------------------------------- Kassensturz (Migration 93, v151)

export type FinKassensturz = { id: string; datum: string; gezaehlt: number; buchbestand: number; differenz: number; notiz: string | null; buchung_id: string | null; erstellt_am: string };

export async function fetchFinKassenstuerze(supabase: SupabaseClient): Promise<FinKassensturz[]> {
  const z = await q<FinKassensturz[]>("Die Kassenstürze konnten nicht geladen werden",
    supabase.from("fin_kassenstuerze").select("id, datum, gezaehlt, buchbestand, differenz, notiz, buchung_id, erstellt_am")
      .order("datum", { ascending: false }).order("erstellt_am", { ascending: false }).order("id").range(0, 49));
  return (z ?? []).map((k) => ({ ...k, gezaehlt: Number(k.gezaehlt), buchbestand: Number(k.buchbestand), differenz: Number(k.differenz) }));
}

// Die Datenbank rechnet den Buchbestand (alle Buchungen auf der Kasse bis zum Tag) und bucht auf Wunsch die Differenz aus.
export async function finKassensturz(supabase: SupabaseClient, datum: string, gezaehlt: number, notiz: string, ausgleichen: boolean): Promise<{ buchbestand: number; differenz: number; nr: number | null }> {
  const r = await q<{ buchbestand: number; differenz: number; nr: number | null }>("Kassensturz nicht festgehalten",
    supabase.rpc("fin_kassensturz", { p_datum: datum, p_gezaehlt: gezaehlt, p_notiz: notiz, p_ausgleichen: ausgleichen }));
  return { buchbestand: Number(r?.buchbestand ?? 0), differenz: Number(r?.differenz ?? 0), nr: r?.nr ?? null };
}

// ---------------------------------------------------------------- F6: Auswertungen (Migration 94, v152)

export async function fetchFinSalden(supabase: SupabaseClient, jahr: number): Promise<FinSaldo[]> {
  return saldenLesen(await q<unknown>("Die Salden konnten nicht geladen werden", supabase.rpc("fin_auswertung_salden", { p_jahr: jahr })));
}

export async function fetchFinEuer(supabase: SupabaseClient, jahr: number): Promise<FinEuerStand> {
  return euerLesen(await q<unknown>("Die EÜR konnte nicht geladen werden", supabase.rpc("fin_euer", { p_jahr: jahr })));
}

export async function fetchFinKontenblatt(supabase: SupabaseClient, jahr: number, konto: number): Promise<FinKontenblattZeile[]> {
  const roh = await q<Record<string, unknown>[]>("Das Kontenblatt konnte nicht geladen werden", supabase.rpc("fin_kontenblatt", { p_jahr: jahr, p_konto: konto }));
  return (roh ?? []).map((z) => ({
    datum: String(z.datum), nr: Number(z.nr), text: String(z.text ?? ""), beleg: (z.beleg as string | null) ?? null, seite: z.seite as "S" | "H",
    betrag: Number(z.betrag), steuer: (z.steuer as string | null) ?? null, storno: !!z.storno, gegen: (z.gegen as string | null) ?? null,
  }));
}

// ---------------------------------------------------------------- F7: Anlagen (Migration 95, v153)

export async function fetchFinAnlagen(supabase: SupabaseClient): Promise<FinAnlage[]> {
  const z = await q<FinAnlage[]>("Die Anlagen konnten nicht geladen werden",
    supabase.from("fin_anlagen").select("id, bezeichnung, konto, art, anschaffung, ak, monate, satz, afa_konto, beleg_id, fahrzeug_id, abgang, abgang_buchung_id, notiz, erstellt_am")
      .order("anschaffung").order("id").range(0, 1999));
  return (z ?? []).map((a) => ({ ...a, ak: Number(a.ak), satz: a.satz == null ? null : Number(a.satz) }));
}

// Gebuchte Abschreibung je Anlage im Jahr (ohne stornierte Läufe). Ein einfaches Objekt, keine Map: der
// Zwischenspeicher (app/providers.tsx) legt Abfragen als JSON ab.
export async function fetchFinAfaGebucht(supabase: SupabaseClient, jahr: number): Promise<Record<string, number>> {
  const z = await q<{ anlage_id: string; betrag: number }[]>("Die gebuchten Abschreibungen konnten nicht geladen werden", supabase.rpc("fin_afa_gebucht", { p_jahr: jahr }));
  return Object.fromEntries((z ?? []).map((x) => [x.anlage_id, Number(x.betrag)]));
}

export type FinAnlageFelder = { bezeichnung: string; konto: number; art: string; anschaffung: string; ak: number; monate: number | null; beleg_id: string | null; fahrzeug_id: string | null; notiz: string };

export async function finAnlageSpeichern(supabase: SupabaseClient, id: string | null, f: FinAnlageFelder): Promise<string> {
  const r = await q<string>("Die Anlage wurde nicht gespeichert", supabase.rpc("fin_anlage_speichern", { p_id: id, p: f }));
  if (!r) throw new ApiError("Die Anlage wurde nicht gespeichert", { message: "Die Datenbank hat keine Kennung zurückgegeben." });
  return r;
}

export async function finAnlageLoeschen(supabase: SupabaseClient, id: string): Promise<void> {
  await q("Die Anlage wurde nicht gelöscht", supabase.rpc("fin_anlage_loeschen", { p_id: id }));
}

export async function finAfaBuchen(supabase: SupabaseClient, jahr: number, bisMonat: number): Promise<{ nr: number | null; anlagen: number; summe: number }> {
  const r = await q<{ nr: number | null; anlagen: number; summe: number }>("Die Abschreibungen wurden nicht gebucht",
    supabase.rpc("fin_afa_buchen", { p_jahr: jahr, p_bis_monat: bisMonat }));
  return { nr: r?.nr ?? null, anlagen: r?.anlagen ?? 0, summe: Number(r?.summe ?? 0) };
}

export async function finAnlageAbgang(supabase: SupabaseClient, id: string, datum: string, grund: string): Promise<{ restwert: number; nr: number | null }> {
  const r = await q<{ restwert: number; nr: number | null }>("Der Abgang wurde nicht gebucht", supabase.rpc("fin_anlage_abgang", { p_id: id, p_datum: datum, p_grund: grund }));
  return { restwert: Number(r?.restwert ?? 0), nr: r?.nr ?? null };
}

export async function finAnlageAbgangZuruecknehmen(supabase: SupabaseClient, id: string, grund: string): Promise<void> {
  await q("Der Abgang wurde nicht zurückgenommen", supabase.rpc("fin_anlage_abgang_zuruecknehmen", { p_id: id, p_grund: grund }));
}

export async function fetchFirmenfahrzeugeFuerAnlagen(supabase: SupabaseClient): Promise<{ id: string; kennzeichen: string; bezeichnung: string | null }[]> {
  return (await q<{ id: string; kennzeichen: string; bezeichnung: string | null }[]>("Die Firmenfahrzeuge konnten nicht geladen werden",
    supabase.from("firmenfahrzeuge").select("id, kennzeichen, bezeichnung").eq("aktiv", true).order("kennzeichen").order("id").range(0, 199))) ?? [];
}

// ---------------------------------------------------------------- F8 Jahresabschluss (Migration 96)
export async function fetchFinAbschlussposten(supabase: SupabaseClient, jahr: number): Promise<FinAbschlussposten[]> {
  const z = await q<FinAbschlussposten[]>("Die Abschlussbuchungen konnten nicht geladen werden",
    supabase.from("fin_abschlussposten").select("id, jahr, art, konto, betrag, text, buchung_id, aufloesung_buchung_id, erstellt_am")
      .eq("jahr", jahr).order("erstellt_am").order("id").range(0, 999));
  return (z ?? []).map((x) => ({ ...x, betrag: Number(x.betrag) }));
}

export async function finAbschlusspostenBuchen(supabase: SupabaseClient, jahr: number, art: AbschlussArt, konto: number, betrag: number, text: string): Promise<{ nr: number }> {
  const r = await q<{ nr: number }>("Die Abschlussbuchung wurde nicht gebucht",
    supabase.rpc("fin_abschlussposten_buchen", { p_jahr: jahr, p_art: art, p_konto: konto, p_betrag: betrag, p_text: text }));
  return { nr: Number(r?.nr) };
}

export async function finAbschlusspostenAufloesen(supabase: SupabaseClient, id: string): Promise<void> {
  await q("Die Abgrenzung wurde nicht aufgelöst", supabase.rpc("fin_abschlussposten_aufloesen", { p_id: id }));
}

export async function finAbschlusspostenZuruecknehmen(supabase: SupabaseClient, id: string, grund: string): Promise<void> {
  await q("Die Abschlussbuchung wurde nicht zurückgenommen", supabase.rpc("fin_abschlussposten_zuruecknehmen", { p_id: id, p_grund: grund }));
}

export async function fetchFinVortrag(supabase: SupabaseClient, jahr: number): Promise<FinVortragStand> {
  return vortragLesen(await q<unknown>("Der Saldenvortrag konnte nicht geladen werden", supabase.rpc("fin_vortrag_vorschau", { p_jahr: jahr })));
}

export async function finVortragBuchen(supabase: SupabaseClient, jahr: number, grund: string | null): Promise<{ nr: number | null; konten: number }> {
  const r = await q<{ nr: number | null; konten: number }>("Der Saldenvortrag wurde nicht gebucht", supabase.rpc("fin_vortrag_buchen", { p_jahr: jahr, p_grund: grund }));
  return { nr: r?.nr ?? null, konten: Number(r?.konten ?? 0) };
}

export async function finVortragZuruecknehmen(supabase: SupabaseClient, jahr: number, grund: string): Promise<void> {
  await q("Der Saldenvortrag wurde nicht zurückgenommen", supabase.rpc("fin_vortrag_zuruecknehmen", { p_jahr: jahr, p_grund: grund }));
}

// ---------------------------------------------------------------- F9 Export (Migration 97)
function journalLesen(roh: unknown): FinBuchung[] {
  return ((roh ?? []) as FinBuchung[]).map((b) => ({
    ...b, fin_buchungszeilen: [...(b.fin_buchungszeilen ?? [])].map((z) => ({ ...z, betrag: Number(z.betrag) })).sort((a, c) => (a.id ?? 0) - (c.id ?? 0)),
  }));
}

export async function fetchFinExportJournal(supabase: SupabaseClient, von: string, bis: string): Promise<FinBuchung[]> {
  return journalLesen(await q<unknown>("Das Journal konnte nicht geladen werden", supabase.rpc("fin_export_journal", { p_von: von, p_bis: bis })));
}

export async function fetchFinExportBelege(supabase: SupabaseClient, von: string, bis: string): Promise<FinExportBeleg[]> {
  const z = await q<FinExportBeleg[]>("Die Belege konnten nicht geladen werden", supabase.rpc("fin_export_belege", { p_von: von, p_bis: bis }));
  return (z ?? []).map((x) => ({ ...x, brutto: x.brutto == null ? null : Number(x.brutto), buchung_nr: x.buchung_nr == null ? null : Number(x.buchung_nr) }));
}

export async function finExportProtokollieren(supabase: SupabaseClient, art: "datev" | "gobd", von: string, bis: string): Promise<void> {
  await q("Der Export wurde nicht protokolliert", supabase.rpc("fin_export_protokollieren", { p_art: art, p_von: von, p_bis: bis }));
}

export async function fetchFinExportProtokolle(supabase: SupabaseClient, jahr: number): Promise<FinExportProtokoll[]> {
  return protokolleLesen(await q<unknown>("Die Exporte konnten nicht geladen werden", supabase.rpc("fin_export_protokolle", { p_jahr: jahr })));
}

// ---------------------------------------------------------------- Skonto (Migration 98)
export type FinSkonto = { ziel_id: string; buchung_id: string; datum: string; betrag: number; nr: number };
export async function fetchFinSkonti(supabase: SupabaseClient, art: "rechnung" | "beleg"): Promise<FinSkonto[]> {
  const z = await q<FinSkonto[]>("Die Skonti konnten nicht geladen werden", supabase.rpc("fin_skonti", { p_art: art }));
  return (z ?? []).map((x) => ({ ...x, betrag: Number(x.betrag), nr: Number(x.nr) }));
}
export async function finSkontoBuchen(supabase: SupabaseClient, art: "rechnung" | "beleg", ziel: string, datum: string, betrag: number): Promise<{ nr: number; rest: number }> {
  const r = await q<{ nr: number; rest: number }>("Der Skonto wurde nicht gebucht", supabase.rpc("fin_skonto_buchen", { p_art: art, p_ziel: ziel, p_datum: datum, p_betrag: betrag }));
  return { nr: Number(r?.nr), rest: Number(r?.rest ?? 0) };
}
export async function finSkontoZuruecknehmen(supabase: SupabaseClient, buchung: string, grund: string): Promise<void> {
  await q("Der Skonto wurde nicht zurückgenommen", supabase.rpc("fin_skonto_zuruecknehmen", { p_buchung: buchung, p_grund: grund }));
}

// ---------------------------------------------------------------- Mahnwesen (Migration 99)
export async function fetchFinMahnungen(supabase: SupabaseClient): Promise<FinMahnung[]> {
  const z = await fetchPaged<FinMahnung>("Die Mahnungen konnten nicht geladen werden", (von, bis) =>
    supabase.from("fin_mahnungen").select("id, rechnung_id, stufe, datum, frist, nummer_text, rechnung_datum, faellig_am, brutto, bezahlt, offen, gebuehr, zinsen, zinssatz, text, absender, empfaenger, zurueckgezogen_am, zurueck_grund, erstellt_am")
      .order("datum").order("id").range(von, bis));
  return z.map((m) => ({ ...m, brutto: Number(m.brutto), bezahlt: Number(m.bezahlt), offen: Number(m.offen), gebuehr: Number(m.gebuehr), zinsen: Number(m.zinsen), zinssatz: m.zinssatz == null ? null : Number(m.zinssatz) }));
}
export type FinMahnungFelder = { stufe: number; datum: string; frist: string; gebuehr: number; zinsen: number; zinssatz: number | null; text: string };
export async function finMahnungErstellen(supabase: SupabaseClient, rechnung: string, f: FinMahnungFelder): Promise<{ id: string }> {
  const r = await q<{ id: string }>("Die Mahnung wurde nicht erstellt", supabase.rpc("fin_mahnung_erstellen", {
    p_rechnung: rechnung, p_stufe: f.stufe, p_datum: f.datum, p_frist: f.frist, p_gebuehr: f.gebuehr, p_zinsen: f.zinsen, p_zinssatz: f.zinssatz, p_text: f.text }));
  return { id: String(r?.id) };
}
export async function finMahnungZurueckziehen(supabase: SupabaseClient, id: string, grund: string): Promise<void> {
  await q("Die Mahnung wurde nicht zurückgezogen", supabase.rpc("fin_mahnung_zurueckziehen", { p_id: id, p_grund: grund }));
}

// ---------------------------------------------------------------- Planposten der Liquiditätsvorschau (Migration 100)
export async function fetchFinPlanposten(supabase: SupabaseClient): Promise<FinPlanposten[]> {
  const z = await fetchPaged<FinPlanposten>("Die Planposten konnten nicht geladen werden", (von, bis) =>
    supabase.from("fin_planposten").select("id, text, art, betrag, ab, rhythmus, bis, notiz, erstellt_am, geaendert_am")
      .order("ab").order("id").range(von, bis));
  return z.map((p) => ({ ...p, betrag: Number(p.betrag) }));
}
export type FinPlanpostenFelder = Pick<FinPlanposten, "text" | "art" | "betrag" | "ab" | "rhythmus" | "bis" | "notiz">;
export async function finPlanpostenSpeichern(supabase: SupabaseClient, id: string | null, f: FinPlanpostenFelder): Promise<string> {
  const r = await q<string>("Der Planposten wurde nicht gespeichert", supabase.rpc("fin_planposten_speichern", {
    p_id: id, p_text: f.text, p_art: f.art, p_betrag: f.betrag, p_ab: f.ab, p_rhythmus: f.rhythmus, p_bis: f.bis, p_notiz: f.notiz }));
  return String(r);
}
export async function finPlanpostenLoeschen(supabase: SupabaseClient, id: string): Promise<void> {
  await q("Der Planposten wurde nicht gelöscht", supabase.rpc("fin_planposten_loeschen", { p_id: id }));
}
