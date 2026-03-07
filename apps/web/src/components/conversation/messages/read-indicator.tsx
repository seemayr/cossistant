import type { RouterOutputs } from "@api/trpc/types";
import { TimelineItemGroupReadIndicator } from "@cossistant/next/primitives";
import type { AvailableAIAgent } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { ConversationSeen } from "@cossistant/types/schemas";
import { format } from "date-fns";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { TooltipOnHover } from "@/components/ui/tooltip";
import type { ConversationHeader } from "@/contexts/inboxes";
import { resolveDashboardHumanAgentDisplay } from "@/lib/human-agent-display";
import { cn } from "@/lib/utils";
import { getVisitorNameWithFallback } from "@/lib/visitors";

type ReadIndicatorProps = {
	lastReadMessageIds: Map<string, string> | undefined;
	messageId: string;
	currentUserId: string | undefined;
	firstMessage: TimelineItem | undefined;
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	availableAIAgents: AvailableAIAgent[];
	visitor: ConversationHeader["visitor"];
	messages: TimelineItem[];
	isSentByViewer: boolean;
	/** Whether the message group is from a visitor (used for positioning) */
	isVisitor: boolean;
	/** Seen data for tooltip timestamps */
	seenData?: ConversationSeen[];
};

type ReaderInfo =
	| {
			id: string;
			type: "human";
			name: string | null;
			image: string | null;
			email: string | null;
			lastSeenAt?: string | null;
	  }
	| {
			id: string;
			type: "ai";
			name: string | null;
			lastSeenAt?: string | null;
	  }
	| {
			id: string;
			type: "visitor";
			name: string;
			image: string | undefined;
			lastSeenAt?: string | null;
	  };

function formatSeenTime(dateString: string | null | undefined): string {
	if (!dateString) {
		return "";
	}
	try {
		const date = new Date(dateString);
		return format(date, "MMM d 'at' h:mm a");
	} catch {
		return "";
	}
}

const isReaderInfo = (value: ReaderInfo | null): value is ReaderInfo =>
	value !== null;

export function ReadIndicator({
	lastReadMessageIds,
	messageId,
	currentUserId,
	firstMessage,
	teamMembers,
	availableAIAgents,
	visitor,
	messages,
	seenData = [],
}: ReadIndicatorProps) {
	const visitorName = getVisitorNameWithFallback(visitor);
	const visitorParticipantIds = useMemo(() => {
		const ids = new Set<string>();

		if (visitor?.id) {
			ids.add(visitor.id);
		}

		for (const item of messages) {
			if (item.visitorId) {
				ids.add(item.visitorId);
			}
		}

		return ids;
	}, [messages, visitor?.id]);

	// Build a lookup map for seen timestamps by actor ID
	const seenTimestampMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const seen of seenData) {
			const actorId = seen.userId || seen.visitorId || seen.aiAgentId;
			if (actorId && seen.lastSeenAt) {
				map.set(actorId, seen.lastSeenAt);
			}
		}
		return map;
	}, [seenData]);

	return (
		<TimelineItemGroupReadIndicator
			className="mt-1"
			itemId={messageId}
			lastReadItemIds={lastReadMessageIds}
		>
			{({ lastReaderIds }) => {
				// Always position seen indicators on the right end side
				const containerClassName = cn(
					"my-3 flex min-h-[1.25rem] items-center justify-end"
				);

				if (lastReaderIds.length === 0) {
					return null;
				}

				// Filter out the current user and the sender
				const otherReaders = lastReaderIds.filter(
					(id) =>
						id !== currentUserId &&
						id !== firstMessage?.userId &&
						id !== firstMessage?.visitorId &&
						id !== firstMessage?.aiAgentId
				);
				const uniqueReaderIds = Array.from(new Set(otherReaders));

				if (uniqueReaderIds.length === 0) {
					return null;
				}

				// Get names/avatars of people who stopped reading here
				const readerInfo = uniqueReaderIds
					.map((id): ReaderInfo | null => {
						const lastSeenAt = seenTimestampMap.get(id) ?? null;
						const human = teamMembers.find((a) => a.id === id);
						if (human) {
							return {
								id,
								name: human.name ?? null,
								image: human.image,
								email: human.email,
								type: "human",
								lastSeenAt,
							};
						}

						const ai = availableAIAgents.find((a) => a.id === id);
						if (ai) {
							return { id, name: ai.name, type: "ai", lastSeenAt };
						}

						if (visitorParticipantIds.has(id)) {
							return {
								id,
								name: visitorName,
								image: visitor?.contact?.image ?? undefined,
								type: "visitor",
								lastSeenAt,
							};
						}

						return null;
					})
					.filter(isReaderInfo);

				if (readerInfo.length === 0) {
					return null;
				}

				// Build tooltip content showing who saw and when
				const tooltipContent = (
					<div className="flex flex-col gap-1">
						{readerInfo.map((reader) => {
							const displayName =
								reader.type === "human"
									? resolveDashboardHumanAgentDisplay({
											id: reader.id,
											name: reader.name,
										}).displayName
									: reader.type === "ai"
										? reader.name || "AI Assistant"
										: reader.name;
							const seenTime = formatSeenTime(reader.lastSeenAt);
							return (
								<div
									className="flex items-center gap-2 text-xs"
									key={reader.id}
								>
									<span className="font-medium">{displayName}</span>
									{seenTime && (
										<span className="text-primary-foreground/70">
											{seenTime}
										</span>
									)}
								</div>
							);
						})}
					</div>
				);

				return (
					<div className={containerClassName}>
						<TooltipOnHover content={tooltipContent} delay={300}>
							<div className="flex gap-1">
								{readerInfo.slice(0, 3).map((reader) => (
									<motion.div
										className="relative"
										key={reader.id}
										layoutId={`read-indicator-${reader.id}`}
										transition={{
											type: "tween",
											duration: 0.12,
											ease: "easeOut",
										}}
									>
										{reader.type === "human" ? (
											(() => {
												const humanDisplay = resolveDashboardHumanAgentDisplay({
													id: reader.id,
													name: reader.name,
												});

												return (
													<Avatar
														className="size-5 rounded border border-background"
														facehashSeed={humanDisplay.facehashSeed}
														fallbackName={humanDisplay.displayName}
														url={reader.image}
													/>
												);
											})()
										) : reader.type === "ai" ? (
											<Logo className="size-5 text-primary" />
										) : (
											<Avatar
												className="size-5 rounded border border-background"
												fallbackName={visitorName}
												url={reader.image}
											/>
										)}
									</motion.div>
								))}
								{readerInfo.length > 3 && (
									<span className="flex items-center text-[10px] text-muted-foreground">
										+{readerInfo.length - 3}
									</span>
								)}
							</div>
						</TooltipOnHover>
					</div>
				);
			}}
		</TimelineItemGroupReadIndicator>
	);
}
