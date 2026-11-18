from dataclasses import replace
from fastapi.testclient import TestClient
from backend.app import create_app
from tests.conftest import TEST_PASSWORD


def test_hosted_cookie_security_and_missing_origin(system):
    _, original, engine = system
    settings = replace(
        original.state.settings,
        origin="https://demo.example.invalid",
        secure_cookie=True,
    )
    app = create_app(settings, engine)
    with TestClient(app, base_url=settings.origin) as client:
        credentials = {"email": "owner@example.com", "password": TEST_PASSWORD}
        assert client.post("/api/auth/login", json=credentials).status_code == 403
        response = client.post(
            "/api/auth/login", json=credentials, headers={"Origin": settings.origin}
        )
        assert response.status_code == 200
        cookie = response.headers["set-cookie"]
        assert (
            "Secure" in cookie and "HttpOnly" in cookie and "SameSite=strict" in cookie
        )
        assert client.get("/api/auth/session").json()["authenticated"]
        assert client.post("/api/auth/register", json=credentials).status_code == 404
