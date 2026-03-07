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
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { generateTreePrefix } from "@/components/web-sources/utils";
import type { ConversationHeader } from "@/contexts/inboxes";
import { resolveDashboardHumanAgentDisplay } from "@/lib/human-agent-display";
import { extractEventPart } from "@/lib/timeline-events";
import { shouldDisplayToolTimelineItem } from "@/lib/tool-timeline-visibility";
import { cn } from "@/lib/utils";
import { getVisitorNameWithFallback } from "@/lib/visitors";
import {
	renderEventActionIcon,
	renderToolActionIcon,
} from "./activity/action-icon-map";
import { ConversationEvent } from "./event";
import { ToolCall } from "./tool-call";

type TimelineActivityGroupProps = {
	group: GroupedActivity;
	availableAIAgents: AvailableAIAgent[];
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	currentUserId?: string;
	visitor: ConversationHeader["visitor"];
	isDeveloperModeEnabled: boolean;
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
			toolName: string | null;
	  };

type ToolState = "partial" | "result" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolState(value: unknown): value is ToolState {
	return value === "partial" || value === "result" || value === "error";
}

function getToolNameFromTimelineItem(item: TimelineItem): string | null {
	if (typeof item.tool === "string" && item.tool.length > 0) {
		return item.tool;
	}

	for (const part of item.parts) {
		if (
			typeof part === "object" &&
			part !== null &&
			"type" in part &&
			"toolName" in part &&
			typeof part.type === "string" &&
			part.type.startsWith("tool-") &&
			typeof part.toolName === "string"
		) {
			return part.toolName;
		}
	}

	return null;
}

function getToolStateFromTimelineItem(item: TimelineItem): ToolState {
	for (const part of item.parts) {
		if (!isRecord(part)) {
			continue;
		}

		const partRecord = part as Record<string, unknown>;
		const partType = partRecord.type;
		if (typeof partType !== "string" || !partType.startsWith("tool-")) {
			continue;
		}

		const partState = partRecord.state;
		return isToolState(partState) ? partState : "partial";
	}

	return "partial";
}

function getFallbackToolSummary(
	toolName: string | null,
	state: ToolState
): string {
	const label =
		typeof toolName === "string" && toolName.length > 0 ? toolName : "tool";

	if (state === "result") {
		return `Completed ${label}`;
	}

	if (state === "error") {
		return `Failed ${label}`;
	}

	return `Running ${label}`;
}

function getToolActionSummary(
	item: TimelineItem,
	toolName: string | null
): string {
	const text = typeof item.text === "string" ? item.text.trim() : "";
	if (text.length > 0) {
		return text;
	}

	return getFallbackToolSummary(toolName, getToolStateFromTimelineItem(item));
}

