import { z } from "@hono/zod-openapi";
import {
	AI_AGENT_BEHAVIOR_SETTING_KEYS,
	AI_AGENT_TOOL_CATEGORIES,
	AI_AGENT_TOOL_IDS,
} from "./ai-agent-capabilities";

/**
 * Available AI models from OpenRouter
 */
export const AI_MODELS = [
	{
		value: "moonshotai/kimi-k2-0905",
		label: "Kimi K2",
		provider: "Moonshot AI",
		icon: "agent",
		freeOnly: true,
	},
	{
		value: "moonshotai/kimi-k2.5",
		label: "Kimi K2.5",
		provider: "Moonshot AI",
		icon: "agent",
		freeOnly: true,
	},
	{
		value: "openai/gpt-5.2-chat",
		label: "GPT-5.2",
		provider: "OpenAI",
		icon: "star",
		requiresPaid: true,
	},
	{
		value: "openai/gpt-5.1-chat",
		label: "GPT-5.1",
		provider: "OpenAI",
		icon: "star",
		requiresPaid: true,
	},
	{
		value: "openai/gpt-5-mini",
		label: "GPT-5 Mini",
		provider: "OpenAI",
		icon: "star",
		requiresPaid: true,
	},
	{
		value: "google/gemini-3-flash-preview",
		label: "Gemini 3 Flash",
		provider: "Google",
		icon: "dashboard",
		requiresPaid: true,
	},
] as const;

export type AIModel = (typeof AI_MODELS)[number]["value"];
export type AIModelConfig = (typeof AI_MODELS)[number];

/**
 * Available AI agent goals/intents
 */
export const AI_AGENT_GOALS = [
	{ value: "sales", label: "Increase sales conversions" },
	{ value: "support", label: "Provide customer support" },
	{ value: "product_qa", label: "Answer product questions" },
	{ value: "lead_qualification", label: "Qualify leads" },
	{ value: "scheduling", label: "Schedule appointments" },
	{ value: "feedback", label: "Collect customer feedback" },
] as const;

export type AIAgentGoal = (typeof AI_AGENT_GOALS)[number]["value"];

export const AI_AGENT_CORE_PROMPT_DOCUMENT_NAMES = [
	"agent.md",
	"security.md",
	"behaviour.md",
	"participation.md",
	"grounding.md",
	"capabilities.md",
] as const;
export type AiAgentCorePromptDocumentName =
	(typeof AI_AGENT_CORE_PROMPT_DOCUMENT_NAMES)[number];

export const aiAgentPromptDocumentKindSchema = z.enum(["core", "skill"]);
export const aiAgentCorePromptDocumentNameSchema = z.enum(
	AI_AGENT_CORE_PROMPT_DOCUMENT_NAMES
);

export const aiAgentSkillPromptDocumentNameSchema = z
	.string()
	.regex(/^[a-z0-9][a-z0-9-]{1,62}\.md$/, {
		message: "Skill name must match ^[a-z0-9][a-z0-9-]{1,62}\\.md$",
	})
	.refine(
		(value) => !AI_AGENT_CORE_PROMPT_DOCUMENT_NAMES.includes(value as never),
		{
			message: "Skill name cannot use reserved core document names.",
		}
	);

