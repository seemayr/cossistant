"use client";

import type { AvailableAIAgent, AvailableHumanAgent } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type { Conversation } from "@cossistant/types/schemas";
import * as React from "react";
import type { UseConversationHistoryPageReturn } from "../../hooks/use-conversation-history-page";
import type {
	MessageComposer,
	UseConversationPageReturn,
} from "../../hooks/use-conversation-page";
import type { UseHomePageReturn } from "../../hooks/use-home-page";
import type { ConfigurationError, UseSupportValue } from "../../provider";
import type { ConversationTimelineProps } from "../components/conversation-timeline";
import type { MultimodalInputProps } from "../components/multimodal-input";
import type { SupportMode, TriggerRenderProps } from "../types";

type DataProps = {
	"data-page"?: string;
	"data-slot"?: string;
};

type SupportSlotComponent<Props> =
	| React.ComponentType<Props>
	| React.ForwardRefExoticComponent<Props>;

type PageSlotProps = DataProps & {
	className?: string;
};

export type SupportTriggerSlotProps = Omit<
	React.ButtonHTMLAttributes<HTMLButtonElement>,
	"children"
> &
	TriggerRenderProps &
	DataProps & {
		className?: string;
		"data-state"?: "closed" | "open";
	};

export type SupportContentSlotProps = DataProps & {
	className?: string;
	mode: SupportMode;
	isOpen: boolean;
	"data-state"?: "closed" | "open";
};

export type SupportHeaderSlotProps = DataProps & {
	className?: string;
	children?: React.ReactNode;
	actions?: React.ReactNode;
	onGoBack?: () => void;
	page?: string;
};

export type SupportFooterSlotProps = DataProps & {
	className?: string;
	children?: React.ReactNode;
	page?: string;
};

type SupportParticipantContext = {
	availableAIAgents: AvailableAIAgent[];
	availableHumanAgents: AvailableHumanAgent[];
	visitor: UseSupportValue["visitor"];
	website: UseSupportValue["website"];
};

export type SupportHomePageSlotProps = PageSlotProps &
	SupportParticipantContext &
	Pick<
		UseHomePageReturn,
		| "availableConversationsCount"
		| "conversations"
		| "error"
		| "hasConversations"
		| "isLoading"
		| "lastOpenConversation"
		| "openConversation"
		| "openConversationHistory"
		| "startConversation"
	> & {
		quickOptions: string[];
	};

export type SupportConversationHistoryPageSlotProps = PageSlotProps &
	Pick<
		SupportParticipantContext,
		"availableAIAgents" | "availableHumanAgents"
	> &
	Pick<
		UseConversationHistoryPageReturn,
		| "conversations"
		| "error"
		| "hasMore"
		| "isLoading"
		| "openConversation"
		| "remainingCount"
		| "showAll"
		| "showMore"
		| "startConversation"
		| "visibleConversations"
		| "visibleCount"
	> & {
		canGoBack: boolean;
		onGoBack: () => void;
	};

export type SupportConversationPageSlotProps = PageSlotProps &
	SupportParticipantContext & {
		params?: {
			conversationId: string;
			initialMessage?: string;
			items?: TimelineItem[];
		};
		conversation: UseConversationPageReturn;
		activeConversation: Conversation | null;
		isConversationClosed: boolean;
		resolvedRating: number | null;
		isSubmittingRating: boolean;
		onGoBack: () => void;
		onRateConversation: (value: number, comment?: string) => Promise<void>;
		canGoBack: boolean;
	};

export type SupportTimelineSlotProps = ConversationTimelineProps &
	DataProps & {
		className?: string;
	};

export type SupportComposerSlotProps = MultimodalInputProps &
	DataProps & {
		className?: string;
		composer: MessageComposer;
	};

export type SupportConfigurationErrorSlotProps = DataProps & {
	error: ConfigurationError;
	className?: string;
};

export type SupportWatermarkSlotProps = DataProps & {
	className?: string;
	website: UseSupportValue["website"];
};

export type SupportSlots = {
	trigger?: SupportSlotComponent<SupportTriggerSlotProps>;
	homePage?: SupportSlotComponent<SupportHomePageSlotProps>;
	conversationPage?: SupportSlotComponent<SupportConversationPageSlotProps>;
	conversationHistoryPage?: SupportSlotComponent<SupportConversationHistoryPageSlotProps>;
	header?: SupportSlotComponent<SupportHeaderSlotProps>;
	footer?: SupportSlotComponent<SupportFooterSlotProps>;
	timeline?: SupportSlotComponent<SupportTimelineSlotProps>;
	composer?: SupportSlotComponent<SupportComposerSlotProps>;
	configurationError?: SupportSlotComponent<SupportConfigurationErrorSlotProps>;
	watermark?: SupportSlotComponent<SupportWatermarkSlotProps>;
};

export type SupportSlotProps = {
	content?: Partial<SupportContentSlotProps>;
	trigger?: Partial<SupportTriggerSlotProps>;
	homePage?: Partial<SupportHomePageSlotProps>;
	conversationPage?: Partial<SupportConversationPageSlotProps>;
	conversationHistoryPage?: Partial<SupportConversationHistoryPageSlotProps>;
	header?: Partial<SupportHeaderSlotProps>;
	footer?: Partial<SupportFooterSlotProps>;
	timeline?: Partial<SupportTimelineSlotProps>;
	composer?: Partial<SupportComposerSlotProps>;
	configurationError?: Partial<SupportConfigurationErrorSlotProps>;
	watermark?: Partial<SupportWatermarkSlotProps>;
};

type SupportSlotOverridesContextValue = {
	slots: SupportSlots;
	slotProps: SupportSlotProps;
};

const SupportSlotOverridesContext =
	React.createContext<SupportSlotOverridesContextValue>({
		slots: {},
		slotProps: {},
	});

export type SupportSlotOverridesProviderProps = {
	children: React.ReactNode;
	slots?: SupportSlots;
	slotProps?: SupportSlotProps;
};

export function SupportSlotOverridesProvider({
	children,
	slots,
	slotProps,
}: SupportSlotOverridesProviderProps): React.ReactElement {
	const value = React.useMemo<SupportSlotOverridesContextValue>(
		() => ({
			slots: slots ?? {},
			slotProps: slotProps ?? {},
		}),
		[slots, slotProps]
	);

	return (
		<SupportSlotOverridesContext.Provider value={value}>
			{children}
		</SupportSlotOverridesContext.Provider>
	);
}

export function useSupportSlotOverrides(): SupportSlotOverridesContextValue {
	return React.useContext(SupportSlotOverridesContext);
}
