import type { ConversationHeader as ConversationHeaderType } from "@cossistant/types";
import { type RefObject, useRef } from "react";
import { EscalationAction } from "@/components/conversation/composer/escalation-action";
import { Page } from "@/components/ui/layout";
import type { ConversationHeader } from "@/contexts/inboxes";
import type { ConversationTimelineItem } from "@/data/conversation-message-cache";
import type { FakeTypingActor, FakeVisitor } from "../data";
import { FakeMouseCursor } from "../fake-inbox/fake-mouse-cursor";
import { FakeInboxNavigationSidebar } from "../fake-sidebar/inbox";
import { FakeVisitorSidebar } from "../fake-sidebar/visitor";
import { FakeConversationHeader } from "./fake-conversation-header";
import { FakeConversationTimelineList } from "./fake-conversation-timeline-list";
import { FakeMultimodalInput } from "./fake-multimodal-input";

type Props = {
	typingActors: FakeTypingActor[];
	conversation: ConversationHeaderType;
	timeline: ConversationTimelineItem[];
	visitor: FakeVisitor;
	isEscalationPending: boolean;
	onJoinConversation: () => void;
	showJoinCursor?: boolean;
	onJoinCursorClick?: () => void;
};

export function FakeConversation({
	typingActors,
	conversation,
	timeline,
	visitor,
	isEscalationPending,
	onJoinConversation,
	showJoinCursor = false,
	onJoinCursorClick,
}: Props) {
	const timelineVisitor = visitor as unknown as ConversationHeader["visitor"];
	const joinButtonRef = useRef<HTMLButtonElement>(null);
	const cursorContainerRef = useRef<HTMLDivElement>(null);

	return (
		<>
			<FakeInboxNavigationSidebar
				activeView="inbox"
				open
				statusCounts={{ open: 10, resolved: 0, spam: 0, archived: 0 }}
			/>
			<div className="relative flex h-full flex-1" ref={cursorContainerRef}>
				<Page className="py-0 pr-0.5 pl-0">
					<FakeConversationHeader />
					<FakeConversationTimelineList
						items={timeline}
						typingActors={typingActors}
						visitor={timelineVisitor}
					/>
					{isEscalationPending ? (
						<EscalationAction
							isJoining={false}
							joinButtonRef={joinButtonRef}
							onJoin={onJoinConversation}
							reason={
								conversation.escalationReason ??
								"Human assistance requested by AI"
							}
						/>
					) : (
						<FakeMultimodalInput />
					)}
				</Page>
				{isEscalationPending && showJoinCursor ? (
					<FakeMouseCursor
						containerRef={cursorContainerRef}
						isVisible={showJoinCursor}
						onClick={onJoinCursorClick ?? onJoinConversation}
						targetElementRef={
							joinButtonRef as unknown as RefObject<HTMLElement | null>
						}
						targetMode="element"
					/>
				) : null}
			</div>
			<FakeVisitorSidebar open={true} visitor={visitor} />
		</>
	);
}
