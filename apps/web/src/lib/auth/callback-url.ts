import { getSafeRelativeCallbackPath } from "./callback";

function getRuntimeOrigin(): string | null {
	if (typeof window === "undefined") {
		return null;
	}

	return window.location.origin;
}

function getConfiguredOrigin(): string {
	return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

export function getAbsoluteAuthCallbackUrl(callbackPath: string): string {
	const safeCallbackPath = getSafeRelativeCallbackPath(callbackPath, "/select");
	const runtimeOrigin = getRuntimeOrigin();

	if (runtimeOrigin) {
		return `${runtimeOrigin}${safeCallbackPath}`;
	}

	return new URL(safeCallbackPath, getConfiguredOrigin()).toString();
}
