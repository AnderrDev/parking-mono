import pytest
from app.core.either import Left, Right
from app.core.failures import (
    Failure,
    ValidationFailure,
    BusinessRuleFailure,
    XmlFailure,
    CryptoFailure,
    DianFailure,
    NetworkFailure,
    ServerFailure,
)


# ── Left ──────────────────────────────────────────────────────────────────────

def test_left_is_left():
    result = Left("error")
    assert result.is_left() is True
    assert result.is_right() is False


def test_left_fold_calls_on_left():
    result = Left("error")
    out = result.fold(lambda e: f"fallo: {e}", lambda v: f"ok: {v}")
    assert out == "fallo: error"


def test_left_map_is_identity():
    result = Left("error")
    mapped = result.map(lambda v: v * 2)
    assert mapped == Left("error")


def test_left_flat_map_is_identity():
    result = Left("error")
    flat = result.flat_map(lambda v: Right(v * 2))
    assert flat == Left("error")


# ── Right ─────────────────────────────────────────────────────────────────────

def test_right_is_right():
    result = Right(42)
    assert result.is_right() is True
    assert result.is_left() is False


def test_right_fold_calls_on_right():
    result = Right(42)
    out = result.fold(lambda e: f"fallo: {e}", lambda v: v + 1)
    assert out == 43


def test_right_map_transforms_value():
    result = Right(10)
    mapped = result.map(lambda v: v * 3)
    assert mapped == Right(30)


def test_right_flat_map_chains():
    result = Right(5)
    chained = result.flat_map(lambda v: Right(v + 1))
    assert chained == Right(6)


def test_right_flat_map_can_produce_left():
    result = Right(0)
    chained = result.flat_map(
        lambda v: Left("división por cero") if v == 0 else Right(10 / v)
    )
    assert chained == Left("división por cero")


# ── Failures ──────────────────────────────────────────────────────────────────

def test_validation_failure_is_failure():
    f = ValidationFailure(message="NIT inválido", fields=["customer_doc_number"])
    assert isinstance(f, Failure)
    assert isinstance(f, ValidationFailure)
    assert f.fields == ["customer_doc_number"]


def test_business_rule_failure():
    f = BusinessRuleFailure(message="Factura ya emitida")
    assert isinstance(f, Failure)
    assert isinstance(f, BusinessRuleFailure)


def test_xml_failure():
    f = XmlFailure(message="Namespace inválido")
    assert isinstance(f, Failure)
    assert isinstance(f, XmlFailure)


def test_crypto_failure():
    f = CryptoFailure(message="Certificado expirado")
    assert isinstance(f, Failure)
    assert isinstance(f, CryptoFailure)


def test_dian_failure_defaults():
    f = DianFailure(message="Timeout DIAN")
    assert f.status == "rejected"
    assert f.dian_messages == []


def test_dian_failure_contingency():
    f = DianFailure(message="DIAN caída", status="contingency", dian_messages=["503"])
    assert isinstance(f, Failure)
    assert f.status == "contingency"
    assert "503" in f.dian_messages


def test_network_failure():
    f = NetworkFailure(message="Sin conexión")
    assert isinstance(f, Failure)
    assert isinstance(f, NetworkFailure)


def test_server_failure():
    f = ServerFailure(message="Error interno")
    assert isinstance(f, Failure)
    assert isinstance(f, ServerFailure)


# ── Frozen (inmutabilidad) ────────────────────────────────────────────────────

def test_left_is_frozen():
    result = Left("error")
    with pytest.raises((AttributeError, TypeError)):
        result.value = "otro"  # type: ignore


def test_right_is_frozen():
    result = Right(42)
    with pytest.raises((AttributeError, TypeError)):
        result.value = 99  # type: ignore
