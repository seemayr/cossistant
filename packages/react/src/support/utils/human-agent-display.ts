import { resolveHumanAgentDisplay } from "@cossistant/core";
import type { AvailableHumanAgent } from "@cossistant/types";

export function resolveSupportHumanAgentDisplay(
	agent: Pick<AvailableHumanAgent, "id" | "name"> | null | undefined,
	fallbackLabel: string
) {
	return resolveHumanAgentDisplay(
		{
			id: agent?.id ?? fallbackLabel,
			name: agent?.name ?? null,
		},
		{
			surface: "public",
			publicFallbackLabel: fallbackLabel,
		}
	);
}
