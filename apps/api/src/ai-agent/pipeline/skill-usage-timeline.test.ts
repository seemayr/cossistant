import { beforeEach, describe, expect, it, mock } from "bun:test";

const createTimelineItemMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const updateTimelineItemMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
	updateTimelineItem: updateTimelineItemMock,
}));

const skillUsageTimelineModulePromise = import(
	"@api/ai-agent/pipeline/skill-usage-timeline"
);

describe("AI skill usage timeline logging", () => {
	beforeEach(() => {
		createTimelineItemMock.mockReset();
		updateTimelineItemMock.mockReset();
		createTimelineItemMock.mockResolvedValue({});
		updateTimelineItemMock.mockResolvedValue({});
	});

	it("writes a private tool timeline row with customer-facing metadata", async () => {
		const { logAiSkillUsageTimeline } = await skillUsageTimelineModulePromise;

		await logAiSkillUsageTimeline({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			workflowRunId: "wf-1",
			triggerMessageId: "msg-1",
			triggerVisibility: "private",
			usedCustomSkills: [
				{
					name: "billing-playbook.md",
					description: "Use for billing and invoice issues.",
				},
				{
					name: "refunds.md",
				},
			],
		});

		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		const createCall = createTimelineItemMock.mock.calls[0]?.[0] as {
			item: {
				id: string;
				visibility: string;
				tool: string;
				text: string;
				parts: Record<string, unknown>[];
			};
		};
		expect(createCall?.item.visibility).toBe("private");
		expect(createCall?.item.tool).toBe("aiSkillUsage");
		expect(createCall?.item.text).toContain("AI used custom skills (2)");
		expect(createCall?.item.parts[0]?.toolName).toBe("aiSkillUsage");
		expect(
			(
				createCall?.item.parts[0]?.providerMetadata as {
					cossistant?: {
						toolTimeline?: { logType?: string; triggerVisibility?: string };
					};
				}
			)?.cossistant?.toolTimeline?.logType
		).toBe("customer_facing");
		expect(
			(
				createCall?.item.parts[0]?.providerMetadata as {
					cossistant?: {
						toolTimeline?: { logType?: string; triggerVisibility?: string };
					};
				}
			)?.cossistant?.toolTimeline?.triggerVisibility
		).toBe("private");
	});

	it("uses deterministic timeline item IDs", async () => {
		const { getAiSkillUsageTimelineItemId, logAiSkillUsageTimeline } =
			await skillUsageTimelineModulePromise;

		await logAiSkillUsageTimeline({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			workflowRunId: "wf-deterministic",
			triggerMessageId: "msg-1",
			usedCustomSkills: [{ name: "refunds.md" }],
		});

		const createCall = createTimelineItemMock.mock.calls[0]?.[0] as {
			item: { id: string };
		};
		expect(createCall?.item.id).toBe(
			getAiSkillUsageTimelineItemId("wf-deterministic")
		);
	});

	it("skips timeline logging when no custom skills were used", async () => {
		const { logAiSkillUsageTimeline } = await skillUsageTimelineModulePromise;

		await logAiSkillUsageTimeline({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			workflowRunId: "wf-empty",
			triggerMessageId: "msg-1",
			usedCustomSkills: [],
		});

		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(updateTimelineItemMock).not.toHaveBeenCalled();
	});

	it("updates existing timeline rows on duplicate-key create failures", async () => {
		const { getAiSkillUsageTimelineItemId, logAiSkillUsageTimeline } =
			await skillUsageTimelineModulePromise;

		createTimelineItemMock.mockRejectedValueOnce({
			code: "23505",
		});

		await logAiSkillUsageTimeline({
			db: {} as never,
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			visitorId: "visitor-1",
			aiAgentId: "ai-1",
			workflowRunId: "wf-duplicate",
			triggerMessageId: "msg-1",
			usedCustomSkills: [{ name: "refunds.md" }],
		});

		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		expect(updateTimelineItemMock).toHaveBeenCalledTimes(1);
		const updateCall = updateTimelineItemMock.mock.calls[0]?.[0] as {
			itemId: string;
			item: { tool: string };
		};
		expect(updateCall?.itemId).toBe(
			getAiSkillUsageTimelineItemId("wf-duplicate")
		);
		expect(updateCall?.item.tool).toBe("aiSkillUsage");
	});
});
