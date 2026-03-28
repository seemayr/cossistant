from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import ipaddress
import logging
from pathlib import Path
import subprocess
import threading
from typing import Any, Callable

from geoip2.database import Reader
from geoip2.errors import AddressNotFoundError

from .config import Settings
from .models import HealthResponse, LookupResponse


logger = logging.getLogger(__name__)

UpdateRunner = Callable[[Settings], None]
ReaderFactory = Callable[[Path], Any]
NowProvider = Callable[[], datetime]


def utc_now() -> datetime:
	return datetime.now(timezone.utc)


def write_geoip_config(settings: Settings) -> None:
	settings.db_dir.mkdir(parents=True, exist_ok=True)
	settings.config_path.write_text(
		"\n".join(
			[
				f"AccountID {settings.account_id}",
				f"LicenseKey {settings.license_key}",
				f"EditionIDs {' '.join(settings.edition_ids)}",
				f"DatabaseDirectory {settings.db_dir}",
				"",
			]
		),
		encoding="utf-8",
	)


def run_geoip_update(settings: Settings) -> None:
	if not settings.account_id or not settings.license_key:
		raise RuntimeError(
			"MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY are required for database updates"
		)

	write_geoip_config(settings)
	result = subprocess.run(
		["geoipupdate", "-f", str(settings.config_path)],
		capture_output=True,
		check=False,
		text=True,
	)

	if result.returncode != 0:
		error_output = result.stderr.strip() or result.stdout.strip()
		raise RuntimeError(f"geoipupdate failed: {error_output}")


class GeoIPDatabaseManager:
	def __init__(
		self,
		settings: Settings,
		update_runner: UpdateRunner = run_geoip_update,
		city_reader_factory: ReaderFactory | None = None,
		asn_reader_factory: ReaderFactory | None = None,
		now_provider: NowProvider = utc_now,
	):
		self.settings = settings
		self._update_runner = update_runner
		self._city_reader_factory = city_reader_factory or Reader
		self._asn_reader_factory = asn_reader_factory or Reader
		self._now_provider = now_provider
		self._lock = threading.RLock()
		self._city_reader: Any | None = None
		self._asn_reader: Any | None = None
		self._ready = False
		self._db_loaded_at: datetime | None = None
		self._last_successful_update_at: datetime | None = None
		self._last_update_error: str | None = None

	def initialize(self) -> None:
		try:
			self.refresh_databases()
			return
		except Exception as error:
			logger.exception("Initial GeoIP database update failed")
			initial_error = str(error)

		try:
			self.load_existing_databases()
		except Exception:
			with self._lock:
				self._ready = False
				self._last_update_error = initial_error
			return
		else:
			with self._lock:
				self._last_update_error = initial_error

	def refresh_databases(self) -> None:
		try:
			self.settings.db_dir.mkdir(parents=True, exist_ok=True)
			self._update_runner(self.settings)
			loaded_at = self._now_provider()
			self._swap_readers(loaded_at=loaded_at)
			with self._lock:
				self._last_successful_update_at = loaded_at
				self._last_update_error = None
		except Exception as error:
			with self._lock:
				self._last_update_error = str(error)
			raise

	def load_existing_databases(self) -> None:
		self._swap_readers(loaded_at=self._now_provider())

	def _swap_readers(self, loaded_at: datetime) -> None:
		new_city_reader = self._city_reader_factory(self.settings.city_database_path)
		new_asn_reader = self._asn_reader_factory(self.settings.asn_database_path)

		with self._lock:
			old_city_reader = self._city_reader
			old_asn_reader = self._asn_reader
			self._city_reader = new_city_reader
			self._asn_reader = new_asn_reader
			self._ready = True
			self._db_loaded_at = loaded_at

		for reader in (old_city_reader, old_asn_reader):
			if reader is not None:
				try:
					reader.close()
				except Exception:
					logger.exception("Failed to close old GeoIP reader")

	def close(self) -> None:
		with self._lock:
			readers = (self._city_reader, self._asn_reader)
			self._city_reader = None
			self._asn_reader = None
			self._ready = False

		for reader in readers:
			if reader is not None:
				try:
					reader.close()
				except Exception:
					logger.exception("Failed to close GeoIP reader")

	def health_snapshot(self) -> HealthResponse:
		with self._lock:
			status = "healthy" if self._ready else "unhealthy"
			if self._ready and self._last_update_error:
				status = "degraded"

			return HealthResponse(
				status=status,
				ready=self._ready,
				edition_ids=list(self.settings.edition_ids),
				db_loaded_at=self._db_loaded_at,
				last_successful_update_at=self._last_successful_update_at,
				last_update_error=self._last_update_error,
			)

	def lookup(self, raw_ip: str) -> LookupResponse:
		resolved_at = self._now_provider()
		ip = raw_ip.strip()

		try:
			parsed_ip = ipaddress.ip_address(ip)
		except ValueError:
			return LookupResponse(
				ip=ip,
				found=False,
				is_public=False,
				source="maxmind",
				resolved_at=resolved_at,
			)

		if not parsed_ip.is_global:
			return LookupResponse(
				ip=ip,
				found=False,
				is_public=False,
				source="maxmind",
				resolved_at=resolved_at,
			)

		with self._lock:
			if not self._ready or self._city_reader is None or self._asn_reader is None:
				raise RuntimeError("GeoIP database is not ready")
			city_reader = self._city_reader
			asn_reader = self._asn_reader

		city_response = None
		asn_response = None

		try:
			city_response = city_reader.city(ip)
		except AddressNotFoundError:
			city_response = None

		try:
			asn_response = asn_reader.asn(ip)
		except AddressNotFoundError:
			asn_response = None

		subdivision = None
		if city_response and city_response.subdivisions:
			subdivision = city_response.subdivisions.most_specific

		return LookupResponse(
			ip=ip,
			found=city_response is not None or asn_response is not None,
			is_public=True,
			country_code=city_response.country.iso_code if city_response else None,
			country=city_response.country.name if city_response else None,
			region=subdivision.name if subdivision else None,
			city=city_response.city.name if city_response else None,
			latitude=city_response.location.latitude if city_response else None,
			longitude=city_response.location.longitude if city_response else None,
			timezone=city_response.location.time_zone if city_response else None,
			accuracy_radius_km=(
				city_response.location.accuracy_radius if city_response else None
			),
			asn=(
				asn_response.autonomous_system_number if asn_response else None
			),
			asn_organization=(
				asn_response.autonomous_system_organization if asn_response else None
			),
			source="maxmind",
			resolved_at=resolved_at,
		)

	def health_snapshot_dict(self) -> dict[str, Any]:
		return asdict(self.health_snapshot())
