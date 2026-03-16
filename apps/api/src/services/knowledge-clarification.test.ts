import { beforeEach, describe, expect, it, mock } from "bun:test";

const getAiAgentForWebsiteMock = mock(async () => null);
const getConversationByIdMock = mock(async () => null);
const getConversationTimelineItemsMock = mock(async () => ({ items: [] }));
const createKnowledgeClarificationRequestMock = mock(async () => null);
const getActiveKnowledgeClarificationForConversationMock = mock(
	async () => null
);
const listKnowledgeClarificationTurnsMock = mock(async () => []);
const updateKnowledgeClarificationRequestMock = mock(async () => null);
const createKnowledgeClarificationTurnMock = mock(async () => null);
const getKnowledgeByIdMock = mock(async () => null);
const createModelMock = mock((modelId: string) => ({ modelId }));
const generateTextMock = mock((async () => ({
	output: null,
	usage: undefined,
})) as (...args: unknown[]) => Promise<unknown>);
const outputObjectMock = mock((value: unknown) => value);
const resolveModelForExecutionMock = mock((modelId: string) => ({
	modelIdOriginal: modelId,
	modelIdResolved: modelId,
	modelMigrationApplied: false,
}));
const realtimeEmitMock = mock(async () => {});
const trackGenerationUsageMock = mock(async () => ({
	usageTokens: {
		inputTokens: 120,
		outputTokens: 40,
		totalTokens: 160,
		source: "provider" as const,
	},
	creditUsage: {
		totalCredits: 1,
		mode: "normal" as const,
		ingestStatus: "ingested" as const,
	},
}));
const createTimelineItemMock = mock(async () => null);
const ulidMock = mock(() => "usage_evt_1");

mock.module("@api/db/queries/ai-agent", () => ({
	getAiAgentForWebsite: getAiAgentForWebsiteMock,
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
	getConversationTimelineItems: getConversationTimelineItemsMock,
}));

mock.module("@api/db/queries/knowledge-clarification", () => ({
	createKnowledgeClarificationRequest: createKnowledgeClarificationRequestMock,
	getActiveKnowledgeClarificationForConversation:
		getActiveKnowledgeClarificationForConversationMock,
	listKnowledgeClarificationTurns: listKnowledgeClarificationTurnsMock,
	updateKnowledgeClarificationRequest: updateKnowledgeClarificationRequestMock,
	createKnowledgeClarificationTurn: createKnowledgeClarificationTurnMock,
}));

mock.module("@api/db/queries/knowledge", () => ({
	getKnowledgeById: getKnowledgeByIdMock,
}));

mock.module("@api/lib/ai", () => ({
	createModel: createModelMock,
	generateText: generateTextMock,
	Output: {
		object: outputObjectMock,
	},
}));

mock.module("@api/lib/ai-credits/config", () => ({
	resolveModelForExecution: resolveModelForExecutionMock,
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: realtimeEmitMock,
	},
}));

mock.module("@api/ai-pipeline/shared/usage", () => ({
	trackGenerationUsage: trackGenerationUsageMock,
}));

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
}));

mock.module("ulid", () => ({
	ulid: ulidMock,
}));

const modulePromise = import("./knowledge-clarification");

function createContextSnapshot(overrides: Record<string, unknown> = {}) {
	return {
		sourceTrigger: {
			messageId: "msg_1",
			text: "When does the billing change take effect?",
			senderType: "visitor",
			visibility: "public",
			createdAt: "2026-03-13T09:55:00.000Z",
		},
		relevantTranscript: [
			{
				messageId: "msg_1",
				content: "When does the billing change take effect?",
				senderType: "visitor",
				visibility: "public",
				timestamp: "2026-03-13T09:55:00.000Z",
			},
			{
				messageId: "msg_2",
				content: "I think it should wait until the next invoice.",
				senderType: "human_agent",
				visibility: "public",
				timestamp: "2026-03-13T09:56:00.000Z",
			},
		],
		kbSearchEvidence: [],
		linkedFaq: null,
		...overrides,
	} as never;
}

function createAiAgent(overrides: Record<string, unknown> = {}) {
	return {
		id: "agent_1",
		organizationId: "org_1",
		websiteId: "site_1",
		name: "Support Agent",
		model: "moonshotai/kimi-k2-0905",
		basePrompt: "You are helpful.",
		temperature: 0.4,
		maxOutputTokens: 1200,
		behaviorSettings: {},
		...overrides,
	} as never;
}

