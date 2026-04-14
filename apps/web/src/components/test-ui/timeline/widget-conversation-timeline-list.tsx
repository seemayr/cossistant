"use client";

import { useGroupedMessages } from "@cossistant/react/internal/hooks";
import {
	ConversationTimelineContainer,
	DaySeparator,
	DaySeparatorLabel,
	DaySeparatorLine,
	ConversationTimeline as PrimitiveConversationTimeline,
} from "@cossistant/react/primitives";
import { ConversationEvent } from "@cossistant/react/support/components/conversation-event";
import { TimelineActivityGroup } from "@cossistant/react/support/components/timeline-activity-group";
import { TimelineMessageGroup } from "@cossistant/react/support/components/timeline-message-group";
import { resolveConversationTimelineToolComponent } from "@cossistant/react/support/components/timeline-tool-registry";
import type { ConversationTimelineTools } from "@cossistant/react/support/components/timeline-tool-types";
import { TypingIndicator } from "@cossistant/react/support/components/typing-indicator";
import type { AvailableAIAgent, AvailableHumanAgent } from "@cossistant/types";
import type {
	TimelineItem,
	TimelinePartEvent,
} from "@cossistant/types/api/timeline-item";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

export type TestWidgetTypingActor = {
	conversationId: string;
	actorId: string;
	actorType: "team_member" | "ai";
	preview: string | null;
};

function extractEventPart(item: TimelineItem): TimelinePartEvent | null {
	if (item.type !== "event") {
		return null;
	}

	return (
		item.parts.find(
			(part): part is TimelinePartEvent => part.type === "event"
		) ?? null
	);
}

type TestWidgetConversationTimelineListProps = {
	conversationId: string;
	items: TimelineItem[];
	className?: string;
	availableAIAgents: AvailableAIAgent[];
	availableHumanAgents: AvailableHumanAgent[];
	currentVisitorId?: string;
	typingActors?: TestWidgetTypingActor[];
	tools?: ConversationTimelineTools;
};

export function TestWidgetConversationTimelineList({
	conversationId,
	items: timelineItems,
	className,
	availableAIAgents,
	availableHumanAgents,
	currentVisitorId,
	typingActors = [],
	tools,
}: TestWidgetConversationTimelineListProps) {
	const messageListRef = useRef<HTMLDivElement | null>(null);
	const groupedMessages = useGroupedMessages({
		items: timelineItems,
		seenData: [],
		currentViewerId: currentVisitorId,
	});

	const typingParticipants = useMemo(
		() =>
			typingActors
				.filter((actor) => actor.actorId !== currentVisitorId)
				.map((actor) => ({
					id: actor.actorId,
					type: actor.actorType,
				})),
		[currentVisitorId, typingActors]
	);

	useEffect(() => {
		if (!messageListRef.current || typingParticipants.length === 0) {
			return;
		}

		messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
	}, [typingParticipants.length]);

	return (
		<PrimitiveConversationTimeline
			autoScroll={true}
			className={cn(
				"h-full w-full overflow-y-auto overflow-x-hidden",
				className
			)}
			id="test-widget-conversation-timeline"
			items={timelineItems}
			ref={messageListRef}
			style={{ scrollbarGutter: "stable" }}
		>
			<ConversationTimelineContainer className="flex min-h-full w-full flex-col gap-5 px-4 py-6">
				{groupedMessages.items.map((item, index) => {
					if (item.type === "day_separator") {
						return (
							<DaySeparator
								className="flex items-center justify-center py-2"
								date={item.date}
								dateString={item.dateString}
								key={`day-separator-${item.dateString}`}
							>
								{({ formattedDate }) => (
									<>
										<DaySeparatorLine className="flex-1 border-co-border/40 border-t" />
										<DaySeparatorLabel
											className="px-3 text-co-muted-foreground/70 text-xs"
											formattedDate={formattedDate}
										/>
										<DaySeparatorLine className="flex-1 border-co-border/40 border-t" />
									</>
								)}
							</DaySeparator>
						);
					}

					if (item.type === "timeline_event") {
						const eventPart = extractEventPart(item.item);
						if (!eventPart) {
							return null;
						}

						return (
							<ConversationEvent
								availableAIAgents={availableAIAgents}
								availableHumanAgents={availableHumanAgents}
								createdAt={item.item.createdAt}
								event={eventPart}
								key={item.item.id ?? `event-${index}`}
							/>
						);
					}

					if (item.type === "timeline_tool") {
						const toolName = item.tool ?? item.item.tool ?? item.item.type;
						const ToolComponent = resolveConversationTimelineToolComponent(
							toolName,
							tools
						);

						if (!ToolComponent) {
							return null;
						}

						return (
							<div
								className="w-full"
								key={item.item.id ?? `${toolName}-${index}`}
							>
								<ToolComponent
									conversationId={conversationId}
									item={item.item}
									showTerminalIndicator={false}
								/>
							</div>
						);
					}

					if (item.type === "activity_group") {
						return (
							<TimelineActivityGroup
								availableAIAgents={availableAIAgents}
								availableHumanAgents={availableHumanAgents}
								conversationId={conversationId}
								currentVisitorId={currentVisitorId}
								group={item}
								key={
									item.firstItemId ?? item.items[0]?.id ?? `activity-${index}`
								}
								tools={tools}
							/>
						);
					}

					return (
						<TimelineMessageGroup
							availableAIAgents={availableAIAgents}
							availableHumanAgents={availableHumanAgents}
							currentVisitorId={currentVisitorId}
							items={item.items}
							key={item.lastMessageId ?? item.items[0]?.id ?? `group-${index}`}
							lastReadMessageIds={groupedMessages.lastReadMessageMap}
							seenData={[]}
						/>
					);
				})}
				{typingParticipants.length > 0 ? (
					<div data-test-ui-typing-surface="widget">
						<TypingIndicator
							availableAIAgents={availableAIAgents}
							availableHumanAgents={availableHumanAgents}
							className="mt-2"
							participants={typingParticipants}
						/>
					</div>
				) : null}
			</ConversationTimelineContainer>
		</PrimitiveConversationTimeline>
	);
}