export const aiAgentPromptDocumentResponseSchema = z.object({
	id: z.ulid(),
	organizationId: z.ulid(),
	websiteId: z.ulid(),
	aiAgentId: z.ulid(),
	kind: aiAgentPromptDocumentKindSchema,
	name: z.string(),
	content: z.string(),
	enabled: z.boolean(),
	priority: z.number().int(),
	createdByUserId: z.ulid().nullable(),
	updatedByUserId: z.ulid().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

/**
 * AI Agent response schema
 */
export const aiAgentResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The AI agent's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	name: z.string().openapi({
		description: "The AI agent's display name.",
		example: "Support Assistant",
	}),
	description: z.string().nullable().openapi({
		description: "A brief description of the AI agent's purpose.",
		example: "Helps users with common support questions.",
	}),
	basePrompt: z.string().openapi({
		description: "The system prompt that defines the AI agent's behavior.",
		example: "You are a helpful support assistant...",
	}),
	model: z.string().openapi({
		description: "The OpenRouter model identifier.",
		example: "anthropic/claude-sonnet-4-20250514",
	}),
	temperature: z.number().nullable().openapi({
		description: "The temperature setting for response generation (0-2).",
		example: 0.7,
	}),
	maxOutputTokens: z.number().nullable().openapi({
		description: "Maximum tokens for response generation.",
		example: 1024,
	}),
	isActive: z.boolean().openapi({
		description: "Whether the AI agent is currently active.",
		example: true,
	}),
	lastUsedAt: z.string().nullable().openapi({
		description: "When the AI agent was last used.",
		example: "2024-01-01T00:00:00.000Z",
	}),
	usageCount: z.number().openapi({
		description: "Total number of times the AI agent has been used.",
		example: 42,
	}),
	goals: z
		.array(z.string())
		.nullable()
		.openapi({
			description: "The goals/intents for this AI agent.",
			example: ["support", "product_qa"],
		}),
	createdAt: z.string().openapi({
		description: "When the AI agent was created.",
		example: "2024-01-01T00:00:00.000Z",
	}),
	updatedAt: z.string().openapi({
		description: "When the AI agent was last updated.",
		example: "2024-01-01T00:00:00.000Z",
	}),
	onboardingCompletedAt: z.string().nullable().openapi({
		description:
			"When onboarding was completed. Null if still in onboarding flow.",
		example: "2024-01-01T00:00:00.000Z",
	}),
});

/**
 * Create AI Agent request schema
 */
export const createAiAgentRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug to create the AI agent for.",
			example: "my-website",
		}),
		name: z
			.string()
			.min(1, { message: "Name is required." })
			.max(100, { message: "Name must be 100 characters or fewer." })
			.openapi({
				description: "The AI agent's display name.",
				example: "Support Assistant",
			}),
		description: z
			.string()
			.max(500, { message: "Description must be 500 characters or fewer." })
			.optional()
			.openapi({
				description: "A brief description of the AI agent's purpose.",
				example: "Helps users with common support questions.",
			}),
		basePrompt: z
			.string()
			.min(1, { message: "Base prompt is required." })
			.max(10_000, {
				message: "Base prompt must be 10,000 characters or fewer.",
			})
			.openapi({
				description: "The system prompt that defines the AI agent's behavior.",
				example: "You are a helpful support assistant...",
			}),
		model: z.string().min(1, { message: "Model is required." }).openapi({
			description: "The OpenRouter model identifier.",
			example: "anthropic/claude-sonnet-4-20250514",
		}),
		temperature: z
			.number()
			.min(0, { message: "Temperature must be at least 0." })
			.max(2, { message: "Temperature must be at most 2." })
			.optional()
			.openapi({
				description: "The temperature setting for response generation (0-2).",
				example: 0.7,
			}),
		maxOutputTokens: z
			.number()
			.min(100, { message: "Max tokens must be at least 100." })
			.max(16_000, { message: "Max tokens must be at most 16,000." })
			.optional()
			.openapi({
				description: "Maximum tokens for response generation.",
				example: 1024,
			}),
		goals: z
			.array(z.string())
			.optional()
			.openapi({
				description: "The goals/intents for this AI agent.",
				example: ["support", "product_qa"],
			}),
	})
	.openapi({
		description: "Payload used to create a new AI agent.",
	});

/**
 * Update AI Agent request schema
 */