function createConversation(overrides: Record<string, unknown> = {}) {
	return {
		id: "conv_1",
		organizationId: "org_1",
		websiteId: "site_1",
		visitorId: "visitor_1",
		...overrides,
	} as never;
}

function createRequest(overrides: Record<string, unknown> = {}) {
	return {
		id: "clar_req_1",
		organizationId: "org_1",
		websiteId: "site_1",
		aiAgentId: "agent_1",
		conversationId: "conv_1",
		source: "conversation",
		status: "awaiting_answer",
		topicSummary: "Clarify billing timing",
		stepIndex: 1,
		maxSteps: 3,
		contextSnapshot: createContextSnapshot(),
		targetKnowledgeId: null,
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-03-13T10:00:00.000Z",
		updatedAt: "2026-03-13T10:00:00.000Z",
		...overrides,
	} as never;
}

function createTurn(overrides: Record<string, unknown> = {}) {
	return {
		id: "turn_1",
		requestId: "clar_req_1",
		role: "ai_question",
		question: "When does the billing change take effect?",
		suggestedAnswers: [
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		],
		selectedAnswer: null,
		freeAnswer: null,
		createdAt: "2026-03-13T10:00:00.000Z",
		updatedAt: "2026-03-13T10:00:00.000Z",
		...overrides,
	} as never;
}

function createFaqKnowledge(overrides: Record<string, unknown> = {}) {
	return {
		id: "knowledge_1",
		organizationId: "org_1",
		websiteId: "site_1",
		aiAgentId: "agent_1",
		type: "faq",
		sourceTitle: "When do billing changes apply?",
		payload: {
			question: "When do billing changes apply?",
			answer: "Billing changes apply at the next billing cycle.",
			categories: ["Billing"],
			relatedQuestions: ["Can I make a billing change immediately?"],
		},
		...overrides,
	} as never;
}

