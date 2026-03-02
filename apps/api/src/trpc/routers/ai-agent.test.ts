import { describe, expect, it } from "bun:test";
import {
	getGenerateBasePromptFirecrawlOptions,
	getModelSelectionError,
} from "./ai-agent";

describe("ai-agent router model validation", () => {
	it("rejects unknown models", () => {
		const result = getModelSelectionError({
			modelId: "anthropic/claude-sonnet-4-20250514",
			latestModelsFeature: true,
		});

		expect(result?.code).toBe("BAD_REQUEST");
	});

	it("rejects latest-tier model when latest-ai-models feature is disabled", () => {
		const result = getModelSelectionError({
			modelId: "openai/gpt-5.2-chat",
			latestModelsFeature: false,
		});

		expect(result?.code).toBe("FORBIDDEN");
	});

	it("allows supported baseline models on lower tiers", () => {
		const result = getModelSelectionError({
			modelId: "moonshotai/kimi-k2-0905",
			latestModelsFeature: false,
		});

		expect(result).toBeNull();
	});
});

describe("generateBasePrompt Firecrawl options", () => {
	it("uses scrape maxAge and map ignoreCache without maxAge", () => {
		const firecrawlOptions = getGenerateBasePromptFirecrawlOptions();

		expect(firecrawlOptions.scrapeOptions).toEqual({
			maxAge: 3_600_000,
		});
		expect(firecrawlOptions.mapOptions).toEqual({
			limit: 100,
			ignoreCache: false,
		});
		expect(
			"maxAge" in (firecrawlOptions.mapOptions as Record<string, unknown>)
		).toBe(false);
	});
});
