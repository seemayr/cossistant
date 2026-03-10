"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";

export type ContactVisitorDetailState =
	| {
			type: "contact";
			contactId: string;
	  }
	| {
			type: "visitor";
			visitorId: string;
	  }
	| null;

export function resolveContactVisitorDetailState(params: {
	contactId: string | null;
	visitorId: string | null;
}): ContactVisitorDetailState {
	if (params.contactId) {
		return {
			type: "contact",
			contactId: params.contactId,
		};
	}

	if (params.visitorId) {
		return {
			type: "visitor",
			visitorId: params.visitorId,
		};
	}

	return null;
}

export function useContactVisitorDetailState() {
	const [contactId, setContactId] = useQueryState("contactId", parseAsString);
	const [visitorId, setVisitorId] = useQueryState("visitorId", parseAsString);

	const activeDetail = useMemo(
		() =>
			resolveContactVisitorDetailState({
				contactId: contactId ?? null,
				visitorId: visitorId ?? null,
			}),
		[contactId, visitorId]
	);

	const closeDetailPage = useCallback(
		() => Promise.all([setContactId(null), setVisitorId(null)]),
		[setContactId, setVisitorId]
	);

	const openContactDetail = useCallback(
		(nextContactId: string) =>
			Promise.all([setContactId(nextContactId), setVisitorId(null)]),
		[setContactId, setVisitorId]
	);

	const openVisitorDetail = useCallback(
		(nextVisitorId: string) =>
			Promise.all([setContactId(null), setVisitorId(nextVisitorId)]),
		[setContactId, setVisitorId]
	);

	return {
		activeDetail,
		closeDetailPage,
		contactId: contactId ?? null,
		openContactDetail,
		openVisitorDetail,
		setContactId,
		setVisitorId,
		visitorId: visitorId ?? null,
	};
}
