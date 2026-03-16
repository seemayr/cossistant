"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { Page } from "../ui/layout";
import {
	VisitorSidebar,
	type VisitorSidebarProps,
} from "../ui/layout/sidebars/visitor/visitor-sidebar";
import { Composer, type ComposerProps } from "./composer";
import {
	EscalationAction,
	type EscalationActionProps,
} from "./composer/escalation-action";
import { LimitAction, type LimitActionProps } from "./composer/limit-action";
import { ConversationHeader, type ConversationHeaderProps } from "./header";
import { ConversationTimelineList } from "./messages/conversation-timeline";

type ConversationTimelineProps = ComponentProps<
	typeof ConversationTimelineList
>;

export type ConversationProps = {
	header: ConversationHeaderProps;
	timeline: ConversationTimelineProps;
	input: ComposerProps;
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
					<Composer {...input} onHeightChange={setInputHeight} />
				)}
			</Page>
			<VisitorSidebar {...visitorSidebar} />
		</>
	);
}
