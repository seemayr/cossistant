import {
	createSupportStore,
	type RouteRegistry,
} from "@cossistant/core/store/support-store";
import type {
	SupportController,
	SupportControllerSnapshot,
} from "@cossistant/core/support-controller";
import { PENDING_CONVERSATION_ID } from "../utils/id";

export function createMockSupportController(
	options: {
		client?: SupportControllerSnapshot["client"];
		website?: SupportControllerSnapshot["website"];
	} = {}
): SupportController {
	const supportStore = createSupportStore();
	let defaultMessages: SupportControllerSnapshot["defaultMessages"] = [];
	let quickOptions: string[] = [];
	let unreadCount = 0;
	const client = options.client ?? null;
	const listeners = new Set<
		(nextSnapshot: SupportControllerSnapshot) => void
	>();

	const website =
		options.website ??
		({
			description: null,
			domain: "acme.test",
			defaultLanguage: "en",
			id: "site_123",
			lastOnlineAt: null,
			logoUrl: null,
			name: "Acme",
			organizationId: "org_123",
			status: "online",
			availableAIAgents: [],
			availableHumanAgents: [],
			visitor: {
				id: "visitor_123",
				language: "en",
				contact: null,
				isBlocked: false,
			},
		} as SupportControllerSnapshot["website"]);

	const buildSnapshot = (): SupportControllerSnapshot => {
		const support = supportStore.getState();

		return {
			client,
			configurationError: null,
			defaultMessages,
			error: null,
			isLoading: false,
			isOpen: support.config.isOpen,
			isVisitorBlocked: false,
			navigation: support.navigation,
			quickOptions,
			size: support.config.size,
			support,
			unreadCount,
			visitorId: "visitor_123",
			website,
			websiteStatus: "success",
		};
	};

	let snapshot = buildSnapshot();

	const emitChange = () => {
		snapshot = buildSnapshot();
		for (const listener of listeners) {
			listener(snapshot);
		}
	};

	const unsubscribeStore = supportStore.subscribe(() => {
		emitChange();
	});

	return {
		supportStore,
		start: () => {},
		destroy: () => {
			unsubscribeStore();
			listeners.clear();
		},
		getState: () => snapshot,
		getSnapshot: () => snapshot,
		subscribe(listener) {
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
		refresh: async () => website,
		updateOptions: () => {},
		updateSupportConfig: (config) => supportStore.updateConfig(config),
		setDefaultMessages: (messages) => {
			defaultMessages = messages;
			emitChange();
		},
		setQuickOptions: (nextOptions) => {
			quickOptions = nextOptions;
			emitChange();
		},
		setUnreadCount: (count) => {
			unreadCount = count;
			emitChange();
		},
		open: () => supportStore.open(),
		close: () => supportStore.close(),
		toggle: () => supportStore.toggle(),
		navigate: <K extends keyof RouteRegistry>(navigationOptions: {
			page: K;
			params?: RouteRegistry[K];
		}) => {
			supportStore.navigate(
				navigationOptions as Parameters<typeof supportStore.navigate>[0]
			);
		},
		replace: <K extends keyof RouteRegistry>(navigationOptions: {
			page: K;
			params?: RouteRegistry[K];
		}) => {
			supportStore.replace(
				navigationOptions as Parameters<typeof supportStore.replace>[0]
			);
		},
		goBack: () => supportStore.goBack(),
		goHome: () =>
			supportStore.navigate({
				page: "HOME",
			} as Parameters<typeof supportStore.navigate>[0]),
		openConversation: (conversationId: string) => {
			supportStore.navigate({
				page: "CONVERSATION",
				params: {
					conversationId,
				},
			} as Parameters<typeof supportStore.navigate>[0]);
			supportStore.open();
		},
		startConversation: (initialMessage?: string) => {
			supportStore.navigate({
				page: "CONVERSATION",
				params: {
					conversationId: PENDING_CONVERSATION_ID,
					initialMessage,
				},
			} as Parameters<typeof supportStore.navigate>[0]);
			supportStore.open();
		},
		identify: async () => null,
		updateVisitorMetadata: async () => null,
		emit: (_event) => {},
		on: (_type, _handler) => () => {},
		off: (_type, _handler) => {},
	};
}
