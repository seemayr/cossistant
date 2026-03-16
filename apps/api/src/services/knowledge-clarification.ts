import { buildConversationTranscript } from "@api/ai-pipeline/primary-pipeline/steps/intake/history";
import { trackGenerationUsage } from "@api/ai-pipeline/shared/usage";
import type { Database } from "@api/db";
import { getAiAgentForWebsite } from "@api/db/queries/ai-agent";
import { getConversationById } from "@api/db/queries/conversation";
import { getKnowledgeById } from "@api/db/queries/knowledge";
import {
	createKnowledgeClarificationRequest,
	createKnowledgeClarificationTurn,
	getActiveKnowledgeClarificationForConversation,
	listKnowledgeClarificationTurns,
	updateKnowledgeClarificationRequest,
} from "@api/db/queries/knowledge-clarification";
import type { AiAgentSelect } from "@api/db/schema/ai-agent";
import type { ConversationSelect } from "@api/db/schema/conversation";
import type { KnowledgeSelect } from "@api/db/schema/knowledge";
import type {
	KnowledgeClarificationRequestSelect,
	KnowledgeClarificationTurnSelect,
} from "@api/db/schema/knowledge-clarification";
import { createModel, generateText, Output } from "@api/lib/ai";
import { resolveModelForExecution } from "@api/lib/ai-credits/config";
import {
	buildConversationClarificationContextSnapshot,
	buildFaqClarificationContextSnapshot,
	buildSpecificClarificationTopicSummary,
	extractLinkedFaqSnapshot,
	type KnowledgeClarificationContextSnapshot,
} from "@api/lib/knowledge-clarification-context";
import { realtime } from "@api/realtime/emitter";
import {
	buildClarificationRelevancePacket,
	CLARIFICATION_QUESTION_GROUNDING_SOURCES,
	validateClarificationQuestionCandidate,
} from "@api/services/knowledge-clarification-relevance";
import {
	buildConversationClarificationSummary,
	getPendingClarificationQuestionTurn,
} from "@api/utils/knowledge-clarification-summary";
import { createTimelineItem } from "@api/utils/timeline-item";
import {
	ConversationTimelineType,
	type KnowledgeClarificationDraftFaq,
	type KnowledgeClarificationRequest,
	type KnowledgeClarificationStepResponse,
	TimelineItemVisibility,
} from "@cossistant/types";
import { ulid } from "ulid";
import { z } from "zod";

const DEFAULT_MAX_CLARIFICATION_STEPS = 3;

const clarificationOutputBaseSchema = z.object({
	topicSummary: z.string().min(1).max(400),
	missingFact: z.string().min(1).max(280),
	whyItMatters: z.string().min(1).max(400),
});

const clarificationQuestionOutputSchema = clarificationOutputBaseSchema.extend({
	kind: z.literal("question"),
	continueClarifying: z.literal(true),
	groundingSource: z.enum(CLARIFICATION_QUESTION_GROUNDING_SOURCES),
	groundingSnippet: z.string().min(1).max(280),
	question: z.string().min(1).max(500),
	suggestedAnswers: z.array(z.string().min(1).max(240)).length(3),
});

const clarificationDraftOutputSchema = clarificationOutputBaseSchema.extend({
	kind: z.literal("draft_ready"),
	continueClarifying: z.boolean(),
	draftFaqPayload: z.object({
		title: z.string().min(1).max(200).nullable().optional(),
		question: z.string().min(1).max(300),
		answer: z.string().min(1).max(6000),
		categories: z.array(z.string().min(1).max(80)).max(8).default([]),
		relatedQuestions: z.array(z.string().min(1).max(300)).max(8).default([]),
	}),
});

const clarificationOutputSchema = z.discriminatedUnion("kind", [
	clarificationQuestionOutputSchema,
	clarificationDraftOutputSchema,
]);

type ClarificationQuestionOutput = z.infer<
	typeof clarificationQuestionOutputSchema
>;
type ClarificationDraftOutput = z.infer<typeof clarificationDraftOutputSchema>;

type KnowledgeClarificationActor = {
	userId?: string | null;
	aiAgentId?: string | null;
};

