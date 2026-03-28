from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from src.main import create_app
from src.models import HealthResponse, LookupResponse


class FakeSettings:
	update_interval_seconds = 3600


class FakeManager:
	def __init__(self, ready: bool = True):
		self.settings = FakeSettings()
		self.ready = ready
		self.initialize_called = False
		self.close_called = False

	def initialize(self) -> None:
		self.initialize_called = True

	def close(self) -> None:
		self.close_called = True

	def health_snapshot(self) -> HealthResponse:
		return HealthResponse(
			status="healthy" if self.ready else "unhealthy",
			ready=self.ready,
			edition_ids=["GeoLite2-City", "GeoLite2-ASN"],
			db_loaded_at=datetime(2026, 3, 28, tzinfo=timezone.utc),
			last_successful_update_at=None,
			last_update_error=None,
		)

	def lookup(self, ip: str) -> LookupResponse:
		if not self.ready:
			raise RuntimeError("GeoIP database is not ready")
		return LookupResponse(
			ip=ip,
			found=True,
			is_public=True,
			country_code="US",
			country="United States",
			region="California",
			city="Mountain View",
			latitude=37.386,
			longitude=-122.0838,
			timezone="America/Los_Angeles",
			accuracy_radius_km=20,
			asn=15169,
			asn_organization="Google LLC",
			source="maxmind",
			resolved_at=datetime(2026, 3, 28, tzinfo=timezone.utc),
		)


def test_health_returns_503_when_not_ready() -> None:
	with TestClient(create_app(FakeManager(ready=False))) as client:
		response = client.get("/health")

	assert response.status_code == 503
	assert response.json()["ready"] is False


def test_lookup_returns_payload() -> None:
	with TestClient(create_app(FakeManager(ready=True))) as client:
		response = client.post("/v1/lookup", json={"ip": "8.8.8.8"})

	assert response.status_code == 200
	assert response.json()["city"] == "Mountain View"

