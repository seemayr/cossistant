import type { Database } from "@api/db";
import {
	getWebsiteMemberById,
	type WebsiteMember,
} from "@api/db/queries/member";
import type { ApiKeySelect } from "@api/db/schema";
import { APIKeyType } from "@cossistant/types";
import { AuthValidationError } from "./auth-validation";

type ResolvePrivateApiKeyActorParams = {
	db: Database;
	apiKey: Pick<ApiKeySelect, "keyType" | "linkedUserId">;
	organizationId: string;
	websiteTeamId: string | null | undefined;
	explicitActorUserId?: string | null;
	required: boolean;
	missingActorMessage?: string;
	invalidActorMessage?: string;
};

export type ResolvedPrivateApiKeyActor = {
	userId: string;
	member: WebsiteMember;
	source: "linked_key" | "explicit";
};

export async function resolvePrivateApiKeyActorUser(
	params: ResolvePrivateApiKeyActorParams
): Promise<ResolvedPrivateApiKeyActor | null> {
	if (params.apiKey.keyType !== APIKeyType.PRIVATE) {
		throw new AuthValidationError(403, "Private API key required");
	}

	const explicitActorUserId =
		typeof params.explicitActorUserId === "string"
			? params.explicitActorUserId.trim()
			: "";
	const candidateUserId = params.apiKey.linkedUserId
		? params.apiKey.linkedUserId
		: explicitActorUserId || null;

	if (!candidateUserId) {
		if (!params.required) {
			return null;
		}

		throw new AuthValidationError(
			400,
			params.missingActorMessage ??
				"X-Actor-User-Id is required when using an unlinked private API key"
		);
	}

	if (!params.websiteTeamId) {
		throw new AuthValidationError(
			403,
			params.invalidActorMessage ?? "Actor user is not allowed for this website"
		);
	}

	const member = await getWebsiteMemberById(params.db, {
		organizationId: params.organizationId,
		websiteTeamId: params.websiteTeamId,
		userId: candidateUserId,
	});

	if (!member) {
		throw new AuthValidationError(
			403,
			params.invalidActorMessage ?? "Actor user is not allowed for this website"
		);
	}

	return {
		userId: candidateUserId,
		member,
		source: params.apiKey.linkedUserId ? "linked_key" : "explicit",
	};
}
