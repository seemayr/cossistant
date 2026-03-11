"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
	memo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { CategoryHeader } from "@/components/conversations-list/category-header";
import { ConversationItem } from "@/components/conversations-list/conversation-item";
import type { ConversationHeader } from "@/contexts/inboxes";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageContent } from "../ui/layout";
import { buildConversationListModel, CONVERSATION_LIST_GAP } from "./model";
import {
	ANALYTICS_HEIGHT,
	HEADER_HEIGHT,
	ITEM_HEIGHT,
	type VirtualListItem,
} from "./types";
import { useConversationKeyboardNavigation } from "./use-conversation-keyboard-navigation";

type ConversationsListProps = {
	basePath: string;
	conversations: ConversationHeader[];
	showWaitingForReplyPill: boolean;
	websiteSlug: string;
	smartItems?: VirtualListItem[] | null;
	analyticsSlot?: ReactNode;
	onLockedConversationActivate?: (conversationId: string) => void;
};

// Memoized conversation item with proper comparison
const VirtualConversationItem = memo(
	({
		conversation,
		href,
		websiteSlug,
		focused,
		showWaitingForReplyPill,
		isSmartMode,
		onMouseEnter,
		onLockedActivate,
	}: {
		conversation: ConversationHeader;
		href: string;
		websiteSlug: string;
		focused: boolean;
		showWaitingForReplyPill: boolean;
		isSmartMode: boolean;
		onMouseEnter: () => void;
		onLockedActivate?: (conversationId: string) => void;
	}) => (
		<ConversationItem
			focused={focused}
			header={conversation}
			href={href}
			isSmartMode={isSmartMode}
			onLockedActivate={onLockedActivate}
			setFocused={onMouseEnter}
			showWaitingForReplyPill={showWaitingForReplyPill}
			websiteSlug={websiteSlug}
		/>
	),
	(prevProps, nextProps) => {
		// Custom comparison to avoid unnecessary re-renders
		return (
			prevProps.conversation.id === nextProps.conversation.id &&
			prevProps.conversation.lastMessageAt ===
				nextProps.conversation.lastMessageAt &&
			prevProps.conversation.updatedAt === nextProps.conversation.updatedAt &&
			prevProps.conversation.lastSeenAt === nextProps.conversation.lastSeenAt &&
			prevProps.conversation.status === nextProps.conversation.status &&
			prevProps.conversation.deletedAt === nextProps.conversation.deletedAt &&
			prevProps.conversation.dashboardLocked ===
				nextProps.conversation.dashboardLocked &&
			prevProps.conversation.dashboardLockReason ===
				nextProps.conversation.dashboardLockReason &&
			prevProps.focused === nextProps.focused &&
			prevProps.isSmartMode === nextProps.isSmartMode &&
			prevProps.href === nextProps.href
		);
	}
);

VirtualConversationItem.displayName = "VirtualConversationItem";

// Memoized category header
const MemoizedCategoryHeader = memo(CategoryHeader);

const CONVERSATION_LIST_END_PADDING = 240;

