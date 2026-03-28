ARG GEOIPUPDATE_VERSION=v7.1.1

FROM ghcr.io/maxmind/geoipupdate:${GEOIPUPDATE_VERSION} AS geoipupdate

RUN cp "$(command -v geoipupdate)" /tmp/geoipupdate

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=geoipupdate /tmp/geoipupdate /usr/local/bin/geoipupdate
RUN chmod +x /usr/local/bin/geoipupdate

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

CMD ["python", "-m", "src.main"]
