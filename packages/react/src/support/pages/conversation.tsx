import { ConversationStatus } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { ReactElement } from "react";
import { useConversation } from "../../hooks/use-conversation";
import { useConversationPage } from "../../hooks/use-conversation-page";
import { useSupport } from "../../provider";
import { AvatarStack } from "../components/avatar-stack";
import { ConversationTimelineList } from "../components/conversation-timeline";
import { Header } from "../components/header";
import { MultimodalInput } from "../components/multimodal-input";
import { useSupportConfig, useSupportNavigation } from "../store";
import { Text, useSupportText } from "../text";

type ConversationPageProps = {
	/**
	 * The conversation ID to display (can be PENDING_CONVERSATION_ID or a real ID).
	 */
	conversationId: string;

	/**
	 * Optional initial message to send when opening the conversation.
	 */
	initialMessage?: string;

	/**
	 * Optional timeline items to display (for optimistic updates or initial state).
	 */
	items?: TimelineItem[];
};

/**
 * Main conversation page component.
 *
 * All conversation logic is handled by the useConversationPage hook,
 * making this component focused purely on rendering and user interaction.
 */
type ConversationPageComponent = (props: ConversationPageProps) => ReactElement;

export const ConversationPage: ConversationPageComponent = ({
	conversationId: initialConversationId,
	initialMessage,
	items: passedItems = [],
}: ConversationPageProps) => {
	const { website, availableAIAgents, availableHumanAgents, visitor } =
		useSupport();
	const { navigate, replace, goBack, canGoBack } = useSupportNavigation();
	const { isOpen } = useSupportConfig();
	const text = useSupportText();

	// Main conversation hook - handles all logic
	const conversation = useConversationPage({
		conversationId: initialConversationId,
		items: passedItems,
		initialMessage,
		autoSeenEnabled: isOpen,
		onConversationIdChange: (newConversationId) => {
			// Update navigation when conversation is created
			replace({
				page: "CONVERSATION",
				params: { conversationId: newConversationId },
			});
		},
	});

	const activeConversationId = conversation.isPending
		? null
		: conversation.conversationId;
	const { conversation: activeConversation } = useConversation(
		activeConversationId,
		{
			enabled: Boolean(activeConversationId),
		}
	);

	const isComposerAllowed =
		conversation.isPending ||
		!activeConversation ||
		activeConversation.status === ConversationStatus.OPEN;

	const handleGoBack = () => {
		if (canGoBack) {
			goBack();
		} else {
			navigate({ page: "HOME" });
		}
	};

	return (
		<div className="flex h-full flex-col gap-0 overflow-hidden">
			<Header onGoBack={handleGoBack}>
				<div className="flex w-full items-center justify-between gap-2 py-3">
					<div className="flex flex-col">
						<p className="font-medium text-sm">{website?.name}</p>
						<Text
							as="p"
							className="text-muted-foreground text-sm"
							textKey="common.labels.supportOnline"
						/>
					</div>
					<AvatarStack
						aiAgents={availableAIAgents}
						gapWidth={2}
						humanAgents={availableHumanAgents}
						size={32}
						spacing={28}
					/>
				</div>
			</Header>

			<ConversationTimelineList
				availableAIAgents={availableAIAgents}
				availableHumanAgents={availableHumanAgents}
				className="min-h-0 flex-1 px-4"
				conversationId={conversation.conversationId}
				currentVisitorId={visitor?.id}
				items={conversation.items}
			/>

			{isComposerAllowed ? (
				<div className="flex-shrink-0 p-1">
					<MultimodalInput
						disabled={conversation.composer.isSubmitting}
						error={conversation.error}
						files={conversation.composer.files}
						isSubmitting={conversation.composer.isSubmitting}
						onChange={conversation.composer.setMessage}
						onFileSelect={conversation.composer.addFiles}
						onRemoveFile={conversation.composer.removeFile}
						onSubmit={conversation.composer.submit}
						placeholder={text("component.multimodalInput.placeholder")}
						value={conversation.composer.message}
					/>
				</div>
			) : null}
		</div>
	);
};