export function VirtualizedConversations({
	basePath,
	conversations,
	showWaitingForReplyPill,
	websiteSlug,
	smartItems,
	analyticsSlot,
	onLockedConversationActivate,
}: ConversationsListProps) {
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const isMobile = useIsMobile();
	const analyticsHeight = isMobile ? 0 : ANALYTICS_HEIGHT;

	const isSmartMode = smartItems != null;
	const items = isSmartMode ? smartItems : null;
	const listModel = useMemo(
		() =>
			buildConversationListModel({
				conversations,
				items,
				itemHeight: ITEM_HEIGHT,
				headerHeight: HEADER_HEIGHT,
				analyticsHeight,
				gap: CONVERSATION_LIST_GAP,
			}),
		[analyticsHeight, conversations, items]
	);

	// Populate viewportRef with the actual scrollable element
	useEffect(() => {
		if (scrollAreaRef.current) {
			viewportRef.current = scrollAreaRef.current;
		}
	}, []);

	// Stable scroll element getter
	const getScrollElement = useCallback(() => scrollAreaRef.current, []);

	const { focusedConversationId, handleMouseEnter } =
		useConversationKeyboardNavigation({
			model: listModel,
			basePath,
			parentRef: viewportRef,
			enabled: true,
			onLockedConversationEnter: onLockedConversationActivate,
		});

	// Memoize estimateSize to prevent virtualizer recalculations
	const estimateSize = useCallback(
		(index: number) => listModel.itemSizes[index] ?? ITEM_HEIGHT,
		[listModel.itemSizes]
	);

	// Use conversation IDs as keys to ensure proper React reconciliation when list reorders
	const getItemKey = useCallback(
		(index: number) => listModel.itemKeys[index] ?? index,
		[listModel.itemKeys]
	);

	const virtualizer = useVirtualizer({
		count: listModel.itemCount,
		getScrollElement,
		estimateSize,
		getItemKey,
		gap: CONVERSATION_LIST_GAP,
		overscan: 4,
	});

	useEffect(() => {
		virtualizer.measure();
	}, [analyticsHeight, virtualizer]);

	const virtualItems = virtualizer.getVirtualItems();
	const measuredSize = virtualizer.getTotalSize();

	return (
		<PageContent className="h-full pr-3 contain-strict" ref={scrollAreaRef}>
			<div
				data-slot="conversation-list-content"
				style={{
					paddingBottom: `${CONVERSATION_LIST_END_PADDING}px`,
					width: "100%",
				}}
			>
				<div
					style={{
						height: `${measuredSize}px`,
						width: "100%",
						position: "relative",
					}}
				>
					{virtualItems.map((virtualItem) => {
						if (isSmartMode && items) {
							const item = items[virtualItem.index];

							if (!item) {
								return null;
							}

							if (item.type === "header") {
								return (
									<div
										key={`header-${item.category}`}
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											width: "100%",
											height: `${virtualItem.size}px`,
											transform: `translateY(${virtualItem.start}px)`,
										}}
									>
										<MemoizedCategoryHeader
											category={item.category}
											count={item.count}
											label={item.label}
										/>
									</div>
								);
							}

							if (item.type === "analytics") {
								return (
									<div
										key="analytics"
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											width: "100%",
											height: `${virtualItem.size}px`,
											transform: `translateY(${virtualItem.start}px)`,
										}}
									>
										{analyticsSlot ?? null}
									</div>
								);
							}

							// It's a conversation item
							const conversation = item.conversation;
							const href = `${basePath}/${conversation.id}`;

							return (
								<div
									key={conversation.id}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
										height: `${virtualItem.size}px`,
										transform: `translateY(${virtualItem.start}px)`,
									}}
								>
									<VirtualConversationItem
										conversation={conversation}
										focused={focusedConversationId === conversation.id}
										href={href}
										isSmartMode
										onLockedActivate={onLockedConversationActivate}
										onMouseEnter={() => handleMouseEnter(conversation.id)}
										showWaitingForReplyPill={showWaitingForReplyPill}
										websiteSlug={websiteSlug}
									/>
								</div>
							);
						}

						// Classic mode - just conversations
						// biome-ignore lint/style/noNonNullAssertion: should never happen
						const conversation = conversations[virtualItem.index]!;
						const href = `${basePath}/${conversation.id}`;

						return (
							<div
								key={conversation.id}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									height: `${virtualItem.size}px`,
									transform: `translateY(${virtualItem.start}px)`,
								}}
							>
								<VirtualConversationItem
									conversation={conversation}
									focused={focusedConversationId === conversation.id}
									href={href}
									isSmartMode={false}
									onLockedActivate={onLockedConversationActivate}
									onMouseEnter={() => handleMouseEnter(conversation.id)}
									showWaitingForReplyPill={showWaitingForReplyPill}
									websiteSlug={websiteSlug}
								/>
							</div>
						);
					})}
				</div>
			</div>
		</PageContent>
	);
}
