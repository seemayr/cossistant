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

If local widget/API traffic only ever resolves to `127.0.0.1` or `::1`, you can force deterministic GeoIP testing by setting `LOCAL_VISITOR_IP_OVERRIDE` in your local API env. Use a stable public IP that MaxMind resolves predictably, for example:

```env
LOCAL_VISITOR_IP_OVERRIDE=8.8.8.8
```

Set it in `apps/api/.env` or your root `.env`. This override is intended for local development only and lets the normal MaxMind lookup path run end-to-end even when requests originate from localhost.

## Railway

Deploy this app as its own Railway service named `geoip`.

The service uses Hypercorn and binds to `[::]:PORT` by default. This keeps Railway private networking compatible with both legacy IPv6-only environments and newer dual-stack environments, without attempting the conflicting `0.0.0.0` plus `[::]` dual-bind.

Use `/live` as the Railway deployment healthcheck path. `/health` remains a readiness endpoint and can return `503` until the MaxMind databases have been downloaded and loaded.

The service now starts serving `/live` immediately while the initial MaxMind bootstrap runs in the background. Inspect `/health` for readiness and bootstrap state:

- `phase`: `starting`, `downloading`, `loading`, `ready`, or `error`
- `update_in_progress`: whether a download/load cycle is active
- `current_update_started_at`: when the active update began
- `last_update_error`: the latest refresh/bootstrap failure, if any

Set Railway `HOST=::` with no quotes. Railway environment variable values should be entered as raw values, for example `HOST=::`, not `HOST="::"`.

If you want an explicit local-only override, you can set `HOST=0.0.0.0` in your local `.env`.

Railway logs will now include `geoipupdate` output, which makes it easier to confirm whether the MaxMind databases are actively downloading.

The main API should use:

```env
GEOIP_SERVICE_URL=http://geoip.railway.internal:8080
```

Only the `geoip` service needs the MaxMind credentials.