export const updateAiAgentRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		aiAgentId: z.ulid().openapi({
			description: "The AI agent's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		name: z
			.string()
			.min(1, { message: "Name is required." })
			.max(100, { message: "Name must be 100 characters or fewer." })
			.openapi({
				description: "The AI agent's display name.",
				example: "Support Assistant",
			}),
		description: z
			.string()
			.max(500, { message: "Description must be 500 characters or fewer." })
			.nullable()
			.optional()
			.openapi({
				description: "A brief description of the AI agent's purpose.",
				example: "Helps users with common support questions.",
			}),
		basePrompt: z
			.string()
			.min(1, { message: "Base prompt is required." })
			.max(10_000, {
				message: "Base prompt must be 10,000 characters or fewer.",
			})
			.openapi({
				description: "The system prompt that defines the AI agent's behavior.",
				example: "You are a helpful support assistant...",
			}),
		model: z.string().min(1, { message: "Model is required." }).openapi({
			description: "The OpenRouter model identifier.",
			example: "anthropic/claude-sonnet-4-20250514",
		}),
		temperature: z
			.number()
			.min(0, { message: "Temperature must be at least 0." })
			.max(2, { message: "Temperature must be at most 2." })
			.nullable()
			.optional()
			.openapi({
				description: "The temperature setting for response generation (0-2).",
				example: 0.7,
			}),
		maxOutputTokens: z
			.number()
			.min(100, { message: "Max tokens must be at least 100." })
			.max(16_000, { message: "Max tokens must be at most 16,000." })
			.nullable()
			.optional()
			.openapi({
				description: "Maximum tokens for response generation.",
				example: 1024,
			}),
		goals: z
			.array(z.string())
			.nullable()
			.optional()
			.openapi({
				description: "The goals/intents for this AI agent.",
				example: ["support", "product_qa"],
			}),
		onboardingCompletedAt: z.string().nullable().optional().openapi({
			description:
				"Mark onboarding as complete by setting this timestamp. Set to current ISO timestamp to complete onboarding.",
			example: "2024-01-01T00:00:00.000Z",
		}),
	})
	.openapi({
		description: "Payload used to update an existing AI agent.",
	});

/**
 * Toggle AI Agent active status request schema
 */
export const toggleAiAgentActiveRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		aiAgentId: z.ulid().openapi({
			description: "The AI agent's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		isActive: z.boolean().openapi({
			description: "Whether the AI agent should be active.",
			example: true,
		}),
	})
	.openapi({
		description: "Payload used to toggle an AI agent's active status.",
	});

/**
 * Delete AI Agent request schema
 */
export const deleteAiAgentRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		aiAgentId: z.ulid().openapi({
			description: "The AI agent's unique identifier.",
			example: "01JG000000000000000000000",
		}),
	})
	.openapi({
		description: "Payload used to permanently delete an AI agent.",
	});

/**
 * Get AI Agent request schema
 */
export const getAiAgentRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
	})
	.openapi({
		description: "Request to get the AI agent for a website.",
	});

/**
 * Generate Base Prompt request schema
 * Used to scrape a website and generate a tailored base prompt for the AI agent
 */
export const generateBasePromptRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		sourceUrl: z
			.string()
			.url({ message: "Please enter a valid URL." })
			.optional()
			.openapi({
				description:
					"The URL to scrape for content and brand information. Optional - if not provided, manualDescription should be used.",
				example: "https://example.com",
			}),
		agentName: z
			.string()
			.min(1, { message: "Agent name is required." })
			.max(100, { message: "Agent name must be 100 characters or fewer." })
			.openapi({
				description: "The name for the AI agent.",
				example: "Support Assistant",
			}),
		goals: z.array(z.string()).openapi({
			description: "The goals/intents for this AI agent.",
			example: ["support", "product_qa"],
		}),
		manualDescription: z
			.string()
			.max(1000, {
				message: "Description must be 1000 characters or fewer.",
			})
			.optional()
			.openapi({
				description:
					"Manual description of the business, used when scraping returns no description or no URL is provided.",
				example: "We help small businesses manage their inventory efficiently.",
			}),
	})
	.openapi({
		description:
			"Request to generate a base prompt by scraping a website and using AI.",
	});

/**
 * Generate Base Prompt response schema
 */
