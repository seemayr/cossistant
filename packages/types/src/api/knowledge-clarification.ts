import { z } from "@hono/zod-openapi";
import {
	faqKnowledgePayloadSchema,
	knowledgeResponseSchema,
} from "./knowledge";

export const knowledgeClarificationSourceSchema = z
	.enum(["conversation", "faq"])
	.openapi({
		description: "How the clarification request was created.",
		example: "conversation",
	});

export const knowledgeClarificationStatusSchema = z
	.enum([
		"analyzing",
		"awaiting_answer",
		"draft_ready",
		"deferred",
		"applied",
		"dismissed",
	])
	.openapi({
		description: "Current lifecycle status for the clarification request.",
		example: "awaiting_answer",
	});

export const activeConversationKnowledgeClarificationStatusSchema = z
	.union([z.literal("analyzing"), z.literal("awaiting_answer")])
	.openapi({
		description:
			"Clarification statuses that should appear on active conversation surfaces.",
		example: "awaiting_answer",
	});

export const knowledgeClarificationTurnRoleSchema = z
	.enum(["ai_question", "human_answer", "human_skip"])
	.openapi({
		description: "Actor role for a clarification turn.",
		example: "ai_question",
	});

export const knowledgeClarificationSuggestedAnswersSchema = z
	.array(z.string().min(1))
	.length(3)
	.openapi({
		description: "Exactly three suggested answers for the current question.",
		example: [
			"It applies to all plans.",
			"It only applies to paid plans.",
			"It depends on the feature flag.",
		],
	});

export const knowledgeClarificationDraftFaqSchema = faqKnowledgePayloadSchema
	.extend({
		title: z.string().nullable().optional().openapi({
			description:
				"Optional proposal title for dashboard review without affecting the saved FAQ payload.",
			example: "Clarify seat limits by plan",
		}),
	})
	.openapi({
		description: "Draft FAQ proposal generated from the clarification flow.",
	});

export const conversationClarificationSummarySchema = z.object({
	requestId: z.ulid(),
	status: activeConversationKnowledgeClarificationStatusSchema,
	topicSummary: z.string(),
	question: z.string().nullable(),
	stepIndex: z.number().int().min(0),
	maxSteps: z.number().int().min(1),
	updatedAt: z.string(),
});