describe("knowledge clarification usage tracking", () => {
	beforeEach(() => {
		getAiAgentForWebsiteMock.mockReset();
		getConversationByIdMock.mockReset();
		getConversationTimelineItemsMock.mockReset();
		createKnowledgeClarificationRequestMock.mockReset();
		getActiveKnowledgeClarificationForConversationMock.mockReset();
		listKnowledgeClarificationTurnsMock.mockReset();
		updateKnowledgeClarificationRequestMock.mockReset();
		createKnowledgeClarificationTurnMock.mockReset();
		getKnowledgeByIdMock.mockReset();
		createModelMock.mockReset();
		generateTextMock.mockReset();
		outputObjectMock.mockReset();
		resolveModelForExecutionMock.mockReset();
		realtimeEmitMock.mockReset();
		trackGenerationUsageMock.mockReset();
		createTimelineItemMock.mockReset();
		ulidMock.mockReset();

		getConversationTimelineItemsMock.mockResolvedValue({ items: [] });
		createModelMock.mockImplementation((modelId: string) => ({ modelId }));
		outputObjectMock.mockImplementation((value: unknown) => value);
		resolveModelForExecutionMock.mockImplementation((modelId: string) => ({
			modelIdOriginal: modelId,
			modelIdResolved: modelId,
			modelMigrationApplied: false,
		}));
		trackGenerationUsageMock.mockResolvedValue({
			usageTokens: {
				inputTokens: 120,
				outputTokens: 40,
				totalTokens: 160,
				source: "provider",
			},
			creditUsage: {
				totalCredits: 1,
				mode: "normal",
				ingestStatus: "ingested",
			},
		});
		ulidMock.mockImplementation(() => "usage_evt_1");
	});

	it("does not bill when an existing unanswered clarification step is reused", async () => {
		const { startConversationKnowledgeClarification } = await modulePromise;
		const request = createRequest();

		getActiveKnowledgeClarificationForConversationMock.mockResolvedValue(
			request
		);
		listKnowledgeClarificationTurnsMock.mockResolvedValue([createTurn()]);

		const result = await startConversationKnowledgeClarification({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgent: createAiAgent(),
			conversation: createConversation(),
			topicSummary: "Clarify billing timing",
			actor: {
				aiAgentId: "agent_1",
			},
		});

		expect(result.created).toBe(false);
		expect(result.step.kind).toBe("question");
		expect(generateTextMock).not.toHaveBeenCalled();
		expect(trackGenerationUsageMock).not.toHaveBeenCalled();
	});

	it("keeps deferred unanswered questions visible in serialized requests", async () => {
		const { serializeKnowledgeClarificationRequest } = await modulePromise;
		const serialized = serializeKnowledgeClarificationRequest({
			request: createRequest({
				status: "deferred",
			}),
			turns: [createTurn()],
		});

		expect(serialized.currentQuestion).toBe(
			"When does the billing change take effect?"
		);
		expect(serialized.currentSuggestedAnswers).toEqual([
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		]);
	});

	it("tracks clarification-question usage when the model returns the next question", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
		});
		const nextQuestionTurn = createTurn({
			question: "When does the billing change take effect?",
		});

		listKnowledgeClarificationTurnsMock
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([nextQuestionTurn]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "question",
				continueClarifying: true,
				topicSummary: "Clarify billing timing",
				missingFact: "Whether the change is immediate or next-cycle",
				whyItMatters: "That detail determines the final FAQ answer.",
				groundingSource: "topic_anchor",
				groundingSnippet: "Clarify billing timing",
				question: "When does the billing change take effect?",
				suggestedAnswers: [
					"Immediately",
					"At the next billing cycle",
					"It depends on the plan",
				],
			},
			usage: {
				inputTokens: 120,
				outputTokens: 40,
				totalTokens: 160,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "awaiting_answer",
				stepIndex: 1,
				topicSummary: "Clarify billing timing",
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		const usageCall = trackGenerationUsageMock.mock.calls[0] as unknown as
			| [Record<string, unknown>]
			| undefined;

		expect(step.kind).toBe("question");
		expect(trackGenerationUsageMock).toHaveBeenCalledTimes(1);
		expect(usageCall?.[0]).toMatchObject({
			conversationId: "conv_1",
			visitorId: "visitor_1",
			aiAgentId: "agent_1",
			usageEventId: "usage_evt_1",
			triggerMessageId: "clar_req_1",
			source: "knowledge_clarification",
			phase: "clarification_question",
			knowledgeClarificationRequestId: "clar_req_1",
			knowledgeClarificationStepIndex: 1,
		});
	});

	it("includes skipped questions in the clarification history sent back to the model", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 1,
		});
		const historyTurns = [
			createTurn({
				question: "Does the billing change immediately?",
			}),
			createTurn({
				id: "turn_2",
				role: "human_skip",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: null,
				freeAnswer: null,
			}),
		];
		const nextQuestionTurn = createTurn({
			id: "turn_3",
			question: "Should the change wait for the next billing cycle?",
		});

		listKnowledgeClarificationTurnsMock
			.mockResolvedValueOnce(historyTurns)
			.mockResolvedValueOnce([...historyTurns, nextQuestionTurn]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "question",
				continueClarifying: true,
				topicSummary: "Clarify billing timing",
				missingFact:
					"Whether the billing change always waits for the next cycle",
				whyItMatters: "That determines how the FAQ should describe timing.",
				groundingSource: "latest_exchange",
				groundingSnippet: "Does the billing change immediately?",
				question: "Should the change wait for the next billing cycle?",
				suggestedAnswers: [
					"Yes, always",
					"No, it is immediate",
					"It depends on the plan",
				],
			},
			usage: {
				inputTokens: 140,
				outputTokens: 45,
				totalTokens: 185,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "awaiting_answer",
				stepIndex: 2,
				topicSummary: "Clarify billing timing",
			})
		);

		await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		const promptCall = generateTextMock.mock.calls[0] as
			| [Record<string, unknown>]
			| undefined;

		expect(promptCall?.[0]?.prompt).toContain("Skipped by teammate");
	});

	it("tracks faq-draft-generation usage when the model returns a draft faq", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 2,
			updatedAt: "2026-03-13T10:05:00.000Z",
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([
			createTurn(),
			createTurn({
				id: "turn_2",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "At the next billing cycle",
			}),
		]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary: "Clarify billing timing",
				missingFact: "Exact billing timing",
				whyItMatters: "The FAQ needs a single grounded timing rule.",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 180,
				outputTokens: 60,
				totalTokens: 240,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 2,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		const usageCall = trackGenerationUsageMock.mock.calls[0] as unknown as
			| [Record<string, unknown>]
			| undefined;

		expect(step.kind).toBe("draft_ready");
		expect(trackGenerationUsageMock).toHaveBeenCalledTimes(1);
		expect(usageCall?.[0]).toMatchObject({
			conversationId: "conv_1",
			visitorId: "visitor_1",
			aiAgentId: "agent_1",
			usageEventId: "usage_evt_1",
			triggerMessageId: "clar_req_1",
			source: "knowledge_clarification",
			phase: "faq_draft_generation",
			knowledgeClarificationRequestId: "clar_req_1",
			knowledgeClarificationStepIndex: 2,
		});
	});

	it("falls back to a draft when the next question repeats an earlier clarification", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 1,
		});
		const historyTurns = [
			createTurn({
				question: "Does the billing change immediately?",
			}),
			createTurn({
				id: "turn_2",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "At the next billing cycle",
			}),
		];

		listKnowledgeClarificationTurnsMock.mockResolvedValue(historyTurns);
		generateTextMock
			.mockResolvedValueOnce({
				output: {
					kind: "question",
					continueClarifying: true,
					topicSummary: "Clarify billing timing",
					missingFact: "Whether billing changes immediately",
					whyItMatters: "That controls the FAQ answer.",
					groundingSource: "latest_exchange",
					groundingSnippet: "Does the billing change immediately?",
					question: "Does the billing change immediately?",
					suggestedAnswers: [
						"Immediately",
						"At the next billing cycle",
						"It depends on the plan",
					],
				},
				usage: {
					inputTokens: 120,
					outputTokens: 40,
					totalTokens: 160,
				},
			})
			.mockResolvedValueOnce({
				output: {
					kind: "draft_ready",
					continueClarifying: false,
					topicSummary: "Clarify billing timing",
					missingFact: "Exact billing timing",
					whyItMatters: "The answer is already grounded enough to draft.",
					draftFaqPayload: {
						title: "Billing timing",
						question: "When does a billing change take effect?",
						answer: "Billing changes apply at the next billing cycle.",
						categories: ["Billing"],
						relatedQuestions: [],
					},
				},
				usage: {
					inputTokens: 80,
					outputTokens: 30,
					totalTokens: 110,
				},
			});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 1,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});
		const usageCall = trackGenerationUsageMock.mock.calls[0] as unknown as
			| [Record<string, unknown>]
			| undefined;

		expect(step.kind).toBe("draft_ready");
		expect(generateTextMock).toHaveBeenCalledTimes(2);
		expect(trackGenerationUsageMock).toHaveBeenCalledTimes(1);
		expect(usageCall?.[0]).toMatchObject({
			phase: "faq_draft_generation",
		});
	});

	it("falls back to a draft when a follow-up is not grounded in the latest answer", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 1,
		});
		const historyTurns = [
			createTurn({
				question: "When does the billing change take effect?",
			}),
			createTurn({
				id: "turn_2",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "At the next billing cycle",
			}),
		];

		listKnowledgeClarificationTurnsMock.mockResolvedValue(historyTurns);
		generateTextMock
			.mockResolvedValueOnce({
				output: {
					kind: "question",
					continueClarifying: true,
					topicSummary: "Clarify billing timing",
					missingFact: "Whether annual plans are an exception",
					whyItMatters: "That would materially change the FAQ answer.",
					groundingSource: "topic_anchor",
					groundingSnippet: "Clarify billing timing",
					question: "Are annual plans handled differently?",
					suggestedAnswers: [
						"No, same rule",
						"Yes, they are different",
						"It depends on the plan",
					],
				},
				usage: {
					inputTokens: 120,
					outputTokens: 40,
					totalTokens: 160,
				},
			})
			.mockResolvedValueOnce({
				output: {
					kind: "draft_ready",
					continueClarifying: false,
					topicSummary: "Clarify billing timing",
					missingFact: "No additional grounded gap remains",
					whyItMatters:
						"The latest answer is specific enough for a narrow draft.",
					draftFaqPayload: {
						title: "Billing timing",
						question: "When does a billing change take effect?",
						answer: "Billing changes apply at the next billing cycle.",
						categories: ["Billing"],
						relatedQuestions: [],
					},
				},
				usage: {
					inputTokens: 80,
					outputTokens: 30,
					totalTokens: 110,
				},
			});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 1,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		expect(step.kind).toBe("draft_ready");
		expect(generateTextMock).toHaveBeenCalledTimes(2);
	});

	it("goes straight to a draft when the latest answer already resolves the gap", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 1,
		});
		const historyTurns = [
			createTurn({
				question: "When does the billing change take effect?",
			}),
			createTurn({
				id: "turn_2",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "At the next billing cycle",
			}),
		];

		listKnowledgeClarificationTurnsMock.mockResolvedValue(historyTurns);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary: "Clarify billing timing",
				missingFact: "No additional grounded gap remains",
				whyItMatters: "The latest answer already resolves the material fact.",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 80,
				outputTokens: 30,
				totalTokens: 110,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 1,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		expect(step.kind).toBe("draft_ready");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});

	it("keeps transcript claims separate from grounded facts in the model prompt", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 0,
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary: "Clarify billing timing",
				missingFact: "No additional grounded gap remains",
				whyItMatters: "The prompt should distinguish facts from claims.",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 180,
				outputTokens: 60,
				totalTokens: 240,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 0,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		const promptCall = generateTextMock.mock.calls[0] as
			| [Record<string, unknown>]
			| undefined;
		const prompt = String(promptCall?.[0]?.prompt ?? "");

		expect(prompt).toContain(
			"Transcript claims:\n- Visitor claim: When does the billing change take effect?"
		);
		expect(prompt).not.toContain(
			"Grounded facts:\n- Visitor claim: When does the billing change take effect?"
		);
	});

	it("forces a draft once the clarification flow has already asked three questions", async () => {
		const { runKnowledgeClarificationStep } = await modulePromise;
		const request = createRequest({
			status: "analyzing",
			stepIndex: 3,
			maxSteps: 3,
		});

		listKnowledgeClarificationTurnsMock.mockResolvedValue([
			createTurn({ id: "turn_1", question: "Question 1?" }),
			createTurn({
				id: "turn_2",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "Answer 1",
			}),
			createTurn({ id: "turn_3", question: "Question 2?" }),
			createTurn({
				id: "turn_4",
				role: "human_answer",
				question: null,
				suggestedAnswers: null,
				selectedAnswer: "Answer 2",
			}),
			createTurn({ id: "turn_5", question: "Question 3?" }),
		]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: true,
				topicSummary: "Clarify billing timing",
				missingFact: "Any remaining edge cases",
				whyItMatters: "The hard cap has been reached.",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			},
			usage: {
				inputTokens: 180,
				outputTokens: 60,
				totalTokens: 240,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				status: "draft_ready",
				stepIndex: 3,
				maxSteps: 3,
				draftFaqPayload: {
					title: "Billing timing",
					question: "When does a billing change take effect?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: [],
				},
			})
		);

		const step = await runKnowledgeClarificationStep({
			db: {} as never,
			request,
			aiAgent: createAiAgent(),
			conversation: createConversation(),
		});

		const promptCall = generateTextMock.mock.calls[0] as
			| [Record<string, unknown>]
			| undefined;

		expect(step.kind).toBe("draft_ready");
		expect(promptCall?.[0]?.prompt).toContain("Return draft_ready now.");
	});

	it("stores linked FAQ context when deepening an existing FAQ", async () => {
		const { startFaqKnowledgeClarification } = await modulePromise;
		const draftRequest = createRequest({
			conversationId: null,
			source: "faq",
			status: "analyzing",
			topicSummary:
				"Clarify the exact FAQ answer for: When do billing changes apply?",
			targetKnowledgeId: "knowledge_1",
		});

		createKnowledgeClarificationRequestMock.mockResolvedValue(draftRequest);
		listKnowledgeClarificationTurnsMock.mockResolvedValue([]);
		generateTextMock.mockResolvedValue({
			output: {
				kind: "draft_ready",
				continueClarifying: false,
				topicSummary:
					"Clarify the exact FAQ answer for: When do billing changes apply?",
				missingFact: "Whether billing changes ever apply immediately",
				whyItMatters: "That keeps the FAQ precise without overpromising.",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When do billing changes apply?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: ["Can I make a billing change immediately?"],
				},
			},
			usage: {
				inputTokens: 140,
				outputTokens: 55,
				totalTokens: 195,
			},
		});
		updateKnowledgeClarificationRequestMock.mockResolvedValue(
			createRequest({
				conversationId: null,
				source: "faq",
				status: "draft_ready",
				topicSummary:
					"Clarify the exact FAQ answer for: When do billing changes apply?",
				targetKnowledgeId: "knowledge_1",
				draftFaqPayload: {
					title: "Billing timing",
					question: "When do billing changes apply?",
					answer: "Billing changes apply at the next billing cycle.",
					categories: ["Billing"],
					relatedQuestions: ["Can I make a billing change immediately?"],
				},
			})
		);

		const result = await startFaqKnowledgeClarification({
			db: {} as never,
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgent: createAiAgent(),
			topicSummary: "Clarify FAQ: When do billing changes apply?",
			targetKnowledge: createFaqKnowledge(),
		});

		expect(result.step.kind).toBe("draft_ready");
		expect(createKnowledgeClarificationRequestMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				maxSteps: 3,
				topicSummary:
					"Clarify the exact FAQ answer for: When do billing changes apply?",
				contextSnapshot: expect.objectContaining({
					linkedFaq: expect.objectContaining({
						question: "When do billing changes apply?",
					}),
				}),
			})
		);
	});
});
