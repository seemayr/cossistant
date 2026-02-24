export const AI_CREDIT_PRICING_CONFIG = {
	baseRunCredits: 1,
	includedBillableTools: 2,
	perExtraToolCredits: 0.5,
	excludedToolNames: [
		"sendMessage",
		"sendPrivateMessage",
		"aiDecision",
		"respond",
		"escalate",
		"resolve",
		"markSpam",
		"skip",
		"wait",
		"loadSkill",
	],
} as const;

export type AiAgentModelCatalogItem = {
	id: string;
	label: string;
	provider: string;
	icon: string;
	requiresLatestModels: boolean;
	modelSurchargeCredits: number;
	outageAllowed: boolean;
	isDefault?: boolean;
};

/**
 * Canonical AI agent model catalog.
 * All pricing/entitlement/outage model policy must be derived from this list.
 */
export const AI_AGENT_MODEL_CATALOG: readonly AiAgentModelCatalogItem[] = [
	{
		id: "moonshotai/kimi-k2-0905",
		label: "Kimi K2",
		provider: "Moonshot AI",
		icon: "agent",
		requiresLatestModels: false,
		modelSurchargeCredits: 0,
		outageAllowed: true,
		isDefault: true,
	},
	{
		id: "moonshotai/kimi-k2.5",
		label: "Kimi K2.5",
		provider: "Moonshot AI",
		icon: "agent",
		requiresLatestModels: false,
		modelSurchargeCredits: 0,
		outageAllowed: true,
	},
	{
		id: "openai/gpt-5.2-chat",
		label: "GPT-5.2",
		provider: "OpenAI",
		icon: "star",
		requiresLatestModels: true,
		modelSurchargeCredits: 1,
		outageAllowed: false,
	},
	{
		id: "openai/gpt-5.1-chat",
		label: "GPT-5.1",
		provider: "OpenAI",
		icon: "star",
		requiresLatestModels: true,
		modelSurchargeCredits: 1,
		outageAllowed: false,
	},
	{
		id: "openai/gpt-5-mini",
		label: "GPT-5 Mini",
		provider: "OpenAI",
		icon: "star",
		requiresLatestModels: true,
		modelSurchargeCredits: 1,
		outageAllowed: false,
	},
	{
		id: "google/gemini-3-flash-preview",
		label: "Gemini 3 Flash",
		provider: "Google",
		icon: "dashboard",
		requiresLatestModels: true,
		modelSurchargeCredits: 1,
		outageAllowed: false,
	},
] as const;

type ToolCallsByName = Record<string, number>;

export type AiCreditChargeBreakdown = {
	baseCredits: number;
	modelCredits: number;
	toolCredits: number;
	totalCredits: number;
	billableToolCount: number;
	excludedToolCount: number;
	totalToolCount: number;
};

export type AiPlanModelItem = {
	id: string;
	label: string;
	provider: string;
	icon: string;
	requiresLatestModels: boolean;
	modelSurchargeCredits: number;
	outageAllowed: boolean;
	selectableForCurrentPlan: boolean;
};

export type AiPlanModelsView = {
	defaultModelId: string;
	items: AiPlanModelItem[];
};

export type ResolvedAiAgentModel = {
	modelIdOriginal: string;
	modelIdResolved: string;
	modelMigrationApplied: boolean;
};

const AI_AGENT_MODEL_MAP = new Map<string, AiAgentModelCatalogItem>(
	AI_AGENT_MODEL_CATALOG.map((model) => [model.id, model])
);

const DEFAULT_MODEL_ID =
	AI_AGENT_MODEL_CATALOG.find((model) => model.isDefault === true)?.id ??
	AI_AGENT_MODEL_CATALOG[0]?.id;

const EXCLUDED_TOOL_SET = new Set<string>(
	AI_CREDIT_PRICING_CONFIG.excludedToolNames
);

function roundCredits(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function normalizeToolCallCount(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		return 0;
	}

	return Math.floor(value);
}

function toModelSurcharge(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		return 0;
	}

	return Math.max(0, value);
}

function getModelCatalogEntry(
	modelId: string
): AiAgentModelCatalogItem | undefined {
	return AI_AGENT_MODEL_MAP.get(modelId);
}

export function getAiAgentModelCatalog(): readonly AiAgentModelCatalogItem[] {
	return AI_AGENT_MODEL_CATALOG;
}

export function getDefaultModelId(): string {
	if (!DEFAULT_MODEL_ID) {
		throw new Error(
			"[ai-credits] AI_AGENT_MODEL_CATALOG must define at least one model"
		);
	}

	return DEFAULT_MODEL_ID;
}

