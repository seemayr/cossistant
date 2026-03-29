from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import threading
from types import SimpleNamespace

from geoip2.errors import AddressNotFoundError

from src.config import Settings
from src.database import GeoIPDatabaseManager


def fixed_now() -> datetime:
	return datetime(2026, 3, 28, tzinfo=timezone.utc)


def make_settings(tmp_path: Path) -> Settings:
	return Settings(
		account_id="123",
		license_key="secret",
		edition_ids=("GeoLite2-City", "GeoLite2-ASN"),
		db_dir=tmp_path / "geoip",
		host="::",
		update_interval_hours=24,
		port=8080,
	)


class FakeCityReader:
	def __init__(self, responses: dict[str, object]):
		self._responses = responses
		self.closed = False

	def city(self, ip: str) -> object:
		if ip not in self._responses:
			raise AddressNotFoundError("missing")
		return self._responses[ip]

	def close(self) -> None:
		self.closed = True


class FakeAsnReader:
	def __init__(self, responses: dict[str, object]):
		self._responses = responses
		self.closed = False

	def asn(self, ip: str) -> object:
		if ip not in self._responses:
			raise AddressNotFoundError("missing")
		return self._responses[ip]

	def close(self) -> None:
		self.closed = True


def make_city_response() -> object:
	return SimpleNamespace(
		country=SimpleNamespace(iso_code="US", name="United States"),
		subdivisions=SimpleNamespace(
			most_specific=SimpleNamespace(name="California")
		),
		city=SimpleNamespace(name="Mountain View"),
		location=SimpleNamespace(
			latitude=37.386,
			longitude=-122.0838,
			time_zone="America/Los_Angeles",
			accuracy_radius=20,
		),
	)


def make_asn_response() -> object:
	return SimpleNamespace(
		autonomous_system_number=15169,
		autonomous_system_organization="Google LLC",
	)


def test_lookup_returns_city_and_asn_data_for_public_ip(tmp_path: Path) -> None:
	manager = GeoIPDatabaseManager(
		make_settings(tmp_path),
		update_runner=lambda _settings: None,
		city_reader_factory=lambda _path: FakeCityReader({"8.8.8.8": make_city_response()}),
		asn_reader_factory=lambda _path: FakeAsnReader({"8.8.8.8": make_asn_response()}),
		now_provider=fixed_now,
	)

	manager.refresh_databases()
	result = manager.lookup("8.8.8.8")

	assert result.found is True
	assert result.is_public is True
	assert result.country_code == "US"
	assert result.city == "Mountain View"
	assert result.timezone == "America/Los_Angeles"
	assert result.asn == 15169

	health = manager.health_snapshot()
	assert health.phase == "ready"
	assert health.update_in_progress is False
	assert health.current_update_started_at is None
	assert health.last_successful_update_at == fixed_now()


def test_lookup_returns_not_found_for_private_ip(tmp_path: Path) -> None:
	manager = GeoIPDatabaseManager(
		make_settings(tmp_path),
		update_runner=lambda _settings: None,
		city_reader_factory=lambda _path: FakeCityReader({}),
		asn_reader_factory=lambda _path: FakeAsnReader({}),
		now_provider=fixed_now,
	)

	manager.refresh_databases()
	result = manager.lookup("10.0.0.1")

	assert result.found is False
	assert result.is_public is False
	assert result.country is None


def test_initialize_marks_health_ready_after_successful_bootstrap(tmp_path: Path) -> None:
	manager = GeoIPDatabaseManager(
		make_settings(tmp_path),
		update_runner=lambda _settings: None,
		city_reader_factory=lambda _path: FakeCityReader({"8.8.8.8": make_city_response()}),
		asn_reader_factory=lambda _path: FakeAsnReader({"8.8.8.8": make_asn_response()}),
		now_provider=fixed_now,
	)

	manager.initialize()
	health = manager.health_snapshot()

	assert health.ready is True
	assert health.status == "healthy"
	assert health.phase == "ready"
	assert health.update_in_progress is False
	assert health.current_update_started_at is None
	assert health.last_successful_update_at == fixed_now()