type StartConversationKnowledgeClarificationParams = {
	db: Database;
	organizationId: string;
	websiteId: string;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
	topicSummary: string;
	actor: KnowledgeClarificationActor;
	contextSnapshot?: KnowledgeClarificationContextSnapshot | null;
	maxSteps?: number;
};

type StartFaqKnowledgeClarificationParams = {
	db: Database;
	organizationId: string;
	websiteId: string;
	aiAgent: AiAgentSelect;
	topicSummary: string;
	targetKnowledge: KnowledgeSelect;
	contextSnapshot?: KnowledgeClarificationContextSnapshot | null;
	maxSteps?: number;
};

type RunKnowledgeClarificationStepParams = {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	conversation?: ConversationSelect | null;
	targetKnowledge?: KnowledgeSelect | null;
};

type ClarificationUsagePhase =
	| "clarification_question"
	| "faq_draft_generation";

type ClarificationGenerationResult = {
	output: ClarificationQuestionOutput | ClarificationDraftOutput;
	modelId: string;
	modelIdOriginal?: string;
	modelMigrationApplied?: boolean;
	providerUsage?:
		| {
				inputTokens?: number;
				outputTokens?: number;
				totalTokens?: number;
		  }
		| undefined;
};

function normalizeDraftFaq(
	draft: ClarificationDraftOutput["draftFaqPayload"]
): KnowledgeClarificationDraftFaq {
	return {
		title: draft.title ?? null,
		question: draft.question.trim(),
		answer: draft.answer.trim(),
		categories: [
			...new Set(draft.categories.map((value) => value.trim()).filter(Boolean)),
		],
		relatedQuestions: [
			...new Set(
				draft.relatedQuestions.map((value) => value.trim()).filter(Boolean)
			),
		],
	};
}

function getAiQuestionCount(turns: KnowledgeClarificationTurnSelect[]): number {
	return turns.filter((turn) => turn.role === "ai_question").length;
}

function formatPromptList(
	title: string,
	items: string[],
	emptyMessage: string
): string {
	return `${title}:\n${
		items.length > 0
			? items.map((item) => `- ${item}`).join("\n")
			: `- ${emptyMessage}`
	}`;
}

function mergeProviderUsage(
	...usages: Array<
		| {
				inputTokens?: number;
				outputTokens?: number;
				totalTokens?: number;
		  }
		| undefined
	>
):
	| {
			inputTokens?: number;
			outputTokens?: number;
			totalTokens?: number;
	  }
	| undefined {
	const merged: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	} = {};

	for (const usage of usages) {
		if (!usage) {
			continue;
		}

		merged.inputTokens = (merged.inputTokens ?? 0) + (usage.inputTokens ?? 0);
		merged.outputTokens =
			(merged.outputTokens ?? 0) + (usage.outputTokens ?? 0);
		merged.totalTokens = (merged.totalTokens ?? 0) + (usage.totalTokens ?? 0);
	}

	return merged.inputTokens || merged.outputTokens || merged.totalTokens
		? merged
		: undefined;
}

async function resolveConversationForAudit(
	db: Database,
	request: KnowledgeClarificationRequestSelect,
	conversation?: ConversationSelect | null
): Promise<ConversationSelect | null> {
	if (conversation) {
		return conversation;
	}

	if (!request.conversationId) {
		return null;
	}

	return (
		(await getConversationById(db, {
			conversationId: request.conversationId,
		})) ?? null
	);
}

export async function createKnowledgeClarificationAuditEntry(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	text: string;
	actor: KnowledgeClarificationActor;
	conversation?: ConversationSelect | null;
}): Promise<void> {
	const conversation = await resolveConversationForAudit(
		params.db,
		params.request,
		params.conversation
	);
	if (!conversation) {
		return;
	}

	await createTimelineItem({
		db: params.db,
		organizationId: params.request.organizationId,
		websiteId: params.request.websiteId,
		conversationId: conversation.id,
		conversationOwnerVisitorId: conversation.visitorId,
		item: {
			type: ConversationTimelineType.EVENT,
			visibility: TimelineItemVisibility.PRIVATE,
			text: params.text,
			parts: [{ type: "text", text: params.text }],
			userId: params.actor.userId ?? null,
			aiAgentId: params.actor.aiAgentId ?? null,
		},
	});
}