export const generateBasePromptResponseSchema = z
	.object({
		basePrompt: z.string().openapi({
			description: "The generated base prompt for the AI agent.",
			example: "You are a helpful support assistant for Acme Corp...",
		}),
		isGenerated: z.boolean().openapi({
			description:
				"Whether the prompt was AI-generated (true) or fell back to default (false).",
			example: true,
		}),
		companyName: z.string().nullable().openapi({
			description: "The company name extracted from the website.",
			example: "Acme Corp",
		}),
		websiteDescription: z.string().nullable().openapi({
			description: "The description extracted from the website.",
			example: "Acme Corp helps businesses grow with innovative solutions.",
		}),
		logo: z.string().nullable().openapi({
			description: "The logo URL extracted from the website (og:image).",
			example: "https://example.com/logo.png",
		}),
		favicon: z.string().nullable().openapi({
			description: "The favicon URL extracted from the website.",
			example: "https://example.com/favicon.ico",
		}),
		discoveredLinksCount: z.number().openapi({
			description:
				"Number of pages discovered on the website for future knowledge base training.",
			example: 47,
		}),
	})
	.openapi({
		description:
			"Response containing the generated base prompt and brand info.",
	});

export const listPromptDocumentsRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
});

export const listPromptDocumentsResponseSchema = z.object({
	coreDocuments: z.array(aiAgentPromptDocumentResponseSchema),
	skillDocuments: z.array(aiAgentPromptDocumentResponseSchema),
});

export const upsertCoreDocumentRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	name: aiAgentCorePromptDocumentNameSchema,
	content: z.string().max(50_000).openapi({
		description: "Markdown content for the core document.",
		example: "## Instructions\\nFollow these rules.",
	}),
	enabled: z.boolean().optional(),
	priority: z.number().int().min(-100).max(100).optional(),
});

export const createSkillDocumentRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	name: aiAgentSkillPromptDocumentNameSchema,
	content: z.string().max(50_000).openapi({
		description: "Markdown content for the skill document.",
		example: "## Workflow\\nWhen refund appears, collect order ID first.",
	}),
	enabled: z.boolean().optional(),
	priority: z.number().int().min(-100).max(100).optional(),
});

export const updateSkillDocumentRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		aiAgentId: z.ulid().openapi({
			description: "The AI agent ID.",
			example: "01JG000000000000000000000",
		}),
		skillDocumentId: z.ulid().openapi({
			description: "The skill prompt document ID.",
			example: "01JG000000000000000000000",
		}),
		name: aiAgentSkillPromptDocumentNameSchema.optional(),
		content: z.string().max(50_000).optional(),
		enabled: z.boolean().optional(),
		priority: z.number().int().min(-100).max(100).optional(),
	})
	.refine(
		(data) =>
			data.name !== undefined ||
			data.content !== undefined ||
			data.enabled !== undefined ||
			data.priority !== undefined,
		{
			message: "At least one field must be provided.",
		}
	);

export const deleteSkillDocumentRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	skillDocumentId: z.ulid().openapi({
		description: "The skill prompt document ID.",
		example: "01JG000000000000000000000",
	}),
});

export const toggleSkillDocumentRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
	skillDocumentId: z.ulid().openapi({
		description: "The skill prompt document ID.",
		example: "01JG000000000000000000000",
	}),
	enabled: z.boolean().openapi({
		description: "Whether the skill is enabled for runtime selection.",
		example: true,
	}),
});

export const aiAgentToolCategorySchema = z.enum(AI_AGENT_TOOL_CATEGORIES);
export const aiAgentToolIdSchema = z.enum(AI_AGENT_TOOL_IDS);
export const aiAgentBehaviorSettingKeySchema = z.enum(
	AI_AGENT_BEHAVIOR_SETTING_KEYS
);

export const aiAgentCapabilitiesToolStateSchema = z.object({
	id: aiAgentToolIdSchema,
	label: z.string(),
	description: z.string(),
	category: aiAgentToolCategorySchema,
	isSystem: z.boolean(),
	isRequired: z.boolean(),
	isToggleable: z.boolean(),
	behaviorSettingKey: aiAgentBehaviorSettingKeySchema.nullable(),
	defaultTemplateNames: z.array(aiAgentSkillPromptDocumentNameSchema),
	enabled: z.boolean(),
});

