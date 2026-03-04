"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { Page } from "../ui/layout";
import {
	VisitorSidebar,
	type VisitorSidebarProps,
} from "../ui/layout/sidebars/visitor/visitor-sidebar";
import { ConversationHeader, type ConversationHeaderProps } from "./header";
import { ConversationTimelineList } from "./messages/conversation-timeline";
import { MultimodalInput, type MultimodalInputProps } from "./multimodal-input";
import {
	EscalationAction,
	type EscalationActionProps,
} from "./multimodal-input/escalation-action";
import {
	LimitAction,
	type LimitActionProps,
} from "./multimodal-input/limit-action";

type ConversationTimelineProps = ComponentProps<
	typeof ConversationTimelineList
>;

export type ConversationProps = {
	header: ConversationHeaderProps;
	timeline: ConversationTimelineProps;
	input: MultimodalInputProps;
	visitorSidebar: VisitorSidebarProps;
	/** If set, shows escalation action instead of input */
	escalation?: EscalationActionProps | null;
	/** If set, shows hard-limit action instead of input */
	limitAction?: LimitActionProps | null;
};

export function Conversation({
	header,
	timeline,
	input,
	visitorSidebar,
	escalation,
	limitAction,
}: ConversationProps) {
	// Track input/escalation height for dynamic timeline padding
	const [inputHeight, setInputHeight] = useState(140); // Default ~140px for initial render

	return (
		<>
			<Page className="relative py-0 pr-0.5 pl-0">
				<ConversationHeader {...header} />
				<ConversationTimelineList {...timeline} inputHeight={inputHeight} />
				{escalation ? (
					<EscalationAction {...escalation} onHeightChange={setInputHeight} />
				) : limitAction ? (
					<LimitAction {...limitAction} onHeightChange={setInputHeight} />
				) : (
					<MultimodalInput {...input} onHeightChange={setInputHeight} />
				)}
			</Page>
			<VisitorSidebar {...visitorSidebar} />
		</>
	);
}
