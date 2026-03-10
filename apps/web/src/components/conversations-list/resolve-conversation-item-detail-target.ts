export type ConversationItemDetailTarget =
	| {
			type: "contact";
			id: string;
	  }
	| {
			type: "visitor";
			id: string;
	  }
	| null;

type DetailTargetSource =
	| {
			id?: string | null;
			contact?: {
				id?: string | null;
			} | null;
	  }
	| null
	| undefined;

export function resolveConversationItemDetailTarget(params: {
	headerVisitor?: DetailTargetSource;
	visitor?: DetailTargetSource;
	visitorId?: string | null;
}): ConversationItemDetailTarget {
	const contactId =
		params.visitor?.contact?.id ?? params.headerVisitor?.contact?.id;

	if (contactId) {
		return {
			type: "contact",
			id: contactId,
		};
	}

	const visitorId =
		params.visitor?.id ?? params.headerVisitor?.id ?? params.visitorId ?? null;

	if (visitorId) {
		return {
			type: "visitor",
			id: visitorId,
		};
	}

	return null;
}
