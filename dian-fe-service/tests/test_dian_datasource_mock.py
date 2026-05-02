"""Tests del mock de DIAN — verifica los 3 escenarios."""
from app.core.either import Left, Right
from app.core.failures import DianFailure
from app.data.datasources.dian_datasource_mock import DianDataSourceMock


SAMPLE_XML = "<Invoice/>"


def test_mock_accepted_returns_right_with_cufe():
    ds = DianDataSourceMock(scenario="accepted")
    result = ds.send_bill(SAMPLE_XML, "FE-1")
    assert isinstance(result, Right)
    response = result.value
    assert response.is_accepted
    assert len(response.signature) == 96
    assert response.track_id


def test_mock_accepted_signature_is_deterministic_per_xml():
    ds = DianDataSourceMock(scenario="accepted")
    a = ds.send_bill(SAMPLE_XML, "FE-1").value.signature
    b = ds.send_bill(SAMPLE_XML, "FE-1").value.signature
    assert a == b  # mismo XML → mismo "CUFE"


def test_mock_rejected_returns_right_with_errors():
    ds = DianDataSourceMock(scenario="rejected")
    result = ds.send_bill(SAMPLE_XML, "FE-1")
    assert isinstance(result, Right)
    assert result.value.is_rejected
    assert len(result.value.errors) >= 1


def test_mock_contingency_returns_left():
    ds = DianDataSourceMock(scenario="contingency")
    result = ds.send_bill(SAMPLE_XML, "FE-1")
    assert isinstance(result, Left)
    assert isinstance(result.value, DianFailure)
    assert result.value.status == "contingency"


def test_mock_custom_track_id():
    ds = DianDataSourceMock(scenario="accepted", custom_track_id="TRACK-42")
    result = ds.send_bill(SAMPLE_XML, "FE-1")
    assert result.value.track_id == "TRACK-42"
