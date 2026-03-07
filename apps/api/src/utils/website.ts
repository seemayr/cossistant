/**
 * Gets the most recent lastOnlineAt timestamp from available human agents
 * @param availableHumanAgents Array of human agents with lastSeenAt timestamps
 * @returns ISO string of the most recent lastSeenAt, or null when no valid timestamps exist
 */
export const getMostRecentLastOnlineAt = (
	availableHumanAgents: Array<{ lastSeenAt: string | null }>
): string | null => {
	if (availableHumanAgents.length === 0) {
		return null;
	}

	let mostRecentTimestamp: number | null = null;

	for (const agent of availableHumanAgents) {
		if (!agent.lastSeenAt) {
			continue;
		}

		const agentTime = Date.parse(agent.lastSeenAt);
		if (Number.isNaN(agentTime)) {
			continue;
		}

		if (mostRecentTimestamp === null || agentTime > mostRecentTimestamp) {
			mostRecentTimestamp = agentTime;
		}
	}

	return mostRecentTimestamp === null
		? null
		: new Date(mostRecentTimestamp).toISOString();
};
