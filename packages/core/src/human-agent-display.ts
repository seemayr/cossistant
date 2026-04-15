export type HumanAgentIdentity = {
	id: string;
	name?: string | null;
	email?: string | null;
};

export type HumanAgentSurface = "internal" | "public";

export type ResolveHumanAgentDisplayOptions = {
	surface: HumanAgentSurface;
	publicFallbackLabel?: string;
	internalFallbackLabel?: string;
};

export type HumanAgentDisplay = {
	displayName: string;
	facehashName: string;
	/** @deprecated Use facehashName. */
	facehashSeed: string;
	normalizedName: string | null;
};

const DEFAULT_INTERNAL_FALLBACK_LABEL = "Team member";
const DEFAULT_PUBLIC_FALLBACK_LABEL = "Support team";

function normalizeHumanAgentIdentityValue(
	value: string | null | undefined
): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function normalizeHumanAgentName(
	value: string | null | undefined
): string | null {
	return normalizeHumanAgentIdentityValue(value);
}

export function resolveHumanAgentDisplay(
	agent: HumanAgentIdentity,
	options: ResolveHumanAgentDisplayOptions
): HumanAgentDisplay {
	const normalizedName = normalizeHumanAgentName(agent.name);
	const normalizedEmail = normalizeHumanAgentIdentityValue(agent.email);

	if (normalizedName) {
		return {
			displayName: normalizedName,
			facehashName: normalizedName,
			facehashSeed: normalizedName,
			normalizedName,
		};
	}

	const displayName =
		options.surface === "public"
			? (options.publicFallbackLabel ?? DEFAULT_PUBLIC_FALLBACK_LABEL)
			: (options.internalFallbackLabel ?? DEFAULT_INTERNAL_FALLBACK_LABEL);
	const facehashName = normalizedEmail ?? displayName;

	return {
		displayName,
		facehashName,
		facehashSeed: facehashName,
		normalizedName: null,
	};
}
