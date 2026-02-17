export function getSafeRelativeCallbackPath(
	value: string | null | undefined,
	fallback = "/select"
): string {
	if (!value) {
		return fallback;
	}

	const decodedValue = (() => {
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	})();

	if (!decodedValue.startsWith("/")) {
		return fallback;
	}

	if (decodedValue.startsWith("//")) {
		return fallback;
	}

	if (decodedValue.includes("\\")) {
		return fallback;
	}

	return decodedValue;
}
