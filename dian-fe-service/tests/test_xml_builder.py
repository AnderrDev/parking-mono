"""
Tests del UBLBuilder — verifica XML válido y campos clave del spec.
"""
from datetime import datetime

import pytest
from lxml import etree

from app.core.either import Left, Right
from app.core.failures import XmlFailure
from app.domain.entities.invoice_entity import (
    CustomerData,
    InvoiceData,
    InvoiceLine,
)
from app.domain.entities.supplier_entity import SupplierData
from app.infrastructure.xml.ubl_builder import (
    NS,
    UBLBuilder,
    _cents_to_pesos,
)


CUFE_SAMPLE = "A" * 96


def _supplier() -> SupplierData:
    return SupplierData(
        nit="890123456",
        dv="7",
        legal_name="Parqueadero Central S.A.S.",
        trade_name="Parqueadero Central",
        address_line="Cra 7 # 32-10",
        municipality_code="11001",
        department_code="11",
        email="facturacion@parqueadero.co",
    )


def _invoice() -> InvoiceData:
    return InvoiceData(
        nit_emisor="890123456",
        tipo_documento="01",
        numero_factura="FE-1001",
        fecha_expedicion=datetime(2026, 4, 28, 14, 35, 30),
        customer=CustomerData(
            doc_type="CC",
            doc_number="123456789",
            first_name="Juan",
            last_name="Perez",
            email="juan@example.com",
        ),
        lines=[
            InvoiceLine(
                description="Parqueadero 2h 30m",
                quantity=1,
                unit_price_cents=1500000,
                tax_percent=19.0,
            ),
        ],
        subtotal_cents=1500000,
        impuestos_cents=285000,
        total_cents=1785000,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def test_cents_to_pesos():
    assert _cents_to_pesos(1500000) == "15000.00"
    assert _cents_to_pesos(0) == "0.00"


# ── Builder happy path ────────────────────────────────────────────────────────

def test_build_returns_right_with_xml_string():
    builder = UBLBuilder(_supplier())
    result = builder.build(_invoice(), CUFE_SAMPLE)
    assert isinstance(result, Right)
    assert result.value.startswith("<?xml")


def test_xml_is_parseable():
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    # No debe lanzar
    root = etree.fromstring(xml_str.encode("utf-8"))
    assert root.tag == f"{{{NS['default']}}}Invoice"


def test_xml_has_dian_namespaces():
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))
    nsmap = root.nsmap
    assert nsmap[None] == NS["default"]
    assert nsmap["cac"] == NS["cac"]
    assert nsmap["cbc"] == NS["cbc"]
    assert nsmap["ext"] == NS["ext"]
    assert nsmap["xades"] == NS["xades"]
    assert nsmap["ds"] == NS["ds"]


def test_xml_has_two_extensions():
    """Una para info DIAN, otra reservada para firma XAdES."""
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))
    extensions = root.findall(f"{{{NS['ext']}}}UBLExtensions/{{{NS['ext']}}}UBLExtension")
    assert len(extensions) == 2


def test_xml_contains_cufe_in_uuid():
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))
    uuid = root.find(f"{{{NS['cbc']}}}UUID")
    assert uuid is not None
    assert uuid.text == CUFE_SAMPLE
    assert uuid.get("schemeID") == "2"
    assert uuid.get("schemeName") == "CUFE-SHA384"


def test_xml_header_fields():
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))

    assert root.findtext(f"{{{NS['cbc']}}}UBLVersionID") == "UBL 2.1"
    assert root.findtext(f"{{{NS['cbc']}}}CustomizationID") == "10"
    assert root.findtext(f"{{{NS['cbc']}}}ProfileID") == "DIAN 2.1"
    assert root.findtext(f"{{{NS['cbc']}}}ProfileExecutionID") == "2"
    assert root.findtext(f"{{{NS['cbc']}}}ID") == "FE-1001"
    assert root.findtext(f"{{{NS['cbc']}}}IssueDate") == "2026-04-28"
    assert root.findtext(f"{{{NS['cbc']}}}IssueTime") == "14:35:30-05:00"
    assert root.findtext(f"{{{NS['cbc']}}}InvoiceTypeCode") == "01"
    assert root.findtext(f"{{{NS['cbc']}}}DocumentCurrencyCode") == "COP"
    assert root.findtext(f"{{{NS['cbc']}}}LineCountNumeric") == "1"


