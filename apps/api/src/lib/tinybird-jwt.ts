import { env } from "@api/env";
import jwt from "jsonwebtoken";

const TINYBIRD_SIGNING_KEY = env.TINYBIRD_SIGNING_KEY || env.TINYBIRD_TOKEN;

const PIPES = [
	"online_now",
	"visitor_presence",
	"presence_locations",
	"inbox_analytics",
	"unique_visitors",
] as const;

const JWT_EXPIRY_SECONDS = 600; // 10 minutes

export function generateTinybirdJWT(websiteId: string): string {
	const next10minutes = new Date();
	next10minutes.setTime(next10minutes.getTime() + 1000 * JWT_EXPIRY_SECONDS);

	const payload = {
		workspace_id: env.TINYBIRD_WORKSPACE,
		name: `frontend_${websiteId}`,
		exp: Math.floor(next10minutes.getTime() / 1000),
		scopes: PIPES.map((pipe) => ({
			type: "PIPES:READ",
			resource: pipe,
			fixed_params: { website_id: websiteId },
		})),
	};

	return jwt.sign(payload, TINYBIRD_SIGNING_KEY, { noTimestamp: true });
}