export const knowledgeClarificationRequestSchema = z.object({
	id: z.ulid(),
	organizationId: z.ulid(),
	websiteId: z.ulid(),
	aiAgentId: z.ulid(),
	conversationId: z.string().nullable(),
	source: knowledgeClarificationSourceSchema,
	status: knowledgeClarificationStatusSchema,
	topicSummary: z.string(),
	stepIndex: z.number().int().min(0),
	maxSteps: z.number().int().min(1),
	targetKnowledgeId: z.ulid().nullable(),
	currentQuestion: z.string().nullable(),
	currentSuggestedAnswers:
		knowledgeClarificationSuggestedAnswersSchema.nullable(),
	draftFaqPayload: knowledgeClarificationDraftFaqSchema.nullable(),
	lastError: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const knowledgeClarificationTurnSchema = z.object({
	id: z.ulid(),
	requestId: z.ulid(),
	role: knowledgeClarificationTurnRoleSchema,
	question: z.string().nullable(),
	suggestedAnswers: knowledgeClarificationSuggestedAnswersSchema.nullable(),
	selectedAnswer: z.string().nullable(),
	freeAnswer: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const knowledgeClarificationQuestionStepSchema = z.object({
	kind: z.literal("question"),
	request: knowledgeClarificationRequestSchema,
	question: z.string(),
	suggestedAnswers: knowledgeClarificationSuggestedAnswersSchema,
});

export const knowledgeClarificationDraftStepSchema = z.object({
	kind: z.literal("draft_ready"),
	request: knowledgeClarificationRequestSchema,
	draftFaqPayload: knowledgeClarificationDraftFaqSchema,
});

export const knowledgeClarificationStepResponseSchema = z.union([
	knowledgeClarificationQuestionStepSchema,
	knowledgeClarificationDraftStepSchema,
]);

export const getActiveKnowledgeClarificationRequestSchema = z.object({
	websiteSlug: z.string(),
	conversationId: z.string(),
});

export const startConversationKnowledgeClarificationRequestSchema = z.object({
	websiteSlug: z.string(),
	conversationId: z.string(),
	topicSummary: z.string().min(1).max(1000),
});

export const startFaqKnowledgeClarificationRequestSchema = z.object({
	websiteSlug: z.string(),
	knowledgeId: z.ulid(),
	topicSummary: z.string().min(1).max(1000).optional(),
});

export const answerKnowledgeClarificationRequestSchema = z
	.object({
		websiteSlug: z.string(),
		requestId: z.ulid(),
		selectedAnswer: z.string().min(1).optional(),
		freeAnswer: z.string().min(1).optional(),
	})
	.refine(
		(input) =>
			Boolean(input.selectedAnswer?.trim()) !==
			Boolean(input.freeAnswer?.trim()),
		{
			message: "Provide either a selected answer or a free answer.",
			path: ["selectedAnswer"],
		}
	);

export const updateKnowledgeClarificationStatusRequestSchema = z.object({
	websiteSlug: z.string(),
	requestId: z.ulid(),
});

export const skipKnowledgeClarificationRequestSchema = z.object({
	websiteSlug: z.string(),
	requestId: z.ulid(),
});

export const listKnowledgeClarificationProposalsRequestSchema = z.object({
	websiteSlug: z.string(),
});

export const listKnowledgeClarificationProposalsResponseSchema = z.object({
	items: z.array(knowledgeClarificationRequestSchema),
});

export const approveKnowledgeClarificationDraftRequestSchema = z.object({
	websiteSlug: z.string(),
	requestId: z.ulid(),
	draft: knowledgeClarificationDraftFaqSchema,
});

export const approveKnowledgeClarificationDraftResponseSchema = z.object({
	request: knowledgeClarificationRequestSchema,
	knowledge: knowledgeResponseSchema,
});

export const knowledgeClarificationStepEnvelopeSchema = z.object({
	step: knowledgeClarificationStepResponseSchema,
});

export const getActiveKnowledgeClarificationResponseSchema = z.object({
	request: knowledgeClarificationRequestSchema.nullable(),
});

export type KnowledgeClarificationSource = z.infer<
	typeof knowledgeClarificationSourceSchema
>;
export type ActiveConversationKnowledgeClarificationStatus = z.infer<
	typeof activeConversationKnowledgeClarificationStatusSchema
>;
export type KnowledgeClarificationStatus = z.infer<
	typeof knowledgeClarificationStatusSchema
>;
export type ConversationClarificationSummary = z.infer<
	typeof conversationClarificationSummarySchema
>;
export type KnowledgeClarificationTurnRole = z.infer<
	typeof knowledgeClarificationTurnRoleSchema
>;
export type KnowledgeClarificationDraftFaq = z.infer<
	typeof knowledgeClarificationDraftFaqSchema
>;
export type KnowledgeClarificationRequest = z.infer<
	typeof knowledgeClarificationRequestSchema
>;
export type KnowledgeClarificationTurn = z.infer<
	typeof knowledgeClarificationTurnSchema
>;
export type KnowledgeClarificationStepResponse = z.infer<
	typeof knowledgeClarificationStepResponseSchema
>;
export type StartConversationKnowledgeClarificationRequest = z.infer<
	typeof startConversationKnowledgeClarificationRequestSchema
>;
export type StartFaqKnowledgeClarificationRequest = z.infer<
	typeof startFaqKnowledgeClarificationRequestSchema
>;
export type AnswerKnowledgeClarificationRequest = z.infer<
	typeof answerKnowledgeClarificationRequestSchema
>;
export type SkipKnowledgeClarificationRequest = z.infer<
	typeof skipKnowledgeClarificationRequestSchema
>;
export type ApproveKnowledgeClarificationDraftRequest = z.infer<
	typeof approveKnowledgeClarificationDraftRequestSchema
>;
export type ApproveKnowledgeClarificationDraftResponse = z.infer<
	typeof approveKnowledgeClarificationDraftResponseSchema
>;
