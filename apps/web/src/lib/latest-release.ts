import type React from "react";
import { changelog } from "@/lib/source";

export type LatestRelease = {
	version: string;
	description: string;
	tinyExcerpt: string;
	date: string;
};

export function getLatestRelease(): LatestRelease | null {
	const pages = changelog
		.getPages()
		.sort(
			(a, b) =>
				new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
		);

	const latest = pages[0];
	if (!latest) {
		return null;
	}

	return {
		version: latest.data.version,
		description: latest.data.description,
		tinyExcerpt: latest.data["tiny-excerpt"] ?? "New release available",
		date: latest.data.date,
	};
}

/**
 * Returns the MDX body component for the latest changelog entry.
 * Must be called separately because the body is a React component
 * that needs to be rendered as JSX in a server component, then
 * passed as children through client component boundaries.
 */
export function getLatestReleaseBody(): React.ComponentType<{
	// biome-ignore lint/suspicious/noExplicitAny: MDX components have varied prop signatures
	components?: Record<string, React.ComponentType<any>>;
}> | null {
	const pages = changelog
		.getPages()
		.sort(
			(a, b) =>
				new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
		);

	const latest = pages[0];
	if (!latest) {
		return null;
	}

	return latest.data.body;
}
