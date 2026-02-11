/** biome-ignore-all lint/correctness/useHookAtTopLevel: ok here */
"use client";

import { FILE_INPUT_ACCEPT } from "@cossistant/core";
import { useMultimodalInput } from "@cossistant/react/hooks/private/use-multimodal-input";
import { CONVERSATION_AUTO_SEEN_DELAY_MS } from "@cossistant/react/hooks/use-conversation-auto-seen";
import { useWindowVisibilityFocus } from "@cossistant/react/hooks/use-window-visibility-focus";
import type { AvailableAIAgent } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { ConversationProps } from "@/components/conversation";
import { Conversation } from "@/components/conversation";
import type { ConversationHeaderNavigationProps } from "@/components/conversation/header/navigation";
import type { MessageVisibility } from "@/components/conversation/multimodal-input";
import { ButtonWithPaywall } from "@/components/plan/button-with-paywall";
import Icon from "@/components/ui/icons";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { useInboxes } from "@/contexts/inboxes";
import { useWebsiteMembers } from "@/contexts/website";
import { useConversationActions } from "@/data/use-conversation-actions";
import { useConversationTimelineItems } from "@/data/use-conversation-timeline-items";
import { usePrefetchConversationData } from "@/data/use-prefetch-conversation-data";
import { useVisitor } from "@/data/use-visitor";
import { useAgentTypingReporter } from "@/hooks/use-agent-typing-reporter";
import { useConversationSeen } from "@/hooks/use-conversation-seen";
import { useDashboardNewMessageSound } from "@/hooks/use-dashboard-new-message-sound";
import { useSendConversationMessage } from "@/hooks/use-send-conversation-message";
import { useSidebar } from "@/hooks/use-sidebars";
import { useSoundPreferences } from "@/hooks/use-sound-preferences";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const MESSAGES_PAGE_LIMIT = 50;

type ConversationPaneProps = {
	conversationId: string;
	visitorId: string;
	websiteSlug: string;
	currentUserId: string;
};

