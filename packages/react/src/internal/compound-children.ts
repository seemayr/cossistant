import * as React from "react";

export type CompoundChildMatcher<TName extends string> = {
	name: TName;
	matches: (child: React.ReactElement) => boolean;
};

export type ParsedCompoundChildren<TName extends string> = {
	matched: Record<TName, React.ReactElement[]>;
	other: React.ReactNode[];
};

export function getCompoundDisplayName(child: React.ReactElement): string {
	return (child.type as React.ComponentType)?.displayName ?? "";
}

function visitChildrenDeep(
	children: React.ReactNode,
	visitor: (child: React.ReactNode) => void
): void {
	React.Children.forEach(children, (child) => {
		if (
			React.isValidElement<{ children?: React.ReactNode }>(child) &&
			child.type === React.Fragment
		) {
			visitChildrenDeep(child.props.children, visitor);
			return;
		}

		visitor(child);
	});
}

export function parseCompoundChildren<TName extends string>(
	children: React.ReactNode,
	matchers: readonly CompoundChildMatcher<TName>[]
): ParsedCompoundChildren<TName> {
	const matched = Object.fromEntries(
		matchers.map(({ name }) => [name, [] as React.ReactElement[]])
	) as Record<TName, React.ReactElement[]>;
	const other: React.ReactNode[] = [];

	visitChildrenDeep(children, (child) => {
		if (!React.isValidElement(child)) {
			other.push(child);
			return;
		}

		const matcher = matchers.find((candidate) => candidate.matches(child));

		if (matcher) {
			matched[matcher.name].push(child);
			return;
		}

		other.push(child);
	});

	return { matched, other };
}
