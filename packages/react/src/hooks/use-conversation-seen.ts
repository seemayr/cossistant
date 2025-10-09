import type { ConversationSeen } from "@cossistant/types/schemas";
import { useEffect, useMemo, useRef, useState } from "react";
import { hydrateConversationSeen, useSeenStore } from "../realtime/seen-store";

type UseConversationSeenOptions = {
	initialData?: ConversationSeen[];
};

function buildSeenId(
	conversationId: string,
	actorType: string,
	actorId: string
) {
	return `${conversationId}-${actorType}-${actorId}`;
}

export function useConversationSeen(
	conversationId: string | null | undefined,
	options: UseConversationSeenOptions = {}
): ConversationSeen[] {
	const { initialData } = options;
	const hydratedKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!(conversationId && initialData) || initialData.length === 0) {
			return;
		}

		const hydrationKey = `${conversationId}:${initialData
			.map((entry) => `${entry.id}:${new Date(entry.updatedAt).getTime()}`)
			.join("|")}`;

		if (hydratedKeyRef.current === hydrationKey) {
			return;
		}

		hydrateConversationSeen(conversationId, initialData);
		hydratedKeyRef.current = hydrationKey;
	}, [conversationId, initialData]);

	const conversationSeen = useSeenStore((state) =>
		conversationId ? (state.conversations[conversationId] ?? null) : null
	);

	return useMemo(() => {
		if (!(conversationId && conversationSeen)) {
			return [];
		}

		return Object.values(conversationSeen).map((entry) => {
			const timestamp = entry.lastSeenAt.toISOString();

			return {
				id: buildSeenId(conversationId, entry.actorType, entry.actorId),
				conversationId,
				userId: entry.actorType === "user" ? entry.actorId : null,
				visitorId: entry.actorType === "visitor" ? entry.actorId : null,
				aiAgentId: entry.actorType === "ai_agent" ? entry.actorId : null,
				lastSeenAt: timestamp,
				createdAt: timestamp,
				updatedAt: timestamp,
				deletedAt: null,
			} satisfies ConversationSeen;
		});
	}, [conversationId, conversationSeen]);
}

/**
 * Debounced version of useConversationSeen that delays updates by 500ms
 * to prevent animation conflicts when messages are sent and immediately seen.
 *
 * Use this in UI components where smooth animations are critical.
 */
export function useDebouncedConversationSeen(
	conversationId: string | null | undefined,
	options: UseConversationSeenOptions = {},
	delay = 500
): ConversationSeen[] {
	const seenData = useConversationSeen(conversationId, options);
	const [debouncedSeenData, setDebouncedSeenData] =
		useState<ConversationSeen[]>(seenData);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		// Clear any pending timeout
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		// Set new timeout to update after delay
		timeoutRef.current = setTimeout(() => {
			setDebouncedSeenData(seenData);
		}, delay);

		// Cleanup on unmount or when seenData changes
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [seenData, delay]);

	return debouncedSeenData;
}
