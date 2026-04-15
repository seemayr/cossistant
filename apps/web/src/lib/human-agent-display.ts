import { resolveHumanAgentDisplay } from "@cossistant/core";

export const DASHBOARD_TEAM_MEMBER_FALLBACK = "Team member";

export function resolveDashboardHumanAgentDisplay(agent: {
	id: string;
	email?: string | null;
	name?: string | null;
}) {
	return resolveHumanAgentDisplay(
		{
			email: agent.email ?? null,
			id: agent.id,
			name: agent.name ?? null,
		},
		{
			surface: "internal",
			internalFallbackLabel: DASHBOARD_TEAM_MEMBER_FALLBACK,
		}
	);
}
