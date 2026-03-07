import type { AvailableAIAgent, AvailableHumanAgent } from "@cossistant/types";
import { SenderType } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type React from "react";
import {
	TimelineItemGroup as PrimitiveTimelineItemGroup,
	TimelineItemGroupAvatar,
	TimelineItemGroupContent,
	TimelineItemGroupHeader,
	TimelineItemGroupSeenIndicator,
} from "../../primitives/timeline-item-group";
import { useSupportText } from "../text";
import { cn } from "../utils";
import { resolveSupportHumanAgentDisplay } from "../utils/human-agent-display";
import { Avatar } from "./avatar";
import { TimelineMessageItem } from "./timeline-message-item";

export type TimelineMessageGroupProps = {
	items: TimelineItem[];
	availableAIAgents: AvailableAIAgent[];
	availableHumanAgents: AvailableHumanAgent[];
	currentVisitorId?: string;
	seenByIds?: readonly string[];
	seenByNames?: readonly string[];
};

const EMPTY_SEEN_BY_IDS: readonly string[] = Object.freeze([]);
const EMPTY_SEEN_BY_NAMES: readonly string[] = Object.freeze([]);

export const TimelineMessageGroup: React.FC<TimelineMessageGroupProps> = ({
	items,
	availableAIAgents,
	availableHumanAgents,
	currentVisitorId,
	seenByIds = EMPTY_SEEN_BY_IDS,
	seenByNames = EMPTY_SEEN_BY_NAMES,
}) => {
	const text = useSupportText();
	// Get agent info for the sender
	const firstItem = items[0];
	const humanAgent = availableHumanAgents.find(
		(agent) => agent.id === firstItem?.userId
	);
	const aiAgent = availableAIAgents.find(
		(agent) => agent.id === firstItem?.aiAgentId
	);

	if (items.length === 0) {
		return null;
	}

	const humanDisplay = resolveSupportHumanAgentDisplay(
		humanAgent,
		text("common.fallbacks.supportTeam")
	);
	const hasSeenIndicator = seenByIds.length > 0;

	return (
		<PrimitiveTimelineItemGroup
			items={items}
			seenByIds={seenByIds}
			viewerId={currentVisitorId}
			viewerType={SenderType.VISITOR}
		>
			{({ isSentByViewer, isReceivedByViewer, isAI }) => (
				<div
					className={cn(
						"flex w-full gap-2",
						// Support widget POV: visitor messages are sent (right side)
						// Agent messages are received (left side)
						isSentByViewer && "flex-row-reverse",
						isReceivedByViewer && "flex-row"
					)}
				>
					{/* Avatar - only show for received messages (agents) */}
					{isReceivedByViewer && (
						<TimelineItemGroupAvatar className="flex flex-shrink-0 flex-col justify-end">
							{isAI ? (
								<Avatar
									className="size-6"
									image={aiAgent?.image}
									isAI
									name={aiAgent?.name || "AI Assistant"}
									showBackground={!!aiAgent?.image}
								/>
							) : (
								<Avatar
									className="size-6"
									facehashSeed={humanDisplay.facehashSeed}
									image={humanAgent?.image}
									name={humanDisplay.displayName}
								/>
							)}
						</TimelineItemGroupAvatar>
					)}

					<TimelineItemGroupContent
						className={cn(
							"flex min-w-0 flex-1 flex-col gap-1",
							isSentByViewer && "items-end"
						)}
					>
						{/* Header - show sender name for received messages (agents) */}
						{isReceivedByViewer && (
							<TimelineItemGroupHeader className="px-1 text-co-muted-foreground text-xs">
								{isAI
									? aiAgent?.name || "AI Assistant"
									: humanDisplay.displayName}
							</TimelineItemGroupHeader>
						)}

						{items.map((item, index) => (
							<div className="co-animate-slide-up-fade w-full" key={item.id}>
								<TimelineMessageItem
									isLast={index === items.length - 1}
									isSentByViewer={isSentByViewer}
									item={item}
								/>
							</div>
						))}

						{isSentByViewer && (
							<div className={cn("", hasSeenIndicator && "mt-2")}>
								<div className="min-h-[1.25rem]">
									{hasSeenIndicator && (
										<div className="co-animate-fade-in">
											<TimelineItemGroupSeenIndicator
												className="px-1 text-co-muted-foreground text-xs"
												seenByIds={seenByIds}
											>
												{() =>
													seenByNames.length > 0
														? `Seen by ${seenByNames.join(", ")}`
														: "Seen"
												}
											</TimelineItemGroupSeenIndicator>
										</div>
									)}
								</div>
							</div>
						)}
					</TimelineItemGroupContent>
				</div>
			)}
		</PrimitiveTimelineItemGroup>
	);
};

TimelineMessageGroup.displayName = "TimelineMessageGroup";
