export function resolveTracePayloadMode(
	value: string | undefined
): "raw" | "sanitized" | "metadata" {
	switch (value) {
		case "raw":
		case "sanitized":
		case "metadata":
			return value;
		default:
			return "sanitized";
	}
}