export const aiAgentDefaultSkillTemplateStateSchema = z.object({
	name: aiAgentSkillPromptDocumentNameSchema,
	label: z.string(),
	description: z.string(),
	content: z.string(),
	suggestedToolIds: z.array(aiAgentToolIdSchema),
	isEnabled: z.boolean(),
	hasOverride: z.boolean(),
	isCustomized: z.boolean(),
	skillDocumentId: z.ulid().nullable(),
});

export const aiAgentSystemSkillDocumentSchema = z.object({
	name: aiAgentCorePromptDocumentNameSchema,
	label: z.string(),
	description: z.string(),
	content: z.string(),
	source: z.enum(["db", "fallback"]),
	enabled: z.boolean(),
	priority: z.number().int(),
	documentId: z.ulid().nullable(),
});

export const getCapabilitiesStudioRequestSchema = z.object({
	websiteSlug: z.string().openapi({
		description: "The website slug.",
		example: "my-website",
	}),
	aiAgentId: z.ulid().openapi({
		description: "The AI agent ID.",
		example: "01JG000000000000000000000",
	}),
});

export const getCapabilitiesStudioResponseSchema = z.object({
	aiAgentId: z.ulid(),
	tools: z.array(aiAgentCapabilitiesToolStateSchema),
	defaultSkillTemplates: z.array(aiAgentDefaultSkillTemplateStateSchema),
	systemSkillDocuments: z.array(aiAgentSystemSkillDocumentSchema),
	skillDocuments: z.array(aiAgentPromptDocumentResponseSchema),
});

export type AiAgentResponse = z.infer<typeof aiAgentResponseSchema>;
export type CreateAiAgentRequest = z.infer<typeof createAiAgentRequestSchema>;
export type UpdateAiAgentRequest = z.infer<typeof updateAiAgentRequestSchema>;
export type ToggleAiAgentActiveRequest = z.infer<
	typeof toggleAiAgentActiveRequestSchema
>;
export type DeleteAiAgentRequest = z.infer<typeof deleteAiAgentRequestSchema>;
export type GetAiAgentRequest = z.infer<typeof getAiAgentRequestSchema>;
export type GenerateBasePromptRequest = z.infer<
	typeof generateBasePromptRequestSchema
>;
export type GenerateBasePromptResponse = z.infer<
	typeof generateBasePromptResponseSchema
>;
export type AiAgentPromptDocumentResponse = z.infer<
	typeof aiAgentPromptDocumentResponseSchema
>;
export type ListPromptDocumentsRequest = z.infer<
	typeof listPromptDocumentsRequestSchema
>;
export type ListPromptDocumentsResponse = z.infer<
	typeof listPromptDocumentsResponseSchema
>;
export type UpsertCoreDocumentRequest = z.infer<
	typeof upsertCoreDocumentRequestSchema
>;
export type CreateSkillDocumentRequest = z.infer<
	typeof createSkillDocumentRequestSchema
>;
export type UpdateSkillDocumentRequest = z.infer<
	typeof updateSkillDocumentRequestSchema
>;
export type DeleteSkillDocumentRequest = z.infer<
	typeof deleteSkillDocumentRequestSchema
>;
export type ToggleSkillDocumentRequest = z.infer<
	typeof toggleSkillDocumentRequestSchema
>;
export type GetCapabilitiesStudioRequest = z.infer<
	typeof getCapabilitiesStudioRequestSchema
>;
export type GetCapabilitiesStudioResponse = z.infer<
	typeof getCapabilitiesStudioResponseSchema
>;
export type AiAgentCapabilitiesToolState = z.infer<
	typeof aiAgentCapabilitiesToolStateSchema
