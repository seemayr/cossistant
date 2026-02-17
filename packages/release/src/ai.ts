import path from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject, generateText } from "ai";
import fs from "fs-extra";
import { z } from "zod";
import type { Commit } from "./git";

export type FeatureQuestion = {
	id: string;
	feature: string;
	question: string;
	importance: "high" | "medium";
};

export type FeatureDetail = {
	id: string;
	feature: string;
	question: string;
	answer: string;
};

function getOpenRouterClient() {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error("OPENROUTER_API_KEY environment variable is required");
	}
	return createOpenRouter({ apiKey });
}

const featureQuestionsSchema = z.object({
	questions: z.array(
		z.object({
			id: z.string().describe("Unique identifier for the question"),
			feature: z
				.string()
				.describe("Short name of the feature (e.g., 'New usePresence hook')"),
			question: z
				.string()
				.describe(
					"A specific question to extract more details about this feature"
				),
			importance: z
				.enum(["high", "medium"])
				.describe("How important is this feature to highlight"),
		})
	),
});

export async function detectImportantFeatures(options: {
	commits: Commit[];
	description: string;
	releaseType: "patch" | "minor" | "major";
}): Promise<FeatureQuestion[]> {
	const openrouter = getOpenRouterClient();

	const commitList = options.commits
		.map((c) => `- ${c.hash}: ${c.subject} (${c.author})`)
		.join("\n");

	const result = await generateObject({
		model: openrouter.chat("anthropic/claude-opus-4.5"),
		schema: featureQuestionsSchema,
		system: `You are analyzing a software release to identify the most important user-facing features that need more details for a great changelog.

## Your Task
Analyze the commits and description to find the 2-4 MOST significant changes that users would care about. For each, generate a targeted question to extract more details from the releaser.

## Rules
- Focus on USER-FACING changes only (new features, API changes, behavior changes)
- Ignore internal refactors, tooling, CI/CD, or documentation changes
- Ask SPECIFIC questions that will help write better release notes
- Questions should be answerable in 1-2 sentences
- Mark as "high" importance for new features, breaking changes, or major improvements
- Mark as "medium" for nice-to-have details or smaller improvements
- Return 2-4 questions maximum, sorted by importance
- For patch releases, you may return 0-2 questions if changes are minor
- Do NOT ask about version numbers, dates, or obvious information`,
		prompt: `## Release Context
- **Release type:** ${options.releaseType}
- **User description:** ${options.description}

## Git commits since last release
${commitList}

Generate targeted questions to extract more details about the most important features.`,
		temperature: 0.3,
	});

	return result.object.questions;
}

export async function generateChangelog(options: {
	commits: Commit[];
	description: string;
	version: string;
	releaseType: "patch" | "minor" | "major";
	featureDetails?: FeatureDetail[];
}): Promise<string> {
	const templatePath = path.join(import.meta.dir, "../templates/changelog.mdx");
	const template = await fs.readFile(templatePath, "utf-8");

	const commitList = options.commits
		.map((c) => `- ${c.hash}: ${c.subject} (${c.author})`)
		.join("\n");

	const featureDetailsSection =
		options.featureDetails && options.featureDetails.length > 0
			? `### Additional Feature Details (from releaser)
${options.featureDetails.map((fd) => `**${fd.feature}**: ${fd.answer}`).join("\n")}`
			: "";

	const openrouter = getOpenRouterClient();

	const result = await generateText({
		model: openrouter.chat("anthropic/claude-opus-4.1"),
		system: `You are writing **concise, user-facing changelog entries** for **Cossistant**, a developer SDK that adds AI + human support to React and Next.js apps.

Your job is to communicate **what changed for users**, fast.

## Rules
- Write **short bullet points** (1 sentence max).
- Include **only user-visible changes**. Ignore internal refactors, tooling, or infra.
- Follow the **exact template structure** provided.
- **Omit empty sections** entirely.
- Use **Highlights** only for major features. Skip it for patch releases.
- Output **valid MDX** only. No commentary.
- never use emojis and em-dashes.
- Include the **Upgrade** section with the correct version number.
- Include the **Example** section with a relevant code example for new features (omit for patch releases with only bug fixes).
- The frontmatter **tiny-excerpt** must be a punchy 3-8 word summary for a notification pill (e.g. "New AI agent escalation flow", "Faster widget load times"). No period at the end.`,
		prompt: `Generate a changelog for:
- **Version:** ${options.version}
- **Release type:** ${options.releaseType}
- **Date:** ${new Date().toISOString().split("T")[0]}

## Context
### User description
${options.description}

${featureDetailsSection}

### Git commits since last release
${commitList}

## Template
${template}

## Requirements
- Keep it **short, skimmable, and factual**
- Use the **HighlightLine** component for changes with the corresponding variant.
- Include **only sections with real changes**
- Use the additional feature details from the releaser to enrich the changelog with specific details`,
		temperature: 0.5,
	});

	return result.text;
}

export async function refineChangelog(
	currentChangelog: string,
	refinementRequest: string
): Promise<string> {
	const openrouter = getOpenRouterClient();

	const result = await generateText({
		model: openrouter.chat("anthropic/claude-opus-4.5"),
		system:
			"You are refining a changelog. Keep it SHORT and concise. Maintain the same MDX format.",
		prompt: `Current changelog:
${currentChangelog}

Requested changes: ${refinementRequest}

Apply the changes. Keep it brief and scannable.`,
		temperature: 0.5,
	});

	return result.text;
}
