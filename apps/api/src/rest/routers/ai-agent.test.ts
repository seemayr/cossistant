import { beforeEach, describe, expect, it, mock } from "bun:test";
import { AuthValidationError } from "@api/lib/auth-validation";
import { APIKeyType } from "@cossistant/types";

const safelyExtractRequestDataMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const safelyExtractRequestQueryMock = mock((async () => ({})) as (
	...args: unknown[]
) => Promise<unknown>);
const validateResponseMock = mock(<T>(value: T) => value);
const getAiAgentForWebsiteByIdMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const updateAiAgentTrainingStatusMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);
const getPlanForWebsiteMock = mock((async () => ({
	features: {
		"ai-agent-training-interval": 0,
	},
})) as (...args: unknown[]) => Promise<unknown>);
const resolvePrivateApiKeyActorUserMock = mock((async () => ({
	userId: "user-1",
	member: {
		id: "user-1",
		name: "Alice",
		email: "alice@example.com",
		image: null,
		role: "member",
		createdAt: "2026-04-01T00:00:00.000Z",
		updatedAt: "2026-04-01T00:00:00.000Z",
		lastSeenAt: null,
	},
	source: "explicit",
})) as (...args: unknown[]) => Promise<unknown>);
const triggerAiTrainingMock = mock(
	(async () => "job-1") as (...args: unknown[]) => Promise<string>
);

mock.module("@api/utils/validate", () => ({
	safelyExtractRequestData: safelyExtractRequestDataMock,
	safelyExtractRequestQuery: safelyExtractRequestQueryMock,
	validateResponse: validateResponseMock,
}));

mock.module("@api/db/queries/ai-agent", () => ({
	getAiAgentForWebsiteById: getAiAgentForWebsiteByIdMock,
	updateAiAgentTrainingStatus: updateAiAgentTrainingStatusMock,
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
}));

mock.module("@api/lib/private-api-key-actor", () => ({
	resolvePrivateApiKeyActorUser: resolvePrivateApiKeyActorUserMock,
}));

mock.module("@api/utils/queue-triggers", () => ({
	triggerAiTraining: triggerAiTrainingMock,
}));

mock.module("../middleware", () => ({
	protectedPrivateApiKeyMiddleware: [],
}));

const aiAgentRouterModulePromise = import("./ai-agent");

function createDbWithKnowledgeCount(countValue: number) {
	return {
		select: () => ({
			from: () => ({
				where: async () => [{ count: countValue }],
			}),
		}),
	};
}

function createAgent(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "01JG000000000000000000000",
		name: "Support Assistant",
		image: null,
		description: "Helps users with support questions.",
		basePrompt: "You are a helpful assistant.",
		model: "openai/gpt-5-mini",
		temperature: 0.7,
		maxOutputTokens: 1024,
		isActive: true,
		lastUsedAt: null,
		usageCount: 10,
		goals: ["support"],
		createdAt: "2026-04-01T00:00:00.000Z",
		updatedAt: "2026-04-01T00:00:00.000Z",
		onboardingCompletedAt: "2026-04-01T00:00:00.000Z",
		lastTrainedAt: "2026-04-05T00:00:00.000Z",
		trainingStatus: "completed",
		trainingProgress: 100,
		trainingError: null,
		trainingStartedAt: "2026-04-05T00:00:00.000Z",
		trainedItemsCount: 5,
		...overrides,
	};
}

