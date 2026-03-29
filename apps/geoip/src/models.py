from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class LiveResponse(BaseModel):
	status: Literal["ok"]


class HealthResponse(BaseModel):
	status: Literal["healthy", "degraded", "unhealthy"]
	ready: bool
	edition_ids: list[str]
	db_loaded_at: datetime | None = None
	last_successful_update_at: datetime | None = None
	last_update_error: str | None = None


class LookupRequest(BaseModel):
	ip: str = Field(..., min_length=1, max_length=255)


class LookupResponse(BaseModel):
	ip: str
	found: bool
	is_public: bool
	country_code: str | None = None
	country: str | None = None
	region: str | None = None
	city: str | None = None
	latitude: float | None = None
	longitude: float | None = None
	timezone: str | None = None
	accuracy_radius_km: int | None = None
	asn: int | None = None
	asn_organization: str | None = None
	source: str
	resolved_at: datetime
