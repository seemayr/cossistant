import type { RouterOutputs } from "@api/trpc/types";
import type { GroupedActivity } from "@cossistant/next/hooks";
import {
	TimelineItemGroup as PrimitiveTimelineItemGroup,
	TimelineItemGroupAvatar,
	TimelineItemGroupContent,
} from "@cossistant/next/primitives";
import type { AvailableAIAgent } from "@cossistant/types";
import { SenderType } from "@cossistant/types";
import type {
	TimelineItem,
	TimelinePartEvent,
} from "@cossistant/types/api/timeline-item";
import { useMemo } from "react";
import type { ConversationHeader } from "@/contexts/inboxes";
import { extractEventPart } from "@/lib/timeline-events";
import { isCustomerFacingToolTimelineItem } from "@/lib/tool-timeline-visibility";
import type { PublicActivityGroupRenderItem } from "./dashboard-timeline-render-items";
import { ConversationEvent } from "./event";
import {
	resolveDashboardTimelineSender,
	TimelineGroupSenderAvatar,
} from "./timeline-group-sender";
import { ToolCall } from "./tool-call";

type TimelineActivityGroupProps = {
	group: GroupedActivity | PublicActivityGroupRenderItem;
	availableAIAgents: AvailableAIAgent[];
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	currentUserId?: string;
	visitor: ConversationHeader["visitor"];
};

type ActivityRow =
	| {
			type: "event";
			key: string;
			item: TimelineItem;
			event: TimelinePartEvent;
	  }
	| {
			type: "tool";
			key: string;
			item: TimelineItem;
	  };

export function TimelineActivityGroup({
	group,
	availableAIAgents,
	teamMembers,
	currentUserId,
	visitor,
}: TimelineActivityGroupProps) {
	const availableHumanAgents = useMemo(
		() =>
			teamMembers.map((member) => {
				const memberDisplay = resolveDashboardTimelineSender({
					availableAIAgents,
					senderId: member.id,
					senderType: SenderType.TEAM_MEMBER,
					teamMembers,
					visitor,
				});

				return {
					id: member.id,
					name: memberDisplay.senderDisplayName,
					image: member.image,
					lastSeenAt: member.lastSeenAt,
				};
			}),
		[availableAIAgents, teamMembers, visitor]
	);

	const { senderDisplayName } = resolveDashboardTimelineSender({
		senderId: group.senderId,
		senderType: group.senderType,
		teamMembers,
		availableAIAgents,
		visitor,
	});

	const activityRows = useMemo(() => {
		const rows: ActivityRow[] = [];

		for (let index = 0; index < group.items.length; index++) {
			const item = group.items[index];
			if (!item) {
				continue;
			}

			if (item.type === "event") {
				const eventPart = extractEventPart(item);
				if (!eventPart) {
					continue;
				}

				rows.push({
					type: "event",
					key: item.id ?? `activity-event-${item.createdAt}-${index}`,
					item,
					event: eventPart,
				});
				continue;
			}

			if (item.type === "tool") {
				if (!isCustomerFacingToolTimelineItem(item)) {
					continue;
				}

				rows.push({
					type: "tool",
					key: item.id ?? `activity-tool-${item.createdAt}-${index}`,
					item,
				});
			}
		}

		return rows;
	}, [group.items]);

	if (activityRows.length === 0) {
		return null;
	}
	const hasToolRows = activityRows.some((row) => row.type === "tool");
	const showSenderLabel = hasToolRows;

	return (
		<PrimitiveTimelineItemGroup
			items={group.items}
			viewerId={currentUserId}
			viewerType={SenderType.TEAM_MEMBER}
		>
			{() => (
				<div className="flex w-full flex-row gap-2">
					<TimelineItemGroupAvatar className="flex shrink-0 flex-col justify-start pt-0.5">
						<TimelineGroupSenderAvatar
							availableAIAgents={availableAIAgents}
							senderId={group.senderId}
							senderType={group.senderType}
							teamMembers={teamMembers}
							visitor={visitor}
						/>
					</TimelineItemGroupAvatar>

					<TimelineItemGroupContent className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
						<div className="flex w-full min-w-0 flex-col gap-1">
							{showSenderLabel ? (
								<div className="px-1 text-muted-foreground text-xs">
									{senderDisplayName}
								</div>
							) : null}
							{activityRows.map((row) => (
								<div className="w-full min-w-0" key={row.key}>
									{row.type === "event" ? (
										<ConversationEvent
											availableAIAgents={availableAIAgents}
											availableHumanAgents={availableHumanAgents}
											createdAt={row.item.createdAt}
											event={row.event}
											showIcon={false}
											visitor={visitor}
										/>
									) : (
										<ToolCall
											item={row.item}
											mode="default"
											showIcon={false}
											showTerminalIndicator={true}
										/>
									)}
								</div>
							))}
						</div>
					</TimelineItemGroupContent>
				</div>
			)}
		</PrimitiveTimelineItemGroup>
	);
}