def test_refresh_reports_downloading_phase_while_update_is_in_progress(
	tmp_path: Path,
) -> None:
	update_started = threading.Event()
	allow_update_to_finish = threading.Event()

	def update_runner(_settings: Settings) -> None:
		update_started.set()
		if not allow_update_to_finish.wait(timeout=1):
			raise RuntimeError("timed out waiting to finish update")

	manager = GeoIPDatabaseManager(
		make_settings(tmp_path),
		update_runner=update_runner,
		city_reader_factory=lambda _path: FakeCityReader({"8.8.8.8": make_city_response()}),
		asn_reader_factory=lambda _path: FakeAsnReader({"8.8.8.8": make_asn_response()}),
		now_provider=fixed_now,
	)

	refresh_thread = threading.Thread(target=manager.refresh_databases)
	refresh_thread.start()
	assert update_started.wait(timeout=1) is True

	health = manager.health_snapshot()
	assert health.ready is False
	assert health.phase == "downloading"
	assert health.update_in_progress is True
	assert health.current_update_started_at == fixed_now()

	allow_update_to_finish.set()
	refresh_thread.join(timeout=1)
	assert refresh_thread.is_alive() is False
	assert manager.health_snapshot().phase == "ready"


def test_refresh_reports_loading_phase_while_readers_are_loading(tmp_path: Path) -> None:
	reader_loading_started = threading.Event()
	allow_reader_load = threading.Event()

	def city_reader_factory(_path: Path) -> FakeCityReader:
		reader_loading_started.set()
		if not allow_reader_load.wait(timeout=1):
			raise RuntimeError("timed out waiting to finish reader load")
		return FakeCityReader({"8.8.8.8": make_city_response()})

	manager = GeoIPDatabaseManager(
		make_settings(tmp_path),
		update_runner=lambda _settings: None,
		city_reader_factory=city_reader_factory,
		asn_reader_factory=lambda _path: FakeAsnReader({"8.8.8.8": make_asn_response()}),
		now_provider=fixed_now,
	)

	refresh_thread = threading.Thread(target=manager.refresh_databases)
	refresh_thread.start()
	assert reader_loading_started.wait(timeout=1) is True

	health = manager.health_snapshot()
	assert health.ready is False
	assert health.phase == "loading"
	assert health.update_in_progress is True
	assert health.current_update_started_at == fixed_now()

	allow_reader_load.set()
	refresh_thread.join(timeout=1)
	assert refresh_thread.is_alive() is False
	assert manager.health_snapshot().phase == "ready"


def test_initialize_falls_back_to_existing_readers_when_update_fails(
	tmp_path: Path,
) -> None:
	manager = GeoIPDatabaseManager(
		make_settings(tmp_path),
		update_runner=lambda _settings: (_ for _ in ()).throw(RuntimeError("boom")),
		city_reader_factory=lambda _path: FakeCityReader({"8.8.8.8": make_city_response()}),
		asn_reader_factory=lambda _path: FakeAsnReader({"8.8.8.8": make_asn_response()}),
		now_provider=fixed_now,
	)

	manager.initialize()
	health = manager.health_snapshot()

	assert health.ready is True
	assert health.status == "degraded"
	assert health.phase == "ready"
	assert health.update_in_progress is False
	assert health.last_update_error == "boom"


def test_initialize_reports_error_when_update_and_existing_databases_fail(
	tmp_path: Path,
) -> None:
	def missing_reader(_path: Path) -> FakeCityReader:
		raise FileNotFoundError("missing database")

	manager = GeoIPDatabaseManager(
		make_settings(tmp_path),
		update_runner=lambda _settings: (_ for _ in ()).throw(RuntimeError("boom")),
		city_reader_factory=missing_reader,
		asn_reader_factory=missing_reader,
		now_provider=fixed_now,
	)

	manager.initialize()
	health = manager.health_snapshot()

	assert health.ready is False
	assert health.status == "unhealthy"
	assert health.phase == "error"
	assert health.update_in_progress is False
	assert health.last_update_error == "boom"


def test_failed_refresh_keeps_existing_readers(tmp_path: Path) -> None:
	state = {"should_fail": False}

	def update_runner(_settings: Settings) -> None:
		if state["should_fail"]:
			raise RuntimeError("refresh failed")

	manager = GeoIPDatabaseManager(
		make_settings(tmp_path),
		update_runner=update_runner,
		city_reader_factory=lambda _path: FakeCityReader({"8.8.8.8": make_city_response()}),
		asn_reader_factory=lambda _path: FakeAsnReader({"8.8.8.8": make_asn_response()}),
		now_provider=fixed_now,
	)

	manager.refresh_databases()
	state["should_fail"] = True

	try:
		manager.refresh_databases()
	except RuntimeError:
		pass

	result = manager.lookup("8.8.8.8")
	assert result.found is True
	health = manager.health_snapshot()
	assert health.status == "degraded"
	assert health.phase == "ready"
	assert health.update_in_progress is False
