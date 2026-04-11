export function parseEnabledFlag(
	value: string | undefined,
	defaultValue = true
): boolean {
	if (value === undefined) {
		return defaultValue;
	}

	return value === "true";
}