export async function emitConversationClarificationUpdate(params: {
	db: Database;
	conversation: ConversationSelect | null;
	request:
		| Pick<
				KnowledgeClarificationRequest,
				| "id"
				| "conversationId"
				| "status"
				| "topicSummary"
				| "stepIndex"
				| "maxSteps"
				| "updatedAt"
		  >
		| KnowledgeClarificationRequestSelect
		| null;
	aiAgentId: string | null;
	turns?: KnowledgeClarificationTurnSelect[];
}): Promise<void> {
	if (!params.conversation) {
		return;
	}

	let turns = params.turns ?? [];
	if (
		params.request &&
		params.request.status === "awaiting_answer" &&
		!params.turns
	) {
		turns = await listKnowledgeClarificationTurns(params.db, {
			requestId: params.request.id,
		});
	}

	await realtime.emit("conversationUpdated", {
		websiteId: params.conversation.websiteId,
		organizationId: params.conversation.organizationId,
		visitorId: params.conversation.visitorId,
		userId: null,
		conversationId: params.conversation.id,
		updates: {
			activeClarification: params.request
				? buildConversationClarificationSummary({
						request: params.request,
						turns,
					})
				: null,
		},
		aiAgentId: params.aiAgentId,
	});
}

export function serializeKnowledgeClarificationRequest(params: {
	request: KnowledgeClarificationRequestSelect;
	turns: KnowledgeClarificationTurnSelect[];
}): KnowledgeClarificationRequest {
	const currentQuestionTurn = getPendingClarificationQuestionTurn(params.turns);
	const shouldExposeCurrentQuestion =
		params.request.status === "awaiting_answer" ||
		params.request.status === "deferred";

	return {
		id: params.request.id,
		organizationId: params.request.organizationId,
		websiteId: params.request.websiteId,
		aiAgentId: params.request.aiAgentId,
		conversationId: params.request.conversationId,
		source: params.request.source,
		status: params.request.status,
		topicSummary: params.request.topicSummary,
		stepIndex: params.request.stepIndex,
		maxSteps: params.request.maxSteps,
		targetKnowledgeId: params.request.targetKnowledgeId,
		currentQuestion: shouldExposeCurrentQuestion
			? (currentQuestionTurn?.question ?? null)
			: null,
		currentSuggestedAnswers: shouldExposeCurrentQuestion
			? ((currentQuestionTurn?.suggestedAnswers as
					| [string, string, string]
					| null) ?? null)
			: null,
		draftFaqPayload:
			(params.request
				.draftFaqPayload as KnowledgeClarificationDraftFaq | null) ?? null,
		lastError: params.request.lastError,
		createdAt: params.request.createdAt,
		updatedAt: params.request.updatedAt,
	};
}

export function toKnowledgeClarificationStep(params: {
	request: KnowledgeClarificationRequestSelect;
	turns: KnowledgeClarificationTurnSelect[];
}): KnowledgeClarificationStepResponse | null {
	const serializedRequest = serializeKnowledgeClarificationRequest(params);

	if (serializedRequest.draftFaqPayload) {
		return {
			kind: "draft_ready",
			request: serializedRequest,
			draftFaqPayload: serializedRequest.draftFaqPayload,
		};
	}

	if (
		serializedRequest.currentQuestion &&
		serializedRequest.currentSuggestedAnswers
	) {
		return {
			kind: "question",
			request: serializedRequest,
			question: serializedRequest.currentQuestion,
			suggestedAnswers: serializedRequest.currentSuggestedAnswers,
		};
	}

	return null;
}

async function buildResolvedContextSnapshot(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	conversation?: ConversationSelect | null;
	targetKnowledge?: KnowledgeSelect | null;
}): Promise<KnowledgeClarificationContextSnapshot | null> {
	if (params.request.contextSnapshot) {
		return params.request.contextSnapshot;
	}

	const linkedFaq = extractLinkedFaqSnapshot(params.targetKnowledge ?? null);
	if (params.conversation) {
		const conversationHistory = await buildConversationTranscript(params.db, {
			conversationId: params.conversation.id,
			organizationId: params.request.organizationId,
			websiteId: params.request.websiteId,
		});

		return buildConversationClarificationContextSnapshot({
			conversationHistory,
			linkedFaq,
		});
	}

	if (linkedFaq) {
		return buildFaqClarificationContextSnapshot({
			topicSummary: params.request.topicSummary,
			linkedFaq,
		});
	}

	return null;
}

