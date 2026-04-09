import { describe, expect, it, mock } from "bun:test";
import { ConversationStatus } from "@cossistant/types";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-query", () => ({
	useQueryClient: () => ({
		fetchQuery: async () => ({
			filename: "conversation-conv-1.txt",
			content: "Conversation Export",
			mimeType: "text/plain; charset=utf-8",
		}),
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		conversation: {
			getConversationExport: {
				queryOptions: (input: {
					websiteSlug: string;
					conversationId: string;
				}) => ({
					queryKey: [
						"conversation.getConversationExport",
						input.websiteSlug,
						input.conversationId,
					],
				}),
			},
		},
	}),
}));

mock.module("react-hotkeys-hook", () => ({
	useHotkeys: () => {},
}));

mock.module("@/components/ui/button", () => ({
	Button: ({
		children,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		children?: React.ReactNode;
	}) => <button {...props}>{children}</button>,
}));

mock.module("@/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuItem: ({
		children,
		shortcuts: _shortcuts,
		...props
	}: React.HTMLAttributes<HTMLDivElement> & {
		children?: React.ReactNode;
		shortcuts?: string[];
	}) => <div {...props}>{children}</div>,
	DropdownMenuSeparator: () => <hr />,
}));

mock.module("@/components/ui/icons", () => ({
	__esModule: true,
	default: (props: React.HTMLAttributes<HTMLSpanElement>) => (
		<span {...props}>icon</span>
	),
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipOnHover: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

mock.module("@/hooks/use-conversation-developer-mode", () => ({
	CONVERSATION_DEVELOPER_MODE_HOTKEY: "shift+d",
	CONVERSATION_DEVELOPER_MODE_SHORTCUT_CHIPS: ["Shift", "D"],
	useConversationDeveloperMode: (
		selector:
			| ((state: {
					isDeveloperModeEnabled: boolean;
					toggleDeveloperMode: () => void;
			  }) => unknown)
			| undefined
	) =>
		selector
			? selector({
					isDeveloperModeEnabled: false,
					toggleDeveloperMode: () => {},
				})
			: false,
}));

mock.module("@/lib/utils", () => ({
	cn: (...parts: Array<string | false | null | undefined>) =>
		parts.filter(Boolean).join(" "),
}));

mock.module("./use-conversation-action-runner", () => ({
	useConversationActionRunner: () => ({
		markResolved: async () => {},
		markOpen: async () => {},
		markArchived: async () => {},
		markUnarchived: async () => {},
		markSpam: async () => {},
		markNotSpam: async () => {},
		blockVisitor: async () => {},
		unblockVisitor: async () => {},
		pendingAction: {
			markResolved: false,
			markOpen: false,
			markArchived: false,
			markUnarchived: false,
			markSpam: false,
			markNotSpam: false,
			blockVisitor: false,
			unblockVisitor: false,
		},
		runAction: async () => true,
	}),
}));

const modulePromise = import("./more");

describe("MoreConversationActions", () => {
	it("renders full conversation copy and download actions in the menu", async () => {
		const { MoreConversationActions } = await modulePromise;

		const html = renderToStaticMarkup(
			<MoreConversationActions
				conversationId="conv-1"
				status={ConversationStatus.OPEN}
				websiteSlug="acme"
			/>
		);

		expect(html).toContain("Copy full conversation");
		expect(html).toContain("Download conversation (.txt)");
		expect(html).toContain("Copy conversation ID");
		expect(html).toContain("Copy conversation URL");
	});
});
