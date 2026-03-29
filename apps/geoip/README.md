# GeoIP Service

Private FastAPI service for MaxMind-backed IP geolocation lookups.

## Purpose

- Keep IP geolocation local to our infrastructure
- Auto-refresh MaxMind GeoLite databases
- Expose a small private REST API for the main API service

## Endpoints

- `GET /live`
- `GET /health`
- `POST /v1/lookup`

Request body:

```json
{
  "ip": "8.8.8.8"
}
```

## Required environment variables

```env
MAXMIND_ACCOUNT_ID=1321218
MAXMIND_LICENSE_KEY=<secret>
MAXMIND_EDITION_IDS=GeoLite2-City GeoLite2-ASN
GEOIP_DB_DIR=/data/geoip
GEOIP_UPDATE_INTERVAL_HOURS=24
HOST=::
PORT=8080
```

## Local development

The root [docker-compose.yml](/Users/anthonyriera/code/cossistant-monorepo/docker-compose.yml) starts this service for local development.

`bun dev` runs `docker compose up -d` first, so `geoip` starts automatically with the rest of the local services.

This image no longer depends on Debian providing a `geoipupdate` package. It copies a pinned `geoipupdate` binary from MaxMind's official container image instead, which avoids the package-availability issue on newer Debian bases.

To get a healthy service locally, copy [apps/geoip/.env.default](/Users/anthonyriera/code/cossistant-monorepo/apps/geoip/.env.default) or the GeoIP section from [.env.example](/Users/anthonyriera/code/cossistant-monorepo/.env.example) into your root `.env` before starting Docker Compose. If `MAXMIND_ACCOUNT_ID` or `MAXMIND_LICENSE_KEY` is missing, the container can still start, but `/health` will stay unhealthy and `/v1/lookup` will return `503` until database downloads succeed.

Local ports:

- host: `http://localhost:8083`
- container: `http://geoip:8080`

The API should use:

```env
GEOIP_SERVICE_URL=http://localhost:8083
```

## Railway

Deploy this app as its own Railway service named `geoip`.

The service binds to `::` by default so Railway private networking can reach it in both new dual-stack environments and older IPv6-only ones.

Use `/live` as the Railway deployment healthcheck path. `/health` remains a readiness endpoint and can return `503` until the MaxMind databases have been downloaded and loaded.

The main API should use:

```env
GEOIP_SERVICE_URL=http://geoip.railway.internal:8080
```

Only the `geoip` service needs the MaxMind credentials.