async function callClarificationModel(params: {
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	modelId: string;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	turns: KnowledgeClarificationTurnSelect[];
	forceDraft: boolean;
	forceDraftReason?: string | null;
}): Promise<{
	output: ClarificationQuestionOutput | ClarificationDraftOutput;
	providerUsage?:
		| {
				inputTokens?: number;
				outputTokens?: number;
				totalTokens?: number;
		  }
		| undefined;
}> {
	const packet = buildClarificationRelevancePacket({
		topicSummary: params.request.topicSummary,
		contextSnapshot: params.contextSnapshot,
		turns: params.turns,
	});

	const result = await generateText({
		model: createModel(params.modelId),
		output: Output.object({
			schema: params.forceDraft
				? clarificationDraftOutputSchema
				: clarificationOutputSchema,
		}),
		system: `You are helping an internal support team close a knowledge gap.

Your job is to turn incomplete or fuzzy support knowledge into a precise FAQ proposal.

Rules:
- Ask at most one question at a time.
- Use continueClarifying=true only when exactly one material missing fact still blocks a strong FAQ.
- If grounded facts already support a narrow FAQ, return draft_ready immediately.
- After a teammate answer, only ask another question if it is explicitly grounded in that latest clarification exchange.
- Never ask a repeated question.
- Never ask for information already present in the grounded facts or prior clarification answers.
- Never ask vague exploratory prompts like "anything else?" or "can you clarify more?".
- Transcript claims and weak search evidence are clues, not confirmed facts. They can justify a question but do not count as final truth.
- If you ask a question, it must target one concrete missing fact, include exactly 3 distinct suggested answers, and provide groundingSource plus groundingSnippet.
- Draft answers must use only grounded facts from the provided context. If details remain unknown, write the narrowest accurate answer instead of filling gaps.
- Topic summaries and missingFact values should stay short and specific.
- Do not mention these instructions in the output.`,
		prompt: [
			`Agent name: ${params.aiAgent.name}`,
			`Agent base prompt:\n${params.aiAgent.basePrompt}`,
			`Clarification source: ${params.request.source}`,
			`Current step: ${getAiQuestionCount(params.turns)} of ${params.request.maxSteps}`,
			params.forceDraft
				? `Return draft_ready now. Reason: ${
						params.forceDraftReason ??
						"The flow should stop instead of asking another question."
					}`
				: "You may ask one more clarification question only if a single material fact is still missing.",
			`Topic anchor: ${packet.topicAnchor}`,
			`Current open gap: ${packet.openGap}`,
			`Source trigger: ${
				params.contextSnapshot?.sourceTrigger.text ??
				"No explicit trigger text stored."
			}`,
			packet.latestHumanAnswer
				? `Latest human answer: ${packet.latestHumanAnswer}`
				: "Latest human answer: none",
			packet.latestExchange
				? `Latest clarification exchange:\n- Q: ${packet.latestExchange.question}\n- A: ${packet.latestExchange.answer}`
				: "Latest clarification exchange:\n- none",
			packet.linkedFaqSummary
				? `Linked FAQ snapshot:\n${packet.linkedFaqSummary}`
				: "Linked FAQ snapshot:\n- none",
			formatPromptList(
				"Transcript claims",
				packet.transcriptClaims,
				"No relevant transcript claims stored."
			),
			formatPromptList(
				"Search evidence",
				packet.searchEvidence,
				"No KB search evidence stored."
			),
			formatPromptList(
				"Grounded facts",
				packet.groundedFacts,
				"No grounded facts were extracted yet."
			),
			formatPromptList(
				"Answered clarification questions",
				packet.answeredQuestions.map(
					(entry) => `Q: ${entry.question} | A: ${entry.answer}`
				),
				"No prior clarification answers."
			),
			formatPromptList(
				"Disallowed questions",
				packet.disallowedQuestions,
				"No explicit disallowed questions."
			),
			"When returning draft_ready, continueClarifying should normally be false.",
		].join("\n\n"),
		temperature: params.aiAgent.temperature ?? 0.4,
		maxOutputTokens: Math.min(params.aiAgent.maxOutputTokens ?? 1200, 1200),
	});

	if (!result.output) {
		throw new Error("Clarification model returned no structured output.");
	}

	return {
		output: result.output,
		providerUsage: result.usage,
	};
}

