export type {
	CossistantConfig,
	CossistantError,
	DefaultMessage,
} from "@cossistant/types";
export type {
	AttributionChannel,
	UpdateVisitorRequest,
	VisitorActivityRequest,
	VisitorAttribution,
	VisitorAttributionClickIds,
	VisitorAttributionUtm,
	VisitorCurrentPage,
	VisitorMetadata,
	VisitorResponse,
} from "@cossistant/types/api/visitor";
export type { PublicWebsiteResponse } from "@cossistant/types/api/website";
export { PRESENCE_PING_INTERVAL_MS } from "@cossistant/types/presence";

import type { CossistantError } from "@cossistant/types";

export class CossistantAPIError extends Error {
	code: string;
	details?: Record<string, unknown>;

	constructor(error: CossistantError) {
		super(error.message);
		this.name = "CossistantAPIError";
		this.code = error.code;
		this.details = error.details;
	}
}
