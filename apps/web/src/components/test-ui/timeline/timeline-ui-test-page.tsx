"use client";

import { useMemo, useState } from "react";
import { TestUiPageShell } from "@/components/test-ui/page-shell";
import {
	TestUiPreviewSurface,
	type TestUiPreviewTheme,
	TestUiPreviewUnsupported,
} from "@/components/test-ui/preview";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { TestDashboardConversationTimelineList } from "./dashboard-conversation-timeline-list";
import {
	DEFAULT_TIMELINE_UI_PRESET_ID,
	getTimelineUiPreset,
	TEST_UI_VISITOR,
	TIMELINE_UI_PRESETS,
	type TimelineUiPresetId,
} from "./fixtures";
import { TestUiWidgetTimelinePreview } from "./widget-timeline-preview";

export function TimelineUiTestPage() {
	const [presetId, setPresetId] = useState<TimelineUiPresetId>(
		DEFAULT_TIMELINE_UI_PRESET_ID
	);
	const [theme, setTheme] = useState<TestUiPreviewTheme>("light");

	const preset = useMemo(() => getTimelineUiPreset(presetId), [presetId]);
	const manifestLines = useMemo(
		() =>
			preset.items.map((item) => {
				const label =
					item.type === "tool"
						? `${item.type}:${item.tool ?? "unknown"}`
						: item.type;
				return `${new Date(item.createdAt).toISOString()}  ${label}  ${item.id ?? "unknown"}`;
			}),
		[preset.items]
	);

	return (
		<div
			className="min-h-[calc(100vh-13rem)]"
			data-timeline-ui-current-preset={preset.id}
			data-timeline-ui-test="true"
		>
			<TestUiPageShell
				controls={
					<>
						<Card>
							<CardHeader>
								<CardTitle>Timeline UI Test</CardTitle>
								<CardDescription>
									Compare dashboard and widget timeline rendering with the same
									fake thread.
								</CardDescription>
							</CardHeader>
							<CardContent className="grid grid-cols-2 gap-2">
								{TIMELINE_UI_PRESETS.map((entry) => (
									<Button
										className="justify-start"
										data-timeline-ui-preset={entry.id}
										key={entry.id}
										onClick={() => setPresetId(entry.id)}
										size="xs"
										type="button"
										variant={preset.id === entry.id ? "secondary" : "outline"}
									>
										{entry.label}
									</Button>
								))}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Preview Surface Theme</CardTitle>
								<CardDescription>
									Flip the preview containers between light and dark without
									changing the page theme in the header.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex gap-2">
								{(["light", "dark"] as const).map((value) => (
									<Button
										aria-pressed={theme === value}
										data-timeline-ui-theme={value}
										key={value}
										onClick={() => setTheme(value)}
										size="xs"
										type="button"
										variant={theme === value ? "secondary" : "outline"}
									>
										{value}
									</Button>
								))}
							</CardContent>
						</Card>
					</>
				}
				controlsProps={{ "data-timeline-ui-controls": "true" }}
				preview={
					<div className="space-y-4" data-timeline-ui-preview="true">
						<div className="grid gap-4 2xl:grid-cols-2">
							<TestUiPreviewSurface
								cardProps={{ "data-timeline-ui-surface": "dashboard" }}
								description="Real dashboard message, activity, event, and developer-log components."
								frameProps={{ "data-timeline-ui-preview-theme": theme }}
								theme={theme}
								title="Dashboard Preview"
							>
								<TestDashboardConversationTimelineList
									isDeveloperModeEnabled={preset.isDeveloperModeEnabled}
									items={preset.items}
									typingActors={preset.dashboardTypingActors}
									visitor={TEST_UI_VISITOR}
								/>
							</TestUiPreviewSurface>

							<TestUiPreviewSurface
								cardProps={{ "data-timeline-ui-surface": "widget" }}
								description="Real support timeline messages, activity groups, standalone tools, and typing state."
								fallback={
									preset.widgetSupported ? undefined : (
										<TestUiPreviewUnsupported
											data-timeline-ui-widget-unsupported="true"
											description="This preset includes internal developer logs that the customer-facing widget intentionally hides."
											title="Not supported on widget"
										/>
									)
								}
								frameClassName="cossistant"
								frameProps={{ "data-timeline-ui-preview-theme": theme }}
								theme={theme}
								title="Widget Preview"
							>
								<TestUiWidgetTimelinePreview
									items={preset.items}
									typingActors={preset.widgetTypingActors}
								/>
							</TestUiPreviewSurface>
						</div>
					</div>
				}
				secondary={
					<>
						<Card>
							<CardHeader>
								<CardTitle>Preset Details</CardTitle>
								<CardDescription>{preset.description}</CardDescription>
							</CardHeader>
							<CardContent className="space-y-2 text-sm">
								<p>
									<span className="font-medium">Items:</span>{" "}
									{preset.items.length}
								</p>
								<p>
									<span className="font-medium">Dashboard typing:</span>{" "}
									{preset.dashboardTypingActors.length}
								</p>
								<p>
									<span className="font-medium">Widget typing:</span>{" "}
									{preset.widgetTypingActors.length}
								</p>
								<p>
									<span className="font-medium">Widget support:</span>{" "}
									{preset.widgetSupported ? "yes" : "dashboard only"}
								</p>
								<p>
									<span className="font-medium">Developer mode:</span>{" "}
									{preset.isDeveloperModeEnabled ? "on" : "off"}
								</p>
							</CardContent>
						</Card>

						<Card data-timeline-ui-manifest="true">
							<CardHeader>
								<CardTitle>Timeline Manifest</CardTitle>
								<CardDescription>
									Quick scan of the generated raw items for this preset.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<pre className="max-h-[420px] overflow-auto rounded-lg bg-muted/30 p-3 font-mono text-[11px] text-muted-foreground leading-relaxed">
									{manifestLines.join("\n")}
								</pre>
							</CardContent>
						</Card>
					</>
				}
				secondaryProps={{ "data-timeline-ui-details": "true" }}
			/>
		</div>
	);
}
