import type { RouterOutputs } from "@api/trpc/types";
import { useGroupedMessages } from "@cossistant/next/hooks";
import {
	ConversationTimelineContainer,
	DaySeparator,
	DaySeparatorLabel,
	DaySeparatorLine,
	ConversationTimeline as PrimitiveConversationTimeline,
} from "@cossistant/next/primitives";
import { useConversationTyping } from "@cossistant/react";

import type { AvailableAIAgent } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { ConversationSeen } from "@cossistant/types/schemas";
import { AnimatePresence } from "motion/react";
import type { RefObject } from "react";
import { memo, useEffect, useMemo, useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import type { ConversationHeader } from "@/contexts/inboxes";
import { useVisitorPresenceById } from "@/contexts/visitor-presence";
import { useWebsite } from "@/contexts/website";
import { useConversationDeveloperMode } from "@/hooks/use-conversation-developer-mode";
import { useDashboardTypingSound } from "@/hooks/use-dashboard-typing-sound";
import { useSoundPreferences } from "@/hooks/use-sound-preferences";
import { extractEventPart } from "@/lib/timeline-events";
import { shouldDisplayToolTimelineItem } from "@/lib/tool-timeline-visibility";
import { cn } from "@/lib/utils";
import { getVisitorNameWithFallback } from "@/lib/visitors";
import { ConversationEvent } from "./event";
import { TimelineActivityGroup } from "./timeline-activity-group";
import { TimelineMessageGroup } from "./timeline-message-group";
import { ToolCall } from "./tool-call";
import { TypingIndicator, type TypingParticipant } from "./typing-indicator";

const EMPTY_TIMELINE_ITEMS: TimelineItem[] = [];
const EMPTY_TEAM_MEMBERS: RouterOutputs["user"]["getWebsiteMembers"] = [];
const EMPTY_AVAILABLE_AI_AGENTS: AvailableAIAgent[] = [];
const EMPTY_SEEN_DATA: ConversationSeen[] = [];

type ConversationTimelineListProps = {
	ref?: React.RefObject<HTMLDivElement | null>;
	items: TimelineItem[];
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	availableAIAgents: AvailableAIAgent[];
	seenData?: ConversationSeen[];
	visitor: ConversationHeader["visitor"];
	currentUserId: string;
	conversationId: string;
	className?: string;
	onFetchMoreIfNeeded?: () => void;
	/** Height of the input/escalation panel for dynamic bottom padding */
	inputHeight?: number;
};

function StandaloneToolAvatar({
	item,
	teamMembers,
	visitor,
}: {
	item: TimelineItem;
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	visitor: ConversationHeader["visitor"];
}) {
	if (item.userId) {
		const member = teamMembers.find((m) => m.id === item.userId);
		return (
			<Avatar
				className="size-6"
				fallbackName={member?.name || "Team"}
				url={member?.image}
			/>
		);
	}
	if (item.aiAgentId) {
		return (
			<div className="flex size-6 shrink-0 items-center justify-center">
				<Logo className="size-5 text-primary/90" />
			</div>
		);
	}
	const visitorName = getVisitorNameWithFallback(visitor);
	return (
		<Avatar
			className="size-6"
			fallbackName={visitorName}
			url={visitor?.contact?.image}
		/>
	);
}

function ConversationTimelineListComponent({
	ref,
	items: timelineItems = EMPTY_TIMELINE_ITEMS,
	teamMembers = EMPTY_TEAM_MEMBERS,
	availableAIAgents = EMPTY_AVAILABLE_AI_AGENTS,
	seenData = EMPTY_SEEN_DATA,
	currentUserId,
	conversationId,
	className,
	onFetchMoreIfNeeded,
	visitor,
	inputHeight = 80,
}: ConversationTimelineListProps) {
	const fallbackRef = useRef<HTMLDivElement | null>(null);
	const messageListRef =
		(ref as RefObject<HTMLDivElement | null> | undefined) ?? fallbackRef;

	const website = useWebsite();
	const { typingEnabled } = useSoundPreferences({
		websiteSlug: website.slug,
	});

	const isDeveloperModeEnabled = useConversationDeveloperMode(
		(state) => state.isDeveloperModeEnabled
	);

	// Filter out non-visible tool items BEFORE grouping so they don't break
	// message groups. Without this, invisible internal tool calls (e.g. AI
	// decision logs) interleaved between messages from the same sender cause
	// the grouping algorithm to flush and split what should be a single group.
	const visibleTimelineItems = useMemo(() => {
		if (isDeveloperModeEnabled) {
			return timelineItems;
		}

		return timelineItems.filter(
			(item) =>
				item.type !== "tool" ||
				shouldDisplayToolTimelineItem(item, {
					includeInternalLogs: false,
				})
		);
	}, [timelineItems, isDeveloperModeEnabled]);

	const {
		items,
		lastReadMessageMap,
		getLastReadMessageId,
		isMessageSeenByViewer,
	} = useGroupedMessages({
		items: visibleTimelineItems,
		seenData,
		currentViewerId: currentUserId,
	});

	const typingEntries = useConversationTyping(conversationId, {
		excludeUserId: currentUserId,
	});

	const visitorPresence = useVisitorPresenceById(visitor?.id);

	const availableHumanAgents = useMemo(
		() =>
			teamMembers.map((member) => ({
				id: member.id,
				name: member.name ?? member.email?.split("@")[0] ?? "Unknown member",
				image: member.image,
				lastSeenAt: member.lastSeenAt,
			})),
		[teamMembers]
	);

	const activeTypingEntities = useMemo(
		() =>
			typingEntries
				.map((entry): TypingParticipant | null => {
					if (entry.actorType === "visitor") {
						return {
							id: entry.actorId,
							type: "visitor" as const,
							preview: entry.preview,
						};
					}

					if (entry.actorType === "ai_agent") {
						return {
							id: entry.actorId,
							type: "ai" as const,
							preview: entry.preview,
						};
					}

					return null;
				})
				.filter(
					(participant): participant is TypingParticipant =>
						participant !== null
				),
		[typingEntries]
	);

	// Play typing sound when someone is typing
	useDashboardTypingSound(activeTypingEntities.length > 0, typingEnabled);

	useEffect(() => {
		if (!messageListRef.current || activeTypingEntities.length === 0) {
			return;
		}

		messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
	}, [activeTypingEntities, messageListRef]);

	return (
		<PrimitiveConversationTimeline
			autoScroll={true}
			className={cn(
				"overflow-y-scroll pt-20",
				"scrollbar-thin scrollbar-thumb-background-300 scrollbar-track-fd-overlay",
				"h-full w-full",
				className
			)}
			id="conversation-timeline"
			items={timelineItems}
			onScrollStart={onFetchMoreIfNeeded}
			ref={ref ?? messageListRef}
			style={{
				paddingBottom: `${inputHeight + 40}px`,
			}}
		>
			<div className="mx-auto pr-4 pl-6 xl:max-w-xl 2xl:max-w-2xl">
				<ConversationTimelineContainer className="flex min-h-full w-full flex-col gap-5">
					<AnimatePresence initial={false} mode="popLayout">
						{items.map((item, index) => {
							if (item.type === "day_separator") {
								// Render day separator using the primitive
								return (
									<DaySeparator
										className="flex items-center gap-4 py-4"
										date={item.date}
										dateString={item.dateString}
										key={`day-separator-${item.dateString}`}
									>
										{({ formattedDate }) => (
											<>
												<DaySeparatorLine className="h-px flex-1 bg-border/50" />
												<DaySeparatorLabel
													className="text-muted-foreground/70 text-xs"
													formattedDate={formattedDate}
												/>
												<DaySeparatorLine className="h-px flex-1 bg-border/50" />
											</>
										)}
									</DaySeparator>
								);
							}

							if (item.type === "timeline_event") {
								// Extract event data from parts
								const eventPart = extractEventPart(item.item);

								// Only render if we have valid event data
								if (!eventPart) {
									return null;
								}

								return (
									<ConversationEvent
										availableAIAgents={availableAIAgents}
										availableHumanAgents={availableHumanAgents}
										createdAt={item.item.createdAt}
										event={eventPart}
										key={item.item.id || `timeline-event-${index}`}
										visitor={visitor}
									/>
								);
							}

							if (item.type === "timeline_tool") {
								const timelineItem = item.item;
								if (
									!shouldDisplayToolTimelineItem(timelineItem, {
										includeInternalLogs: isDeveloperModeEnabled,
									})
								) {
									return null;
								}
								const key = timelineItem.id ?? `timeline-tool-${index}`;

								return (
									<div className="flex w-full flex-row gap-2" key={key}>
										<div className="flex shrink-0 flex-col justify-start pt-0.5">
											<StandaloneToolAvatar
												item={timelineItem}
												teamMembers={teamMembers}
												visitor={visitor}
											/>
										</div>
										<div className="min-w-0 flex-1">
											<ToolCall
												item={timelineItem}
												mode={isDeveloperModeEnabled ? "developer" : "default"}
												showIcon={false}
											/>
										</div>
									</div>
								);
							}

							if (item.type === "activity_group") {
								const activityGroupKey =
									item.firstItemId ||
									item.items[0]?.id ||
									`activity-group-${index}`;

								return (
									<TimelineActivityGroup
										availableAIAgents={availableAIAgents}
										currentUserId={currentUserId}
										group={item}
										isDeveloperModeEnabled={isDeveloperModeEnabled}
										key={activityGroupKey}
										teamMembers={teamMembers}
										visitor={visitor}
									/>
								);
							}

							// Use first timeline item ID as stable key
							const groupKey = item.items?.[0]?.id || `group-${index}`;

							return (
								<TimelineMessageGroup
									availableAIAgents={availableAIAgents}
									currentUserId={currentUserId}
									items={item.items || []}
									key={groupKey}
									lastReadMessageIds={lastReadMessageMap}
									seenData={seenData}
									teamMembers={teamMembers}
									visitor={visitor}
									visitorPresence={visitorPresence}
								/>
							);
						})}
					</AnimatePresence>
					{activeTypingEntities.length > 0 && (
						<TypingIndicator
							activeTypingEntities={activeTypingEntities}
							availableAIAgents={availableAIAgents}
							availableHumanAgents={availableHumanAgents}
							className="mt-2"
							visitor={visitor}
							visitorPresence={visitorPresence}
						/>
					)}
				</ConversationTimelineContainer>
			</div>
		</PrimitiveConversationTimeline>
	);
}

const areConversationTimelinePropsEqual = (
	prev: ConversationTimelineListProps,
	next: ConversationTimelineListProps
) =>
	prev.ref === next.ref &&
	prev.items === next.items &&
	prev.teamMembers === next.teamMembers &&
	prev.availableAIAgents === next.availableAIAgents &&
	prev.seenData === next.seenData &&
	prev.currentUserId === next.currentUserId &&
	prev.conversationId === next.conversationId &&
	prev.className === next.className &&
	prev.onFetchMoreIfNeeded === next.onFetchMoreIfNeeded &&
	prev.visitor === next.visitor &&
	prev.inputHeight === next.inputHeight;

export const ConversationTimelineList = memo(
	ConversationTimelineListComponent,
	areConversationTimelinePropsEqual
);

ConversationTimelineList.displayName = "ConversationTimelineList";