export function ConversationPane({
	conversationId,
	visitorId,
	websiteSlug,
	currentUserId,
}: ConversationPaneProps) {
	const trpc = useTRPC();
	const { newMessageEnabled } = useSoundPreferences({ websiteSlug });

	// Fetch AI agent for the website to display proper names in events
	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({ websiteSlug })
	);

	// Build availableAIAgents array from fetched AI agent
	const availableAIAgents = useMemo<AvailableAIAgent[]>(() => {
		if (!aiAgent) {
			return [];
		}
		return [
			{
				id: aiAgent.id,
				name: aiAgent.name,
				image:
					"image" in aiAgent
						? ((aiAgent as { image?: string | null }).image ?? null)
						: null,
			},
		];
	}, [aiAgent]);
	const playNewMessageSound = useDashboardNewMessageSound(newMessageEnabled);
	const previousItemsRef = useRef<readonly TimelineItem[]>([]);

	const [messageVisibility, setMessageVisibility] =
		useState<MessageVisibility>("public");

	// Track markdown-formatted message for submission (with mentions converted)
	const markdownMessageRef = useRef<string>("");

	const {
		submit: submitConversationMessage,
		isUploading,
		uploadProgress,
	} = useSendConversationMessage({
		conversationId,
		websiteSlug,
		currentUserId,
		pageLimit: MESSAGES_PAGE_LIMIT,
	});

	const {
		handleInputChange: handleTypingChange,
		handleSubmit: handleTypingSubmit,
		stop: stopTyping,
	} = useAgentTypingReporter({
		conversationId,
		visitorId,
		websiteSlug,
	});

	const {
		message,
		files,
		isSubmitting,
		error,
		setMessage,
		addFiles,
		removeFile,
		submit,
	} = useMultimodalInput({
		onSubmit: async (payload) => {
			handleTypingSubmit();
			// Use the markdown-formatted message (with mentions converted)
			await submitConversationMessage({
				...payload,
				message: markdownMessageRef.current || payload.message,
				visibility: messageVisibility,
			});
			// Clear the markdown ref after submit
			markdownMessageRef.current = "";
		},
		onError: (submitError) => {
			console.error("Failed to send message", submitError);
		},
	});

	const handleMessageChange = useCallback(
		(value: string) => {
			setMessage(value);
			handleTypingChange(value);
		},
		[handleTypingChange, setMessage]
	);

	// Handle markdown-formatted value from MultimodalInput (with mentions converted)
	const handleMarkdownChange = useCallback((markdownValue: string) => {
		markdownMessageRef.current = markdownValue;
	}, []);

	useEffect(
		() => () => {
			stopTyping();
		},
		[stopTyping]
	);

	const members = useWebsiteMembers();

	const {
		selectedConversation,
		previousConversation,
		nextConversation,
		navigateToPreviousConversation,
		navigateToNextConversation,
		navigateAwayIfNeeded,
		goBack,
		statusCounts,
		selectedConversationIndex,
		conversations,
	} = useInboxes();

	const { prefetchConversation } = usePrefetchConversationData();

	// Proactively prefetch next and previous conversations for instant navigation
	useEffect(() => {
		if (nextConversation) {
			prefetchConversation({
				websiteSlug,
				conversationId: nextConversation.id,
				visitorId: nextConversation.visitorId,
			});
		}
	}, [nextConversation, prefetchConversation, websiteSlug]);

	useEffect(() => {
		if (previousConversation) {
			prefetchConversation({
				websiteSlug,
				conversationId: previousConversation.id,
				visitorId: previousConversation.visitorId,
			});
		}
	}, [previousConversation, prefetchConversation, websiteSlug]);

	const { open: isRightSidebarOpen, toggle: toggleRightSidebar } = useSidebar({
		position: "right",
	});
	const { open: isLeftSidebarOpen, toggle: toggleLeftSidebar } = useSidebar({
		position: "left",
	});

	const handleNavigateAway = useCallback(
		() => navigateAwayIfNeeded(conversationId),
		[navigateAwayIfNeeded, conversationId]
	);

	const { markRead, joinEscalation, pendingAction } = useConversationActions({
		conversationId,
		visitorId,
		onNavigateAway: handleNavigateAway,
	});

	const lastMarkedMessageIdRef = useRef<string | null>(null);
	const markSeenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { isPageVisible, hasWindowFocus } = useWindowVisibilityFocus();

	const { items, fetchNextPage, hasNextPage } = useConversationTimelineItems({
		conversationId,
		websiteSlug,
		options: { limit: MESSAGES_PAGE_LIMIT },
	});

	const { visitor, isLoading: isVisitorLoading } = useVisitor({
		visitorId,
		websiteSlug,
	});

	const seenData = useConversationSeen(conversationId, {
		initialData: selectedConversation?.seenData ?? [],
	});

	const lastMessage = useMemo(() => {
		for (let index = items.length - 1; index >= 0; index -= 1) {
			const candidate = items[index];
			if (candidate?.type === "message") {
				return candidate;
			}
		}
		return null;
	}, [items]);

	// Play sound when new messages arrive from others (not current user)
	useEffect(() => {
		const currentItems = items;
		const previousItems = previousItemsRef.current;

		// Check if there are new items
		if (currentItems.length > previousItems.length) {
			// Find the new items
			const newItems = currentItems.slice(previousItems.length);

			// Play sound only if new message is from someone else (not current user)
			for (const item of newItems) {
				if (item.type === "message" && item.userId !== currentUserId) {
					playNewMessageSound();
					break; // Only play once per batch
				}
			}
		}

		// Update the ref
		previousItemsRef.current = currentItems as readonly TimelineItem[];
	}, [items, currentUserId, playNewMessageSound]);

	useEffect(() => {
		if (markSeenTimeoutRef.current) {
			clearTimeout(markSeenTimeoutRef.current);
			markSeenTimeoutRef.current = null;
		}

		if (!lastMessage) {
			return;
		}

		if (!selectedConversation || selectedConversation.id !== conversationId) {
			lastMarkedMessageIdRef.current = null;
			return;
		}

		if (!(isPageVisible && hasWindowFocus)) {
			return;
		}

		if (lastMessage.userId === currentUserId) {
			lastMarkedMessageIdRef.current = lastMessage.id || null;
			return;
		}

		const lastMessageCreatedAt = new Date(lastMessage.createdAt);
		const lastSeenAt = selectedConversation.lastSeenAt
			? new Date(selectedConversation.lastSeenAt)
			: null;

		if (lastSeenAt && lastSeenAt >= lastMessageCreatedAt) {
			lastMarkedMessageIdRef.current = lastMessage.id || null;
			return;
		}

		if (lastMarkedMessageIdRef.current === (lastMessage.id || null)) {
			return;
		}

		const pendingMessageId = lastMessage.id || null;

		markSeenTimeoutRef.current = setTimeout(() => {
			const isVisibleNow =
				typeof document !== "undefined" ? !document.hidden : true;
			const hasFocusNow =
				typeof document !== "undefined" &&
				typeof document.hasFocus === "function"
					? document.hasFocus()
					: true;

			if (!(isVisibleNow && hasFocusNow)) {
				markSeenTimeoutRef.current = null;
				return;
			}

			// Check if conversation timeline is scrolled near bottom
			const timelineElement =
				typeof document !== "undefined"
					? document.getElementById("conversation-timeline")
					: null;
			const isNearBottom = timelineElement
				? timelineElement.scrollHeight -
						timelineElement.scrollTop -
						timelineElement.clientHeight <=
					32
				: true; // Default to true if element not found (SSR or unmounted)

			if (!isNearBottom) {
				markSeenTimeoutRef.current = null;
				return;
			}

			markRead()
				.then(() => {
					lastMarkedMessageIdRef.current = pendingMessageId;
				})
				.catch(() => {
					// no-op: we'll retry on next render if needed
				})
				.finally(() => {
					markSeenTimeoutRef.current = null;
				});
		}, CONVERSATION_AUTO_SEEN_DELAY_MS);

		return () => {
			if (markSeenTimeoutRef.current) {
				clearTimeout(markSeenTimeoutRef.current);
				markSeenTimeoutRef.current = null;
			}
		};
	}, [
		conversationId,
		currentUserId,
		hasWindowFocus,
		isPageVisible,
		lastMessage,
		markRead,
		selectedConversation,
	]);

	useHotkeys(
		["escape", "j", "k"],
		(_, handler) => {
			switch (handler.keys?.join("")) {
				case "escape":
					goBack();
					break;
				case "j":
					if (previousConversation) {
						navigateToPreviousConversation();
					}
					break;
				case "k":
					if (nextConversation) {
						navigateToNextConversation();
					}
					break;
				default:
					break;
			}
		},
		{
			preventDefault: true,
			enableOnContentEditable: false,
			enableOnFormTags: false,
		}
	);

	const onFetchMoreIfNeeded = useCallback(async () => {
		if (hasNextPage) {
			await fetchNextPage();
		}
	}, [fetchNextPage, hasNextPage]);

	if (!visitor) {
		return null;
	}

	if (!selectedConversation) {
		return null;
	}

	const navigationProps: ConversationHeaderNavigationProps = {
		onGoBack: goBack,
		onNavigateToPrevious: navigateToPreviousConversation,
		onNavigateToNext: navigateToNextConversation,
		hasPreviousConversation: Boolean(previousConversation),
		hasNextConversation: Boolean(nextConversation),
		selectedConversationIndex,
		totalOpenConversations: conversations.length,
	};

	const conversationProps: ConversationProps = {
		header: {
			isLeftSidebarOpen,
			isRightSidebarOpen,
			onToggleLeftSidebar: toggleLeftSidebar,
			onToggleRightSidebar: toggleRightSidebar,
			navigation: navigationProps,
			conversationId,
			visitorId,
			status: selectedConversation?.status,
			deletedAt: selectedConversation?.deletedAt ?? null,
			visitorIsBlocked: selectedConversation?.visitor.isBlocked ?? null,
		},
		timeline: {
			availableAIAgents,
			conversationId,
			currentUserId,
			items: items as TimelineItem[],
			onFetchMoreIfNeeded,
			seenData,
			teamMembers: members,
			visitor,
		},
		input: {
			allowedFileTypes: FILE_INPUT_ACCEPT,
			error,
			files,
			isSubmitting,
			isUploading,
			uploadProgress,
			maxFileSize: 10 * 1024 * 1024,
			maxFiles: 2,
			onChange: handleMessageChange,
			onMarkdownChange: handleMarkdownChange,
			onFileSelect: addFiles,
			onRemoveFile: removeFile,
			onSubmit: submit,
			placeholder: "Type your message...",
			value: message,
			visibility: messageVisibility,
			onVisibilityChange: setMessageVisibility,
			renderAttachButton: ({ triggerFileInput, disabled }) => (
				<TooltipOnHover content="Attach files">
					<ButtonWithPaywall
						className={cn(files.length >= 2 && "opacity-50")}
						disabled={disabled}
						featureKey="dashboard-file-sharing"
						onClick={triggerFileInput}
						size="icon"
						type="button"
						variant="ghost"
						websiteSlug={websiteSlug}
					>
						<Icon className="h-4 w-4" name="attachment" />
					</ButtonWithPaywall>
				</TooltipOnHover>
			),
			// Enable mentions for AI agent, team members, and visitor
			mentionConfig: {
				aiAgent: aiAgent
					? {
							id: aiAgent.id,
							name: aiAgent.name,
							isActive: aiAgent.isActive,
							image:
								"image" in aiAgent
									? ((aiAgent as { image?: string | null }).image ?? null)
									: null,
						}
					: null,
				teamMembers: members.filter((m): m is typeof m & { name: string } =>
					Boolean(m.name)
				),
				visitor,
			},
		},
		visitorSidebar: {
			conversationId,
			visitorId,
			isLoading: isVisitorLoading,
			visitor,
		},
		// Show escalation action if escalated but not yet handled
		escalation:
			selectedConversation.escalatedAt &&
			!selectedConversation.escalationHandledAt
				? {
						reason:
							selectedConversation.escalationReason ??
							"Human assistance requested",
						onJoin: joinEscalation,
						isJoining: pendingAction.joinEscalation,
					}
				: null,
	};

	return <Conversation {...conversationProps} />;
}
