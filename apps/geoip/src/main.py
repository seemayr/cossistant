from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Response
import uvicorn

from .config import Settings
from .database import GeoIPDatabaseManager
from .models import HealthResponse, LookupRequest, LookupResponse


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def refresh_databases_forever(manager: GeoIPDatabaseManager) -> None:
	while True:
		await asyncio.sleep(manager.settings.update_interval_seconds)
		try:
			await asyncio.to_thread(manager.refresh_databases)
		except Exception:
			logger.exception("Periodic GeoIP database refresh failed")


def create_app(manager: GeoIPDatabaseManager | None = None) -> FastAPI:
	if manager is None:
		manager = GeoIPDatabaseManager(Settings.from_env())

	@asynccontextmanager
	async def lifespan(app: FastAPI) -> AsyncIterator[None]:
		app.state.geoip_manager = manager
		await asyncio.to_thread(manager.initialize)
		refresh_task = asyncio.create_task(refresh_databases_forever(manager))

		try:
			yield
		finally:
			refresh_task.cancel()
			try:
				await refresh_task
			except asyncio.CancelledError:
				pass
			await asyncio.to_thread(manager.close)

	app = FastAPI(title="Cossistant GeoIP Service", lifespan=lifespan)

	@app.get("/health", response_model=HealthResponse)
	async def health(response: Response) -> HealthResponse:
		snapshot = app.state.geoip_manager.health_snapshot()
		response.status_code = 200 if snapshot.ready else 503
		return snapshot

	@app.post("/v1/lookup", response_model=LookupResponse)
	async def lookup(payload: LookupRequest) -> LookupResponse:
		try:
			return await asyncio.to_thread(app.state.geoip_manager.lookup, payload.ip)
		except RuntimeError as error:
			raise HTTPException(status_code=503, detail=str(error)) from error

	return app


app = create_app()


if __name__ == "__main__":
	settings = Settings.from_env()
	uvicorn.run("src.main:app", host="0.0.0.0", port=settings.port)