async function generateClarificationOutput(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	conversation?: ConversationSelect | null;
	targetKnowledge?: KnowledgeSelect | null;
	turns: KnowledgeClarificationTurnSelect[];
}): Promise<ClarificationGenerationResult> {
	const modelResolution = resolveModelForExecution(params.aiAgent.model);
	const aiQuestionCount = getAiQuestionCount(params.turns);
	const forceDraft = aiQuestionCount >= params.request.maxSteps;
	const contextSnapshot = await buildResolvedContextSnapshot({
		db: params.db,
		request: params.request,
		conversation: params.conversation ?? null,
		targetKnowledge: params.targetKnowledge ?? null,
	});

	const firstPass = await callClarificationModel({
		request: params.request,
		aiAgent: params.aiAgent,
		modelId: modelResolution.modelIdResolved,
		contextSnapshot,
		turns: params.turns,
		forceDraft,
	});

	let output = firstPass.output;
	let providerUsage = firstPass.providerUsage;

	if (forceDraft && output.kind !== "draft_ready") {
		throw new Error(
			"Clarification model returned a question after the draft-only limit."
		);
	}

	if (output.kind === "question") {
		const packet = buildClarificationRelevancePacket({
			topicSummary: params.request.topicSummary,
			contextSnapshot,
			turns: params.turns,
		});
		const validation = validateClarificationQuestionCandidate({
			question: output.question,
			missingFact: output.missingFact,
			whyItMatters: output.whyItMatters,
			groundingSource: output.groundingSource,
			groundingSnippet: output.groundingSnippet,
			packet,
		});

		if (!validation.valid) {
			const fallbackDraft = await callClarificationModel({
				request: {
					...params.request,
					topicSummary: buildSpecificClarificationTopicSummary({
						triggerText: contextSnapshot?.sourceTrigger.text,
						searchEvidence: contextSnapshot?.kbSearchEvidence,
						linkedFaq: contextSnapshot?.linkedFaq,
						fallback: output.missingFact || params.request.topicSummary,
					}),
				},
				aiAgent: params.aiAgent,
				modelId: modelResolution.modelIdResolved,
				contextSnapshot,
				turns: params.turns,
				forceDraft: true,
				forceDraftReason: validation.reason,
			});

			output = fallbackDraft.output;
			providerUsage = mergeProviderUsage(
				firstPass.providerUsage,
				fallbackDraft.providerUsage
			);
		}
	}

	return {
		output,
		modelId: modelResolution.modelIdResolved,
		modelIdOriginal: modelResolution.modelIdOriginal,
		modelMigrationApplied: modelResolution.modelMigrationApplied,
		providerUsage,
	};
}

async function trackKnowledgeClarificationUsage(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	conversation?: ConversationSelect | null;
	generation: ClarificationGenerationResult;
	phase: ClarificationUsagePhase;
	stepIndex: number;
}): Promise<void> {
	await trackGenerationUsage({
		db: params.db,
		organizationId: params.request.organizationId,
		websiteId: params.request.websiteId,
		conversationId: params.conversation?.id,
		visitorId: params.conversation?.visitorId,
		aiAgentId: params.request.aiAgentId,
		usageEventId: ulid(),
		triggerMessageId: params.request.id,
		modelId: params.generation.modelId,
		modelIdOriginal: params.generation.modelIdOriginal,
		modelMigrationApplied: params.generation.modelMigrationApplied,
		providerUsage: params.generation.providerUsage,
		source: "knowledge_clarification",
		phase: params.phase,
		knowledgeClarificationRequestId: params.request.id,
		knowledgeClarificationStepIndex: params.stepIndex,
	});
}

