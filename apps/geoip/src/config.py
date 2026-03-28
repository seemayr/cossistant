from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


DEFAULT_EDITION_IDS = ("GeoLite2-City", "GeoLite2-ASN")


def _split_edition_ids(raw_value: str | None) -> tuple[str, ...]:
	if not raw_value:
		return DEFAULT_EDITION_IDS

	parts = tuple(part.strip() for part in raw_value.split() if part.strip())
	return parts or DEFAULT_EDITION_IDS


@dataclass(frozen=True, slots=True)
class Settings:
	account_id: str
	license_key: str
	edition_ids: tuple[str, ...]
	db_dir: Path
	update_interval_hours: int
	port: int

	@property
	def config_path(self) -> Path:
		return self.db_dir / "GeoIP.conf"

	@property
	def city_database_path(self) -> Path:
		return self.db_dir / "GeoLite2-City.mmdb"

	@property
	def asn_database_path(self) -> Path:
		return self.db_dir / "GeoLite2-ASN.mmdb"

	@property
	def update_interval_seconds(self) -> int:
		return max(1, self.update_interval_hours) * 60 * 60

	@classmethod
	def from_env(cls) -> "Settings":
		return cls(
			account_id=os.getenv("MAXMIND_ACCOUNT_ID", "").strip(),
			license_key=os.getenv("MAXMIND_LICENSE_KEY", "").strip(),
			edition_ids=_split_edition_ids(os.getenv("MAXMIND_EDITION_IDS")),
			db_dir=Path(os.getenv("GEOIP_DB_DIR", "/data/geoip")),
			update_interval_hours=int(os.getenv("GEOIP_UPDATE_INTERVAL_HOURS", "24")),
			port=int(os.getenv("PORT", "8080")),
		)

