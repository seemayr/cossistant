"use client";

import {
	getWidgetToolDefaultProgressMessage,
	isWidgetTimelineTool,
} from "@cossistant/types";
import type React from "react";
import {
	extractToolPart,
	getToolNameFromTimelineItem,
	type TimelineToolPartState,
} from "../../utils/timeline-tool";
import { Spinner } from "./spinner";
import type { ConversationTimelineToolProps } from "./timeline-tool-types";
import { useToolDisplayState } from "./use-tool-display-state";

type WidgetToolActivityRowProps = {
	text: string;
	state?: TimelineToolPartState;
	detailLabels?: string[];
};

const TOOL_INDICATOR_SLOT_CLASS_NAME =
	"flex min-h-6 w-5 shrink-0 items-start justify-center";

function getGenericToolText(params: {
	toolName: string;
	state: TimelineToolPartState;
	itemText?: string | null;
	errorText?: string;
}): string {
	const { toolName, state, itemText, errorText } = params;
	const trimmedItemText = itemText?.trim();

	if (trimmedItemText) {
		return trimmedItemText;
	}

	if (state === "partial") {
		return (
			getWidgetToolDefaultProgressMessage(toolName) ?? `Running ${toolName}`
		);
	}

	if (state === "error") {
		return errorText?.trim() || `Failed ${toolName}`;
	}

	return `Completed ${toolName}`;
}

export function WidgetToolActivityRow({
	text,
	state = "partial",
	detailLabels = [],
}: WidgetToolActivityRowProps): React.ReactElement {
	return (
		<div
			className="flex w-full flex-col gap-1 text-sm"
			data-tool-display-state={state}
		>
			<div className="flex items-start gap-2">
				<span
					aria-hidden="true"
					className={TOOL_INDICATOR_SLOT_CLASS_NAME}
					data-tool-execution-indicator-slot="true"
				>
					{state === "partial" ? (
						<span
							className="mt-1 shrink-0"
							data-tool-execution-indicator="spinner"
						>
							<Spinner className="text-co-primary/70" size={12} />
						</span>
					) : (
						<span
							className={
								state === "error"
									? "font-mono text-co-destructive text-sm leading-6"
									: "font-mono text-co-muted-foreground text-sm leading-6"
							}
							data-tool-execution-indicator="arrow"
						>
							{"->"}
						</span>
					)}
				</span>
				<span
					className={
						state === "error"
							? "min-w-0 flex-1 break-words text-co-destructive text-sm leading-6"
							: "min-w-0 flex-1 break-words text-co-primary/75 text-sm leading-6"
					}
				>
					{text}
				</span>
			</div>
			{detailLabels.length > 0 ? (
				<div className="flex flex-col gap-1 pl-7 text-co-muted-foreground text-sm leading-5">
					{detailLabels.map((label) => (
						<span className="truncate" key={label} title={label}>
							{label}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

export function GenericWidgetToolTimelineTool({
	item,
}: ConversationTimelineToolProps): React.ReactElement | null {
	const toolName = getToolNameFromTimelineItem(item);
	const registeredToolName =
		toolName && isWidgetTimelineTool(toolName) ? toolName : null;
	const toolPart = extractToolPart(item);
	const rawState = toolPart?.state ?? "partial";
	const displayState = useToolDisplayState({
		state: rawState,
		toolCallId:
			toolPart?.toolCallId ?? item.id ?? registeredToolName ?? "unknown-tool",
	});

	if (!registeredToolName) {
		return null;
	}

	return (
		<WidgetToolActivityRow
			state={displayState}
			text={getGenericToolText({
				toolName: registeredToolName,
				state: displayState,
				itemText: rawState === displayState ? item.text : undefined,
				errorText: toolPart?.errorText,
			})}
		/>
	);
}