def test_xml_supplier_block():
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))

    sup_party = root.find(
        f"{{{NS['cac']}}}AccountingSupplierParty/{{{NS['cac']}}}Party"
    )
    assert sup_party is not None

    company_id = sup_party.find(
        f"{{{NS['cac']}}}PartyTaxScheme/{{{NS['cbc']}}}CompanyID"
    )
    assert company_id is not None
    assert company_id.text == "890123456"
    assert company_id.get("schemeID") == "7"  # DV


def test_xml_customer_block():
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))

    cust_party = root.find(
        f"{{{NS['cac']}}}AccountingCustomerParty/{{{NS['cac']}}}Party"
    )
    assert cust_party is not None

    company_id = cust_party.find(
        f"{{{NS['cac']}}}PartyTaxScheme/{{{NS['cbc']}}}CompanyID"
    )
    assert company_id.text == "123456789"
    assert company_id.get("schemeName") == "13"  # CC

    email = cust_party.find(
        f"{{{NS['cac']}}}Contact/{{{NS['cbc']}}}ElectronicMail"
    )
    assert email is not None
    assert email.text == "juan@example.com"


def test_xml_tax_total_amounts():
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))

    tax_total = root.find(f"{{{NS['cac']}}}TaxTotal")
    tax_amount = tax_total.find(f"{{{NS['cbc']}}}TaxAmount")
    assert tax_amount.text == "2850.00"
    assert tax_amount.get("currencyID") == "COP"


def test_xml_legal_monetary_total():
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))

    lmt = root.find(f"{{{NS['cac']}}}LegalMonetaryTotal")
    assert lmt.findtext(f"{{{NS['cbc']}}}LineExtensionAmount") == "15000.00"
    assert lmt.findtext(f"{{{NS['cbc']}}}TaxExclusiveAmount") == "15000.00"
    assert lmt.findtext(f"{{{NS['cbc']}}}TaxInclusiveAmount") == "17850.00"
    assert lmt.findtext(f"{{{NS['cbc']}}}PayableAmount") == "17850.00"


def test_xml_invoice_lines():
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))

    lines = root.findall(f"{{{NS['cac']}}}InvoiceLine")
    assert len(lines) == 1

    line = lines[0]
    assert line.findtext(f"{{{NS['cbc']}}}ID") == "1"
    assert line.findtext(f"{{{NS['cbc']}}}InvoicedQuantity") == "1"
    assert line.findtext(f"{{{NS['cbc']}}}LineExtensionAmount") == "15000.00"

    item_desc = line.find(f"{{{NS['cac']}}}Item/{{{NS['cbc']}}}Description")
    assert item_desc.text == "Parqueadero 2h 30m"


def test_multiple_lines():
    invoice = _invoice()
    multi_invoice = InvoiceData(
        **{**invoice.__dict__, "lines": invoice.lines + [
            InvoiceLine(description="Carga eléctrica", quantity=2, unit_price_cents=500000, tax_percent=19.0),
        ]},
    )
    builder = UBLBuilder(_supplier())
    xml_str = builder.build(multi_invoice, CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))

    lines = root.findall(f"{{{NS['cac']}}}InvoiceLine")
    assert len(lines) == 2
    assert root.findtext(f"{{{NS['cbc']}}}LineCountNumeric") == "2"


# ── Validaciones ──────────────────────────────────────────────────────────────

def test_build_fails_with_invalid_cufe():
    builder = UBLBuilder(_supplier())
    result = builder.build(_invoice(), "tooshort")
    assert isinstance(result, Left)
    assert isinstance(result.value, XmlFailure)


def test_build_fails_with_empty_cufe():
    builder = UBLBuilder(_supplier())
    result = builder.build(_invoice(), "")
    assert isinstance(result, Left)


def test_profile_execution_production():
    builder = UBLBuilder(_supplier(), profile_execution_id="1")
    xml_str = builder.build(_invoice(), CUFE_SAMPLE).value
    root = etree.fromstring(xml_str.encode("utf-8"))
    assert root.findtext(f"{{{NS['cbc']}}}ProfileExecutionID") == "1"
