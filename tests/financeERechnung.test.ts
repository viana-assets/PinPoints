// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { eRechnungLesen, eRechnungPosten } from "@/lib/finance/erechnung";

// Finance F2 (v148): E-Rechnung lesen. Die Beispiele sind frei erfunden und nur so groß wie nötig.
const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>R-2026-0815</cbc:ID>
  <cbc:IssueDate>2026-10-01</cbc:IssueDate>
  <cbc:DueDate>2026-10-15</cbc:DueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>Reifen Großhandel Beispiel</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>DE123456789</cbc:CompanyID></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Reifen Großhandel Beispiel GmbH</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">96.40</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">500.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">95.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">20.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">1.40</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>7</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:TaxInclusiveAmount currencyID="EUR">616.40</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">616.40</cbc:PayableAmount></cac:LegalMonetaryTotal>
</Invoice>`;

const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument><ram:ID>INV-77</ram:ID><ram:IssueDateTime><udt:DateTimeString format="102">20261005</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>Software Beispiel B.V.</ram:Name>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">12345</ram:ID></ram:SpecifiedTaxRegistration>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">NL000000000B01</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax><ram:CalculatedAmount>0.00</ram:CalculatedAmount><ram:BasisAmount>49.00</ram:BasisAmount>
        <ram:CategoryCode>AE</ram:CategoryCode><ram:RateApplicablePercent>0</ram:RateApplicablePercent></ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261019</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:GrandTotalAmount>49.00</ram:GrandTotalAmount><ram:DuePayableAmount>49.00</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

describe("eRechnungLesen", () => {
  it("UBL (XRechnung)", () => {
    expect(eRechnungLesen(UBL)).toEqual({
      format: "UBL", nummer: "R-2026-0815", datum: "2026-10-01", faellig: "2026-10-15", lieferant: "Reifen Großhandel Beispiel GmbH",
      ustId: "DE123456789", waehrung: "EUR", brutto: 616.4,
      steuern: [{ kategorie: "S", satz: 19, netto: 500, steuer: 95 }, { kategorie: "S", satz: 7, netto: 20, steuer: 1.4 }],
    });
  });
  it("CII (XRechnung/ZUGFeRD-XML) mit § 13b", () => {
    expect(eRechnungLesen(CII)).toMatchObject({
      format: "CII", nummer: "INV-77", datum: "2026-10-05", faellig: "2026-10-19", lieferant: "Software Beispiel B.V.", ustId: "NL000000000B01",
      brutto: 49, steuern: [{ kategorie: "AE", satz: 0, netto: 49, steuer: 0 }],
    });
  });
  it("kein E-Rechnungs-XML", () => {
    expect(eRechnungLesen("")).toBeNull();
    expect(eRechnungLesen("<kaputt>")).toBeNull();
    expect(eRechnungLesen("<Bestellung><ID>1</ID></Bestellung>")).toBeNull();
  });
});

describe("eRechnungPosten", () => {
  it("Vorsteuer brutto je Satz", () => {
    expect(eRechnungPosten(eRechnungLesen(UBL)!).map(({ betrag, steuer }) => ({ betrag, steuer }))).toEqual([{ betrag: 595, steuer: "vst19" }, { betrag: 21.4, steuer: "vst7" }]);
  });
  it("§ 13b netto mit r13b19", () => {
    expect(eRechnungPosten(eRechnungLesen(CII)!)).toEqual([{ betrag: 49, steuer: "r13b19", hinweis: "§ 13b – die Steuer schuldest du" }]);
  });
});