export function isKnownModel(modelId: string): boolean {
	return AI_AGENT_MODEL_MAP.has(modelId);
}

export function getModelSurchargeCredits(modelId: string): number {
	const model = getModelCatalogEntry(modelId);
	return model ? toModelSurcharge(model.modelSurchargeCredits) : 0;
}

export function getModelSurcharge(modelId: string): number {
	return getModelSurchargeCredits(modelId);
}

export function isHighEndModel(modelId: string): boolean {
	return getModelSurchargeCredits(modelId) > 0;
}

export function isOutageAllowedModel(modelId: string): boolean {
	const model = getModelCatalogEntry(modelId);
	return model?.outageAllowed === true;
}

export function isModelAllowedForPlan(params: {
	modelId: string;
	latestModelsFeature: unknown;
}): boolean {
	const model = getModelCatalogEntry(params.modelId);
	if (!model) {
		return false;
	}

	if (!model.requiresLatestModels) {
		return true;
	}

	return params.latestModelsFeature === true;
}

export function resolveModelForExecution(
	modelId: string
): ResolvedAiAgentModel {
	if (isKnownModel(modelId)) {
		return {
			modelIdOriginal: modelId,
			modelIdResolved: modelId,
			modelMigrationApplied: false,
		};
	}

	return {
		modelIdOriginal: modelId,
		modelIdResolved: getDefaultModelId(),
		modelMigrationApplied: true,
	};
}

export function getAiModelsForPlan(
	latestModelsFeature: unknown
): AiPlanModelsView {
	return {
		defaultModelId: getDefaultModelId(),
		items: AI_AGENT_MODEL_CATALOG.map((model) => ({
			id: model.id,
			label: model.label,
			provider: model.provider,
			icon: model.icon,
			requiresLatestModels: model.requiresLatestModels,
			modelSurchargeCredits: toModelSurcharge(model.modelSurchargeCredits),
			outageAllowed: model.outageAllowed,
			selectableForCurrentPlan: isModelAllowedForPlan({
				modelId: model.id,
				latestModelsFeature,
			}),
		})),
	};
}

export function isExcludedToolName(toolName: string): boolean {
	return EXCLUDED_TOOL_SET.has(toolName);
}

export function getMinimumAiCreditCharge(
	modelId: string
): AiCreditChargeBreakdown {
	const baseCredits = AI_CREDIT_PRICING_CONFIG.baseRunCredits;
	const modelCredits = getModelSurchargeCredits(modelId);

	return {
		baseCredits,
		modelCredits,
		toolCredits: 0,
		totalCredits: roundCredits(baseCredits + modelCredits),
		billableToolCount: 0,
		excludedToolCount: 0,
		totalToolCount: 0,
	};
}

export function getToolCallStats(toolCallsByName?: ToolCallsByName | null): {
	billableToolCount: number;
	excludedToolCount: number;
	totalToolCount: number;
} {
	if (!toolCallsByName) {
		return {
			billableToolCount: 0,
			excludedToolCount: 0,
			totalToolCount: 0,
		};
	}

	let totalToolCount = 0;
	let excludedToolCount = 0;

	for (const [toolName, rawCount] of Object.entries(toolCallsByName)) {
		const count = normalizeToolCallCount(rawCount);
		if (count === 0) {
			continue;
		}

		totalToolCount += count;
		if (isExcludedToolName(toolName)) {
			excludedToolCount += count;
		}
	}

	const billableToolCount = Math.max(0, totalToolCount - excludedToolCount);

	return {
		billableToolCount,
		excludedToolCount,
		totalToolCount,
	};
}

export function getToolCredits(billableToolCount: number): number {
	const extraBillableTools = Math.max(
		0,
		billableToolCount - AI_CREDIT_PRICING_CONFIG.includedBillableTools
	);

	return roundCredits(
		extraBillableTools * AI_CREDIT_PRICING_CONFIG.perExtraToolCredits
	);
}

export function calculateAiCreditCharge(params: {
	modelId: string;
	toolCallsByName?: ToolCallsByName | null;
}): AiCreditChargeBreakdown {
	const minimumCharge = getMinimumAiCreditCharge(params.modelId);
	const { billableToolCount, excludedToolCount, totalToolCount } =
		getToolCallStats(params.toolCallsByName);
	const toolCredits = getToolCredits(billableToolCount);

	return {
		baseCredits: minimumCharge.baseCredits,
		modelCredits: minimumCharge.modelCredits,
		toolCredits,
		totalCredits: roundCredits(minimumCharge.totalCredits + toolCredits),
		billableToolCount,
		excludedToolCount,
		totalToolCount,
	};
}