>;
export type AiAgentDefaultSkillTemplateState = z.infer<
	typeof aiAgentDefaultSkillTemplateStateSchema
>;
export type AiAgentSystemSkillDocument = z.infer<
	typeof aiAgentSystemSkillDocumentSchema
>;

/**
 * AI Agent Behavior Settings Schema
 *
 * Controls how the AI agent behaves in conversations.
 * Simplified for MVP - AI responds immediately and decides when to respond
 * based on context, not configuration.
 */
export const aiAgentBehaviorSettingsSchema = z
	.object({
		// Capability toggles
		canResolve: z.boolean().openapi({
			description: "Whether the AI can mark conversations as resolved.",
			example: true,
		}),
		canMarkSpam: z.boolean().openapi({
			description: "Whether the AI can mark conversations as spam.",
			example: true,
		}),
		canAssign: z.boolean().openapi({
			description: "Whether the AI can assign conversations to team members.",
			example: true,
		}),
		canSetPriority: z.boolean().openapi({
			description: "Whether the AI can change conversation priority.",
			example: true,
		}),
		canCategorize: z.boolean().openapi({
			description: "Whether the AI can add conversations to views.",
			example: true,
		}),
		canEscalate: z.boolean().openapi({
			description: "Whether the AI can escalate conversations to human agents.",
			example: true,
		}),

		// Escalation config
		defaultEscalationUserId: z.string().nullable().openapi({
			description: "Default user ID to assign escalated conversations to.",
			example: null,
		}),

		// Visitor identification
		visitorContactPolicy: z
			.enum(["only_if_needed", "ask_early", "ask_after_time"])
			.openapi({
				description:
					"How aggressively the AI should ask for visitor contact information.",
				example: "only_if_needed",
			}),

		// Background analysis
		autoAnalyzeSentiment: z.boolean().openapi({
			description: "Whether to automatically analyze conversation sentiment.",
			example: true,
		}),
		autoGenerateTitle: z.boolean().openapi({
			description: "Whether to automatically generate conversation titles.",
			example: true,
		}),
		autoCategorize: z.boolean().openapi({
			description:
				"Whether to automatically add conversations to matching views.",
			example: false,
		}),
	})
	.openapi({
		description: "AI agent behavior settings.",
	});

export type AiAgentBehaviorSettings = z.infer<
	typeof aiAgentBehaviorSettingsSchema
>;

/**
 * Get Behavior Settings request schema
 */
export const getBehaviorSettingsRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
	})
	.openapi({
		description: "Request to get behavior settings for an AI agent.",
	});

/**
 * Get Behavior Settings response schema
 */
export const getBehaviorSettingsResponseSchema = aiAgentBehaviorSettingsSchema
	.extend({
		aiAgentId: z.ulid().openapi({
			description: "The AI agent's unique identifier.",
			example: "01JG000000000000000000000",
		}),
	})
	.openapi({
		description: "Response containing the AI agent's behavior settings.",
	});

/**
 * Update Behavior Settings request schema
 */
export const updateBehaviorSettingsRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
		aiAgentId: z.ulid().openapi({
			description: "The AI agent's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		settings: aiAgentBehaviorSettingsSchema.partial().openapi({
			description: "Partial behavior settings to update.",
		}),
	})
	.openapi({
		description: "Payload used to update an AI agent's behavior settings.",
	}); /**
 * Update Behavior Settings response schema
 */
export const updateBehaviorSettingsResponseSchema =
	aiAgentBehaviorSettingsSchema.openapi({
		description: "The updated behavior settings.",
	});

export type GetBehaviorSettingsRequest = z.infer<
	typeof getBehaviorSettingsRequestSchema
>;
export type GetBehaviorSettingsResponse = z.infer<
	typeof getBehaviorSettingsResponseSchema
>;
export type UpdateBehaviorSettingsRequest = z.infer<
	typeof updateBehaviorSettingsRequestSchema
>;
export type UpdateBehaviorSettingsResponse = z.infer<
	typeof updateBehaviorSettingsResponseSchema
>;