export async function runKnowledgeClarificationStep(
	params: RunKnowledgeClarificationStepParams
): Promise<KnowledgeClarificationStepResponse> {
	const turns = await listKnowledgeClarificationTurns(params.db, {
		requestId: params.request.id,
	});

	try {
		const generation = await generateClarificationOutput({
			db: params.db,
			request: params.request,
			aiAgent: params.aiAgent,
			conversation: params.conversation ?? null,
			targetKnowledge: params.targetKnowledge ?? null,
			turns,
		});
		const output = generation.output;

		if (output.kind === "question") {
			const nextStepIndex = getAiQuestionCount(turns) + 1;
			await trackKnowledgeClarificationUsage({
				db: params.db,
				request: params.request,
				conversation: params.conversation ?? null,
				generation,
				phase: "clarification_question",
				stepIndex: nextStepIndex,
			});
			await createKnowledgeClarificationTurn(params.db, {
				requestId: params.request.id,
				role: "ai_question",
				question: output.question.trim(),
				suggestedAnswers: output.suggestedAnswers,
			});

			const updatedRequest = await updateKnowledgeClarificationRequest(
				params.db,
				{
					requestId: params.request.id,
					updates: {
						status: "awaiting_answer",
						stepIndex: nextStepIndex,
						topicSummary: output.topicSummary.trim(),
						draftFaqPayload: null,
						lastError: null,
					},
				}
			);

			if (!updatedRequest) {
				throw new Error("Failed to update clarification request.");
			}

			const updatedTurns = await listKnowledgeClarificationTurns(params.db, {
				requestId: params.request.id,
			});
			const step = toKnowledgeClarificationStep({
				request: updatedRequest,
				turns: updatedTurns,
			});
			if (!step) {
				throw new Error("Clarification question step could not be created.");
			}
			return step;
		}

		const normalizedDraft = normalizeDraftFaq(output.draftFaqPayload);
		await trackKnowledgeClarificationUsage({
			db: params.db,
			request: params.request,
			conversation: params.conversation ?? null,
			generation,
			phase: "faq_draft_generation",
			stepIndex: params.request.stepIndex,
		});
		const updatedRequest = await updateKnowledgeClarificationRequest(
			params.db,
			{
				requestId: params.request.id,
				updates: {
					status: "draft_ready",
					topicSummary: output.topicSummary.trim(),
					draftFaqPayload: normalizedDraft,
					lastError: null,
				},
			}
		);

		if (!updatedRequest) {
			throw new Error("Failed to store clarification draft.");
		}

		const step = toKnowledgeClarificationStep({
			request: updatedRequest,
			turns,
		});
		if (!step) {
			throw new Error("Clarification draft step could not be created.");
		}
		return step;
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to run clarification AI.";
		await updateKnowledgeClarificationRequest(params.db, {
			requestId: params.request.id,
			updates: {
				status: "deferred",
				lastError: message,
			},
		});
		throw error;
	}
}

async function getConversationClarificationSeedStep(params: {
	db: Database;
	request: KnowledgeClarificationRequestSelect;
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect;
}): Promise<KnowledgeClarificationStepResponse> {
	const turns = await listKnowledgeClarificationTurns(params.db, {
		requestId: params.request.id,
	});
	const existingStep = toKnowledgeClarificationStep({
		request: params.request,
		turns,
	});
	if (existingStep) {
		return existingStep;
	}

	await updateKnowledgeClarificationRequest(params.db, {
		requestId: params.request.id,
		updates: {
			status: "analyzing",
			lastError: null,
		},
	});

	return runKnowledgeClarificationStep({
		db: params.db,
		request: {
			...params.request,
			status: "analyzing",
			lastError: null,
		},
		aiAgent: params.aiAgent,
		conversation: params.conversation,
	});
}

