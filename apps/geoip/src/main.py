from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Response

from .config import Settings
from .database import GeoIPDatabaseManager
from .models import HealthResponse, LiveResponse, LookupRequest, LookupResponse


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def refresh_databases_forever(manager: GeoIPDatabaseManager) -> None:
	logger.info(
		"GeoIP periodic refresh loop started with interval=%ss",
		manager.settings.update_interval_seconds,
	)
	while True:
		await asyncio.sleep(manager.settings.update_interval_seconds)
		try:
			await asyncio.to_thread(manager.refresh_databases)
		except Exception:
			logger.exception("Periodic GeoIP database refresh failed")


async def initialize_databases(manager: GeoIPDatabaseManager) -> None:
	try:
		await asyncio.to_thread(manager.initialize)
	except Exception:
		logger.exception("GeoIP bootstrap task failed unexpectedly")


def build_bind_addresses(host: str, port: int) -> list[str]:
	normalized_host = host.strip()
	if not normalized_host or normalized_host == "::":
		return [f"0.0.0.0:{port}", f"[::]:{port}"]

	if ":" in normalized_host and not normalized_host.startswith("["):
		return [f"[{normalized_host}]:{port}"]

	return [f"{normalized_host}:{port}"]


def create_app(manager: GeoIPDatabaseManager | None = None) -> FastAPI:
	if manager is None:
		manager = GeoIPDatabaseManager(Settings.from_env())

	@asynccontextmanager
	async def lifespan(app: FastAPI) -> AsyncIterator[None]:
		app.state.geoip_manager = manager
		bootstrap_task = asyncio.create_task(initialize_databases(manager))
		refresh_task = asyncio.create_task(refresh_databases_forever(manager))

		try:
			yield
		finally:
			for task in (bootstrap_task, refresh_task):
				task.cancel()
				try:
					await task
				except asyncio.CancelledError:
					pass
			await asyncio.to_thread(manager.close)

	app = FastAPI(title="Cossistant GeoIP Service", lifespan=lifespan)

	@app.get("/live", response_model=LiveResponse)
	async def live() -> LiveResponse:
		return LiveResponse(status="ok")

	@app.get("/health", response_model=HealthResponse)
	async def health(response: Response) -> HealthResponse:
		snapshot = app.state.geoip_manager.health_snapshot()
		response.status_code = 200 if snapshot.ready else 503
		return snapshot

	@app.post("/v1/lookup", response_model=LookupResponse)
	async def lookup(payload: LookupRequest) -> LookupResponse:
		try:
			logger.info("getting info for %s", payload.ip)
			return await asyncio.to_thread(app.state.geoip_manager.lookup, payload.ip)
		except RuntimeError as error:
			raise HTTPException(status_code=503, detail=str(error)) from error

	return app


app = create_app()


if __name__ == "__main__":
	from hypercorn.asyncio import serve
	from hypercorn.config import Config

	settings = Settings.from_env()
	config = Config()
	config.bind = build_bind_addresses(settings.host, settings.port)
	config.accesslog = "-"
	config.errorlog = "-"
	asyncio.run(serve(app, config))
