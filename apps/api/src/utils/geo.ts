import { extractClientIpFromRequest } from "@api/utils/client-ip";
import type { HonoRequest } from "hono";

export function getGeoContext(req: HonoRequest) {
	const headers = req.header();
	const ipInfo = extractClientIpFromRequest(req);

	const country = headers["x-user-country"]?.toUpperCase() ?? null;
	const locale = headers["x-user-locale"] ?? null;
	const timezone = headers["x-user-timezone"] ?? null;
	const ip = ipInfo.canonicalIp;

	return {
		country,
		locale,
		timezone,
		ip,
	};
}
