from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "dian-fe-service"}


def test_docs_available():
    response = client.get("/openapi.json")
    assert response.status_code == 200
