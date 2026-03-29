from __future__ import annotations

from datetime import datetime, timezone
import threading

from fastapi.testclient import TestClient

from src.main import build_bind_addresses, create_app
from src.models import HealthResponse, LookupResponse


class FakeSettings:
	update_interval_seconds = 3600


class FakeManager:
	def __init__(
		self,
		ready: bool = True,
		phase: str | None = None,
		update_in_progress: bool = False,
		current_update_started_at: datetime | None = None,
	):
		self.settings = FakeSettings()
		self.ready = ready
		self.phase = phase or ("ready" if ready else "starting")
		self.update_in_progress = update_in_progress
		self.current_update_started_at = current_update_started_at
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
			phase=self.phase,
			update_in_progress=self.update_in_progress,
			current_update_started_at=self.current_update_started_at,
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


class BlockingInitializeManager(FakeManager):
	def __init__(self):
		super().__init__(ready=False, phase="starting")
		self.initialize_started = threading.Event()
		self.allow_initialize_finish = threading.Event()

	def initialize(self) -> None:
		self.initialize_called = True
		self.phase = "downloading"
		self.update_in_progress = True
		self.current_update_started_at = datetime(2026, 3, 28, tzinfo=timezone.utc)
		self.initialize_started.set()
		self.allow_initialize_finish.wait(timeout=1)
		self.ready = True
		self.phase = "ready"
		self.update_in_progress = False
		self.current_update_started_at = None


def test_health_returns_503_when_not_ready() -> None:
	with TestClient(create_app(FakeManager(ready=False))) as client:
		response = client.get("/health")

	assert response.status_code == 503
	assert response.json()["ready"] is False
	assert response.json()["phase"] == "starting"
	assert response.json()["update_in_progress"] is False


def test_live_returns_200_even_when_not_ready() -> None:
	with TestClient(create_app(FakeManager(ready=False))) as client:
		response = client.get("/live")

	assert response.status_code == 200
	assert response.json() == {"status": "ok"}


def test_live_returns_200_while_initialization_is_still_running() -> None:
	manager = BlockingInitializeManager()

	with TestClient(create_app(manager)) as client:
		assert manager.initialize_started.wait(timeout=1) is True
		live_response = client.get("/live")
		health_response = client.get("/health")
		manager.allow_initialize_finish.set()

	assert live_response.status_code == 200
	assert health_response.status_code == 503
	assert health_response.json()["phase"] == "downloading"
	assert health_response.json()["update_in_progress"] is True


def test_build_bind_addresses_defaults_to_dual_stack_for_railway() -> None:
	assert build_bind_addresses("::", 8080) == ["0.0.0.0:8080", "[::]:8080"]


def test_lookup_returns_payload() -> None:
	with TestClient(create_app(FakeManager(ready=True))) as client:
		response = client.post("/v1/lookup", json={"ip": "8.8.8.8"})

	assert response.status_code == 200
	assert response.json()["city"] == "Mountain View"
