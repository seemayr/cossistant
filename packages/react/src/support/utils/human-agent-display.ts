import { resolveHumanAgentDisplay } from "@cossistant/core/human-agent-display";
import type { AvailableHumanAgent } from "@cossistant/types";

export function resolveSupportHumanAgentDisplay(
	agent: Pick<AvailableHumanAgent, "email" | "id" | "name"> | null | undefined,
	fallbackLabel: string
) {
	return resolveHumanAgentDisplay(
		{
			id: agent?.id ?? fallbackLabel,
			email: agent?.email ?? null,
			name: agent?.name ?? null,
		},
		{
			surface: "public",
			publicFallbackLabel: fallbackLabel,
		}
	);
}
