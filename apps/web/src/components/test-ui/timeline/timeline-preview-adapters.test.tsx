import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("motion/react", () => ({
	motion: {
		div: ({
			children,
			...props
		}: React.HTMLAttributes<HTMLDivElement> & {
			children: React.ReactNode;
		}) => <div {...props}>{children}</div>,
	},
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		conversation: {
			translateMessageGroup: {
				mutationOptions: () => ({}),
			},
		},
	}),
}));

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		mutateAsync: async () => null,
		isPending: false,
	}),
}));

mock.module("@/contexts/website", () => ({
	useOptionalWebsite: () => null,
}));

import { TestDashboardConversationTimelineList } from "./dashboard-conversation-timeline-list";
import { getTimelineUiPreset, TEST_UI_VISITOR } from "./fixtures";
import { TestUiWidgetTimelinePreview } from "./widget-timeline-preview";

function renderWidgetPreview(
	presetId: Parameters<typeof getTimelineUiPreset>[0]
) {
	const preset = getTimelineUiPreset(presetId);

	return renderToStaticMarkup(
		<div className="cossistant">
			<TestUiWidgetTimelinePreview
				items={preset.items}
				typingActors={preset.widgetTypingActors}
			/>
		</div>
	);
}

describe("timeline preview adapters", () => {
	it("renders message markdown, fenced code, and promoted commands in the dashboard preview", () => {
		const preset = getTimelineUiPreset("markdown");
		const html = renderToStaticMarkup(
			<TestDashboardConversationTimelineList
				items={preset.items}
				visitor={TEST_UI_VISITOR}
			/>
		);

		expect(html).toContain('data-co-code-block=""');
		expect(html).toContain('data-co-command-block=""');
		expect(html).toContain("app/page.tsx");
	});

	it("renders activity groups with events and public tools in the dashboard preview", () => {
		const preset = getTimelineUiPreset("activity");
		const html = renderToStaticMarkup(
			<TestDashboardConversationTimelineList
				items={preset.items}
				visitor={TEST_UI_VISITOR}
			/>
		);

		expect(html).toContain("joined the conversation");
		expect(html).toContain("Priority set to high");
	});

	it("renders developer logs in the dashboard preview when developer mode is enabled", () => {
		const preset = getTimelineUiPreset("developer");
		const html = renderToStaticMarkup(
			<TestDashboardConversationTimelineList
				isDeveloperModeEnabled
				items={preset.items}
				visitor={TEST_UI_VISITOR}
			/>
		);

		expect(html).toContain("Dev logs");
		expect(html).toContain("Decision trace captured");
	});

	it("renders widget tool rows and search results with the fake support providers", () => {
		const html = renderWidgetPreview("widget-tools");

		expect(html).toContain('data-tool-display-state="result"');
		expect(html).toContain("Searched for &quot;support widget colors&quot;");
		expect(html).toContain("Email address");
	});

	it("keeps typing indicators present on both previews when a preset includes typing actors", () => {
		const preset = getTimelineUiPreset("typing");
		const dashboardHtml = renderToStaticMarkup(
			<TestDashboardConversationTimelineList
				items={preset.items}
				typingActors={preset.dashboardTypingActors}
				visitor={TEST_UI_VISITOR}
			/>
		);
		const widgetHtml = renderWidgetPreview("typing");

		expect(dashboardHtml).toContain('data-test-ui-typing-surface="dashboard"');
		expect(widgetHtml).toContain('data-test-ui-typing-surface="widget"');
	});
});
