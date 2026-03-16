"use client";

import type { ConversationHeader } from "@/contexts/inboxes";

export type CategoryType =
	| "needsHuman"
	| "needsClarification"
	| "waiting8Hours"
	| "other";

export type CategoryHeader = {
	type: "header";
	category: CategoryType;
	count: number;
	label: string;
};

export type ConversationItem = {
	type: "conversation";
	conversation: ConversationHeader;
	category: CategoryType;
};

export type AnalyticsItem = {
	type: "analytics";
};

export type VirtualListItem = CategoryHeader | ConversationItem | AnalyticsItem;

export const CATEGORY_LABELS: Record<CategoryType, string> = {
	needsHuman: "Human intervention needed",
	needsClarification: "Clarification needed",
	waiting8Hours: "Long waiting",
	other: "Other conversations",
} as const;

export const PRIORITY_WEIGHTS = {
	urgent: 4,
	high: 3,
	normal: 2,
	low: 1,
} as const;

export const HEADER_HEIGHT = 48;
export const ITEM_HEIGHT = 48;
export const ANALYTICS_HEIGHT = 76;
export const WAITING_THRESHOLD_MS = 8 * 60 * 60 * 1000; // 8 hours
