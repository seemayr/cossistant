export type HumanAgentIdentity = {
	id: string;
	name?: string | null;
};

export type HumanAgentSurface = "internal" | "public";

export type ResolveHumanAgentDisplayOptions = {
	surface: HumanAgentSurface;
	publicFallbackLabel?: string;
	internalFallbackLabel?: string;
};

export type HumanAgentDisplay = {
	displayName: string;
	facehashSeed: string;
	normalizedName: string | null;
};

const DEFAULT_INTERNAL_FALLBACK_LABEL = "Team member";
const DEFAULT_PUBLIC_FALLBACK_LABEL = "Support team";

export function normalizeHumanAgentName(
	value: string | null | undefined
): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function resolveHumanAgentDisplay(
	agent: HumanAgentIdentity,
	options: ResolveHumanAgentDisplayOptions
): HumanAgentDisplay {
	const normalizedName = normalizeHumanAgentName(agent.name);

	if (normalizedName) {
		return {
			displayName: normalizedName,
			facehashSeed: normalizedName,
			normalizedName,
		};
	}

	const displayName =
		options.surface === "public"
			? (options.publicFallbackLabel ?? DEFAULT_PUBLIC_FALLBACK_LABEL)
			: (options.internalFallbackLabel ?? DEFAULT_INTERNAL_FALLBACK_LABEL);

	return {
		displayName,
		facehashSeed: `${options.surface}:${agent.id || displayName}`,
		normalizedName: null,
	};
}