describe("ai-agent REST router", () => {
	beforeEach(() => {
		safelyExtractRequestDataMock.mockReset();
		safelyExtractRequestQueryMock.mockReset();
		validateResponseMock.mockReset();
		getAiAgentForWebsiteByIdMock.mockReset();
		updateAiAgentTrainingStatusMock.mockReset();
		getPlanForWebsiteMock.mockReset();
		resolvePrivateApiKeyActorUserMock.mockReset();
		triggerAiTrainingMock.mockReset();

		validateResponseMock.mockImplementation((value) => value);
		getAiAgentForWebsiteByIdMock.mockResolvedValue(createAgent());
		updateAiAgentTrainingStatusMock.mockResolvedValue(createAgent());
		getPlanForWebsiteMock.mockResolvedValue({
			features: {
				"ai-agent-training-interval": 0,
			},
		});
		resolvePrivateApiKeyActorUserMock.mockResolvedValue({
			userId: "user-1",
			member: {
				id: "user-1",
				name: "Alice",
				email: "alice@example.com",
				image: null,
				role: "member",
				createdAt: "2026-04-01T00:00:00.000Z",
				updatedAt: "2026-04-01T00:00:00.000Z",
				lastSeenAt: null,
			},
			source: "explicit",
		});
		triggerAiTrainingMock.mockResolvedValue("job-1");
	});

	it("returns an AI agent for a matching private API key request", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(getAiAgentForWebsiteByIdMock).toHaveBeenCalledWith(
			expect.anything(),
			{
				aiAgentId: "01JG000000000000000000000",
				websiteId: "site-1",
				organizationId: "org-1",
			}
		);
	});

	it("rejects public API keys on the private AI agent route", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PUBLIC },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000", {
				method: "GET",
			})
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "FORBIDDEN",
			message: "Private API key required",
		});
	});

	it("returns 404 when the requested agent does not belong to the authenticated website", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});
		getAiAgentForWebsiteByIdMock.mockResolvedValueOnce(null);

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000999", {
				method: "GET",
			})
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "NOT_FOUND",
			message: "AI agent not found",
		});
	});

	it("returns trained when no included sources changed after the last successful training", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});
		getAiAgentForWebsiteByIdMock.mockResolvedValueOnce(
			createAgent({ trainingStatus: "completed", trainingProgress: 100 })
		);

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000/training", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			aiAgentId: "01JG000000000000000000000",
			status: "trained",
			internalStatus: "completed",
			updatedSourcesCount: 0,
		});
	});

	it("returns out_of_date when included sources changed since the last successful training", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(2),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000/training", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "out_of_date",
			internalStatus: "completed",
			updatedSourcesCount: 2,
		});
	});

	it("returns training_ongoing when the training job is pending or running", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});
		getAiAgentForWebsiteByIdMock.mockResolvedValueOnce(
			createAgent({ trainingStatus: "pending", trainingProgress: 0 })
		);

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000/training", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "training_ongoing",
			internalStatus: "pending",
		});
	});

	it("surfaces failed training as out_of_date with diagnostics", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});
		getAiAgentForWebsiteByIdMock.mockResolvedValueOnce(
			createAgent({
				trainingStatus: "failed",
				trainingProgress: 30,
				trainingError: "Embedding provider timeout",
			})
		);

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000/training", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "out_of_date",
			internalStatus: "failed",
			lastError: "Embedding provider timeout",
		});
	});

	it("queues a retraining job and returns 202", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: null },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000/training", {
				method: "POST",
				headers: {
					"X-Actor-User-Id": "user-1",
				},
			})
		);

		expect(response.status).toBe(202);
		expect(updateAiAgentTrainingStatusMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				aiAgentId: "01JG000000000000000000000",
				trainingStatus: "pending",
			})
		);
		expect(triggerAiTrainingMock).toHaveBeenCalledWith({
			websiteId: "site-1",
			organizationId: "org-1",
			aiAgentId: "01JG000000000000000000000",
			triggeredBy: "user-1",
		});
		expect(await response.json()).toEqual({
			aiAgentId: "01JG000000000000000000000",
			jobId: "job-1",
			status: "training_ongoing",
			internalStatus: "pending",
			progress: 0,
		});
	});

	it("returns 409 when training is already in progress", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});
		getAiAgentForWebsiteByIdMock.mockResolvedValueOnce(
			createAgent({ trainingStatus: "training", trainingProgress: 50 })
		);

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000/training", {
				method: "POST",
			})
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "CONFLICT",
			message: "Training is already in progress",
		});
		expect(triggerAiTrainingMock).toHaveBeenCalledTimes(0);
	});

	it("returns 429 when the training cooldown has not elapsed", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: "user-1" },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});
		getAiAgentForWebsiteByIdMock.mockResolvedValueOnce(
			createAgent({
				lastTrainedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
				trainingStatus: "completed",
			})
		);
		getPlanForWebsiteMock.mockResolvedValueOnce({
			features: {
				"ai-agent-training-interval": 120,
			},
		});

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000/training", {
				method: "POST",
			})
		);

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).not.toBeNull();
		expect(await response.json()).toMatchObject({
			error: "TOO_MANY_REQUESTS",
		});
	});

	it("returns 400 when an unlinked private key omits the actor header", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: null },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});
		resolvePrivateApiKeyActorUserMock.mockImplementationOnce(async () => {
			throw new AuthValidationError(
				400,
				"X-Actor-User-Id is required when using an unlinked private API key"
			);
		});

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000/training", {
				method: "POST",
			})
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "BAD_REQUEST",
			message:
				"X-Actor-User-Id is required when using an unlinked private API key",
		});
	});

	it("returns 403 when the actor user is not allowed for the website", async () => {
		safelyExtractRequestDataMock.mockResolvedValue({
			db: createDbWithKnowledgeCount(0),
			apiKey: { keyType: APIKeyType.PRIVATE, linkedUserId: null },
			organization: { id: "org-1" },
			website: { id: "site-1", organizationId: "org-1", teamId: "team-1" },
		});
		resolvePrivateApiKeyActorUserMock.mockImplementationOnce(async () => {
			throw new AuthValidationError(
				403,
				"Actor user is not allowed for this website"
			);
		});

		const { aiAgentRouter } = await aiAgentRouterModulePromise;
		const response = await aiAgentRouter.request(
			new Request("http://localhost/01JG000000000000000000000/training", {
				method: "POST",
				headers: {
					"X-Actor-User-Id": "user-invalid",
				},
			})
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "FORBIDDEN",
			message: "Actor user is not allowed for this website",
		});
	});
});
