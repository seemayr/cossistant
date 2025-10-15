import {
        ConversationStatus,
        type ConversationEvent,
        type Message as MessageType,
} from "@cossistant/types";
import { useConversationPage } from "../../hooks/use-conversation-page";
import { useConversation } from "../../hooks/use-conversation";
import { useSupport } from "../../provider";
import { AvatarStack } from "../components/avatar-stack";
import { Header } from "../components/header";
import { MessageList } from "../components/message-list";
import { MultimodalInput } from "../components/multimodal-input";
import { useSupportNavigation } from "../store";
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
	 * Optional messages to display (for optimistic updates or initial state).
	 */
	messages?: MessageType[];

	/**
	 * Optional events to display.
	 */
	events?: ConversationEvent[];
};

/**
 * Main conversation page component.
 *
 * All conversation logic is handled by the useConversationPage hook,
 * making this component focused purely on rendering and user interaction.
 */
export const ConversationPage = ({
	conversationId: initialConversationId,
	initialMessage,
	messages: passedMessages = [],
	events = [],
}: ConversationPageProps) => {
	const { website, availableAIAgents, availableHumanAgents, visitor } =
		useSupport();
	const { navigate, replace, goBack, canGoBack } = useSupportNavigation();
	const text = useSupportText();

	// Main conversation hook - handles all logic
        const conversation = useConversationPage({
                conversationId: initialConversationId,
                messages: passedMessages,
                events,
                initialMessage,
                onConversationIdChange: (newConversationId) => {
                        // Update navigation when conversation is created
                        replace({
                                page: "CONVERSATION",
                                params: { conversationId: newConversationId },
                        });
                },
        });

        const realConversationId = conversation.isPending
                ? null
                : conversation.conversationId;

        const {
                conversation: activeConversation,
                isLoading: isConversationLoading,
        } = useConversation(realConversationId, {
                enabled: !conversation.isPending,
        });

        const canUseComposer =
                conversation.isPending ||
                activeConversation?.status === ConversationStatus.OPEN;

        const shouldRenderComposer =
                conversation.isPending ||
                isConversationLoading ||
                canUseComposer;

        const composerDisabled =
                conversation.composer.isSubmitting || !canUseComposer;

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

			<MessageList
				availableAIAgents={availableAIAgents}
				availableHumanAgents={availableHumanAgents}
				className="min-h-0 flex-1 px-4"
				conversationId={conversation.conversationId}
				currentVisitorId={visitor?.id}
				events={conversation.events}
				messages={conversation.messages}
			/>

                        {shouldRenderComposer ? (
                                <div className="flex-shrink-0 p-1">
                                        <MultimodalInput
                                                disabled={composerDisabled}
                                                error={conversation.error}
                                                files={conversation.composer.files}
                                                isSubmitting={conversation.composer.isSubmitting}
                                                onChange={conversation.composer.setMessage}
                                                onFileSelect={conversation.composer.addFiles}
                                                onRemoveFile={conversation.composer.removeFile}
                                                onSubmit={conversation.composer.submit}
                                                placeholder={text(
                                                        "component.multimodalInput.placeholder"
                                                )}
                                                value={conversation.composer.message}
                                        />
                                </div>
                        ) : null}
                </div>
        );
};
