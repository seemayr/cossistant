import { describe, expect, it } from "bun:test";
import { getConversationState } from "./state";

describe("getConversationState", () => {
	it("starts assignee and participant queries in parallel", async () => {
		let selectCallCount = 0;
		let resolveAssignees!: (value: Array<{ userId: string }>) => void;
		let resolveParticipants!: (value: Array<{ userId: string }>) => void;

		const assigneesPromise = new Promise<Array<{ userId: string }>>(
			(resolve) => {
				resolveAssignees = (value) => resolve(value);
			}
		);
		const participantsPromise = new Promise<Array<{ userId: string }>>(
			(resolve) => {
				resolveParticipants = (value) => resolve(value);
			}
		);

		const db = {
			select: () => {
				selectCallCount++;
				const pending =
					selectCallCount === 1 ? assigneesPromise : participantsPromise;
				return {
					from: () => ({
						where: () => pending,
					}),
				};
			},
		};

		const statePromise = getConversationState(
			db as never,
			{ conversationId: "conv-1", organizationId: "org-1" },
			{
				escalatedAt: "2025-01-01T00:00:00.000Z",
				escalationHandledAt: null,
				escalationReason: "needs specialist",
			} as never
		);

		await Promise.resolve();
		expect(selectCallCount).toBe(2);

		resolveAssignees([{ userId: "user-1" }]);
		resolveParticipants([{ userId: "user-2" }]);

		const result = await statePromise;
		expect(result).toEqual({
			hasHumanAssignee: true,
			assigneeIds: ["user-1"],
			participantIds: ["user-2"],
			isEscalated: true,
			escalationReason: "needs specialist",
		});
	});

	it("keeps escalation false when escalation is handled", async () => {
		const db = {
			select: () => ({
				from: () => ({
					where: async () => [],
				}),
			}),
		};

		const result = await getConversationState(
			db as never,
			{ conversationId: "conv-1", organizationId: "org-1" },
			{
				escalatedAt: "2025-01-01T00:00:00.000Z",
				escalationHandledAt: "2025-01-01T00:01:00.000Z",
				escalationReason: null,
			} as never
		);

		expect(result.isEscalated).toBe(false);
		expect(result.escalationReason).toBeNull();
	});
});