function formatTimestamp(createdAt: string): string {
	return new Date(createdAt).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function TimelineActivityGroup({
	group,
	availableAIAgents,
	teamMembers,
	currentUserId,
	visitor,
	isDeveloperModeEnabled,
}: TimelineActivityGroupProps) {
	const availableHumanAgents = useMemo(
		() =>
			teamMembers.map((member) => {
				const memberDisplay = resolveDashboardHumanAgentDisplay(member);

				return {
					id: member.id,
					name: memberDisplay.displayName,
					image: member.image,
					lastSeenAt: member.lastSeenAt,
				};
			}),
		[teamMembers]
	);

	const humanAgent = teamMembers.find((agent) => agent.id === group.senderId);
	const humanDisplay =
		group.senderType === SenderType.TEAM_MEMBER
			? resolveDashboardHumanAgentDisplay({
					id: humanAgent?.id ?? group.senderId ?? "unknown-member",
					name: humanAgent?.name ?? null,
				})
			: null;
	const aiAgent = availableAIAgents.find(
		(agent) => agent.id === group.senderId
	);
	const visitorName = getVisitorNameWithFallback(visitor);
	const senderDisplayName =
		group.senderType === SenderType.VISITOR
			? visitorName
			: group.senderType === SenderType.AI
				? aiAgent?.name || "AI Assistant"
				: (humanDisplay?.displayName ?? "Team member");

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
				if (
					!shouldDisplayToolTimelineItem(item, {
						includeInternalLogs: isDeveloperModeEnabled,
					})
				) {
					continue;
				}

				rows.push({
					type: "tool",
					key: item.id ?? `activity-tool-${item.createdAt}-${index}`,
					item,
					toolName: getToolNameFromTimelineItem(item),
				});
			}
		}

		return rows;
	}, [group.items, isDeveloperModeEnabled]);

	if (activityRows.length === 0) {
		return null;
	}
	const showTreeLayout = !isDeveloperModeEnabled && activityRows.length > 1;
	const showRowBullets = isDeveloperModeEnabled && activityRows.length > 1;
	const firstRow = activityRows[0];
	const singleToolRow =
		!isDeveloperModeEnabled &&
		activityRows.length === 1 &&
		firstRow?.type === "tool"
			? firstRow
			: null;

	return (
		<PrimitiveTimelineItemGroup
			items={group.items}
			viewerId={currentUserId}
			viewerType={SenderType.TEAM_MEMBER}
		>
			{({ isVisitor, isAI }) => (
				<div className="flex w-full flex-row gap-2">
					<TimelineItemGroupAvatar className="flex shrink-0 flex-col justify-start pt-0.5">
						{isVisitor ? (
							<Avatar
								className="size-6"
								fallbackName={visitorName}
								url={visitor?.contact?.image}
							/>
						) : isAI ? (
							<div className="flex size-6 shrink-0 items-center justify-center">
								<Logo className="size-5 text-primary/90" />
							</div>
						) : (
							<Avatar
								className="size-6"
								facehashSeed={humanDisplay?.facehashSeed}
								fallbackName={humanDisplay?.displayName ?? "Team member"}
								url={humanAgent?.image}
							/>
						)}
					</TimelineItemGroupAvatar>

					<TimelineItemGroupContent className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
						{singleToolRow ? (
							<div
								className="group/activity flex w-full min-w-0"
								data-activity-single-tool="true"
							>
								<div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground text-sm">
									<span className="break-words">
										{senderDisplayName}{" "}
										{getToolActionSummary(
											singleToolRow.item,
											singleToolRow.toolName
										)}
									</span>
									<time className="text-xs opacity-0 transition-opacity group-hover/activity:opacity-100">
										[{formatTimestamp(singleToolRow.item.createdAt)}]
									</time>
								</div>
							</div>
						) : (
							<div className="flex w-full min-w-0 flex-col gap-1">
								{showTreeLayout ? (
									<div className="px-1 text-muted-foreground text-xs">
										{senderDisplayName}
									</div>
								) : null}
								{activityRows.map((row, index) => (
									<div
										className={cn(
											"flex w-full min-w-0",
											showTreeLayout ? "items-stretch" : "items-start",
											showTreeLayout || showRowBullets ? "gap-2" : "gap-0"
										)}
										key={row.key}
									>
										{showTreeLayout ? (
											<div className="relative min-w-[2.25rem] shrink-0">
												<span
													className="block whitespace-pre font-mono text-muted-foreground/70 text-xs leading-6"
													data-activity-tree-prefix={row.type}
												>
													{generateTreePrefix({
														ancestorsAreLastChild: [],
														isLast: index === activityRows.length - 1,
													})}
												</span>
												{index < activityRows.length - 1 ? (
													<span
														className="-bottom-[1.05rem] pointer-events-none absolute top-[0.29rem] left-[0.3ch] w-px bg-muted-foreground"
														data-activity-tree-continuation="true"
													/>
												) : null}
											</div>
										) : showRowBullets ? (
											<span
												className="mt-[0.45rem] shrink-0"
												data-activity-bullet={row.type}
											>
												{row.type === "event"
													? renderEventActionIcon(row.event.eventType)
													: renderToolActionIcon(row.toolName)}
											</span>
										) : null}
										<div
											className={cn(
												"min-w-0",
												showTreeLayout || showRowBullets ? "flex-1" : "w-full"
											)}
										>
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
													mode={
														isDeveloperModeEnabled ? "developer" : "default"
													}
													showIcon={false}
												/>
											)}
										</div>
									</div>
								))}
							</div>
						)}
					</TimelineItemGroupContent>
				</div>
			)}
		</PrimitiveTimelineItemGroup>
	);
}
