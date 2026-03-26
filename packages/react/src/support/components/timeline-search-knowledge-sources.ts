"use client";

export type WidgetSource = {
	key: string;
	label: string;
	href: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSourceUrl(
	sourceUrl: string | null | undefined
): string | null {
	const trimmedSourceUrl = sourceUrl?.trim();
	if (!trimmedSourceUrl) {
		return null;
	}

	try {
		const parsed = new URL(trimmedSourceUrl);
		const normalizedHostname = parsed.hostname.toLowerCase();
		const normalizedPathname =
			parsed.pathname === "/"
				? "/"
				: parsed.pathname.replace(/\/+$/, "") || "/";
		const normalizedPort = parsed.port ? `:${parsed.port}` : "";

		return `${parsed.protocol}//${normalizedHostname}${normalizedPort}${normalizedPathname}${parsed.search}`;
	} catch {
		return null;
	}
}

function toCompactSourceLabel(params: {
	title?: string | null;
	sourceUrl?: string | null;
}): string | null {
	const trimmedTitle = params.title?.trim();
	if (trimmedTitle) {
		return trimmedTitle;
	}

	const trimmedSourceUrl = params.sourceUrl?.trim();
	if (!trimmedSourceUrl) {
		return null;
	}

	try {
		const parsed = new URL(trimmedSourceUrl);
		const hostname = parsed.hostname.replace(/^www\./, "");
		const pathname =
			parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");

		return `${hostname}${pathname}`;
	} catch {
		return trimmedSourceUrl;
	}
}

export function extractWidgetSources(output: unknown): WidgetSource[] {
	if (!isRecord(output)) {
		return [];
	}

	const data = isRecord(output.data) ? output.data : null;
	const articles = Array.isArray(data?.articles) ? data.articles : [];
	const seenKeys = new Set<string>();
	const widgetSources: WidgetSource[] = [];

	for (const article of articles) {
		if (!isRecord(article) || article.sourceType !== "url") {
			continue;
		}

		const sourceUrl =
			typeof article.sourceUrl === "string" ? article.sourceUrl.trim() : "";
		const normalizedSourceUrl = normalizeSourceUrl(sourceUrl);
		if (!normalizedSourceUrl) {
			continue;
		}

		const dedupeKey = `url:${normalizedSourceUrl}`;
		if (seenKeys.has(dedupeKey)) {
			continue;
		}

		seenKeys.add(dedupeKey);

		widgetSources.push({
			key: dedupeKey,
			label:
				toCompactSourceLabel({
					title: typeof article.title === "string" ? article.title : null,
					sourceUrl,
				}) ?? sourceUrl,
			href: sourceUrl,
		});

		if (widgetSources.length === 3) {
			break;
		}
	}

	return widgetSources;
}