export async function startConversationKnowledgeClarification(
	params: StartConversationKnowledgeClarificationParams
): Promise<{
	request: KnowledgeClarificationRequest;
	step: KnowledgeClarificationStepResponse;
	created: boolean;
}> {
	const existing = await getActiveKnowledgeClarificationForConversation(
		params.db,
		{
			conversationId: params.conversation.id,
			websiteId: params.websiteId,
		}
	);

	if (existing) {
		const step = await getConversationClarificationSeedStep({
			db: params.db,
			request: existing,
			aiAgent: params.aiAgent,
			conversation: params.conversation,
		});
		return {
			request: step.request,
			step,
			created: false,
		};
	}

	const contextSnapshot =
		params.contextSnapshot ??
		buildConversationClarificationContextSnapshot({
			conversationHistory: await buildConversationTranscript(params.db, {
				conversationId: params.conversation.id,
				organizationId: params.organizationId,
				websiteId: params.websiteId,
			}),
		});
	const topicSummary = buildSpecificClarificationTopicSummary({
		triggerText: contextSnapshot.sourceTrigger.text,
		searchEvidence: contextSnapshot.kbSearchEvidence,
		linkedFaq: contextSnapshot.linkedFaq,
		fallback: params.topicSummary,
	});
	const request = await createKnowledgeClarificationRequest(params.db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgent.id,
		conversationId: params.conversation.id,
		source: "conversation",
		status: "analyzing",
		topicSummary,
		contextSnapshot,
		maxSteps: params.maxSteps ?? DEFAULT_MAX_CLARIFICATION_STEPS,
	});

	await createKnowledgeClarificationAuditEntry({
		db: params.db,
		request,
		conversation: params.conversation,
		actor: params.actor,
		text: `Knowledge clarification started: ${request.topicSummary.trim()}`,
	});

	const step = await runKnowledgeClarificationStep({
		db: params.db,
		request,
		aiAgent: params.aiAgent,
		conversation: params.conversation,
	});

	return {
		request: step.request,
		step,
		created: true,
	};
}

export async function startFaqKnowledgeClarification(
	params: StartFaqKnowledgeClarificationParams
): Promise<{
	request: KnowledgeClarificationRequest;
	step: KnowledgeClarificationStepResponse;
}> {
	const contextSnapshot =
		params.contextSnapshot ??
		buildFaqClarificationContextSnapshot({
			topicSummary: params.topicSummary,
			linkedFaq: extractLinkedFaqSnapshot(params.targetKnowledge),
		});
	const topicSummary = buildSpecificClarificationTopicSummary({
		triggerText: contextSnapshot.sourceTrigger.text,
		searchEvidence: contextSnapshot.kbSearchEvidence,
		linkedFaq: contextSnapshot.linkedFaq,
		fallback: params.topicSummary,
	});
	const request = await createKnowledgeClarificationRequest(params.db, {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgent.id,
		source: "faq",
		status: "analyzing",
		topicSummary,
		contextSnapshot,
		maxSteps: params.maxSteps ?? DEFAULT_MAX_CLARIFICATION_STEPS,
		targetKnowledgeId: params.targetKnowledge.id,
	});

	const step = await runKnowledgeClarificationStep({
		db: params.db,
		request,
		aiAgent: params.aiAgent,
		targetKnowledge: params.targetKnowledge,
	});

	return {
		request: step.request,
		step,
	};
}

export async function loadKnowledgeClarificationRuntime(params: {
	db: Database;
	organizationId: string;
	websiteId: string;
	request: KnowledgeClarificationRequestSelect;
}): Promise<{
	aiAgent: AiAgentSelect;
	conversation: ConversationSelect | null;
	targetKnowledge: KnowledgeSelect | null;
}> {
	const [aiAgent, conversation, targetKnowledge] = await Promise.all([
		getAiAgentForWebsite(params.db, {
			websiteId: params.websiteId,
			organizationId: params.organizationId,
		}),
		params.request.conversationId
			? getConversationById(params.db, {
					conversationId: params.request.conversationId,
				})
			: Promise.resolve(null),
		params.request.targetKnowledgeId
			? getKnowledgeById(params.db, {
					id: params.request.targetKnowledgeId,
					websiteId: params.websiteId,
				})
			: Promise.resolve(null),
	]);

	if (!aiAgent) {
		throw new Error("AI agent not found for clarification request.");
	}

	return {
		aiAgent,
		conversation: conversation ?? null,
		targetKnowledge,
	};
}
