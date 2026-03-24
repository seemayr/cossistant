import "server-only";

import type { ComponentPropsWithoutRef } from "react";
import {
	DOCS_TYPE_TABLE_BASE_PATH,
	docsTypeTableGenerator,
} from "@/lib/fumadocs-typescript";
import { type TypeNode, TypeTable, type TypeTableVariant } from "./type-table";

type RawTag = {
	name: string;
	text: string;
};

type ParsedTags = {
	default?: string;
	params?: Array<{
		name: string;
		description: string;
	}>;
	returns?: string;
};

function parseTags(tags: RawTag[]): ParsedTags {
	const parsed: ParsedTags = {};

	for (const { name, text } of tags) {
		if (name === "default" || name === "defaultValue") {
			parsed.default = text;
			continue;
		}

		if (name === "param") {
			const separatorIndex = text.indexOf("-");
			const paramName =
				separatorIndex === -1
					? text.trim()
					: text.slice(0, separatorIndex).trim();
			const description =
				separatorIndex === -1 ? "" : text.slice(separatorIndex + 1).trim();

			parsed.params ??= [];
			parsed.params.push({
				name: paramName,
				description,
			});
			continue;
		}

		if (name === "returns") {
			parsed.returns = text;
		}
	}

	return parsed;
}

export type AutoTypeTableProps = {
	path?: string;
	name?: string;
	type?: string;
	variant?: TypeTableVariant;
} & ComponentPropsWithoutRef<"div">;

export async function AutoTypeTable({
	path,
	name,
	type,
	variant,
	...props
}: AutoTypeTableProps) {
	const tables = await docsTypeTableGenerator.generateTypeTable(
		{
			path,
			name,
			type,
		},
		{
			basePath: DOCS_TYPE_TABLE_BASE_PATH,
		}
	);

	return tables.map((table) => {
		const entries: Record<string, TypeNode> = Object.fromEntries(
			table.entries.map((entry) => {
				const tags = parseTags(entry.tags as RawTag[]);

				return [
					entry.name,
					{
						description: entry.description,
						type: entry.simplifiedType,
						typeDescription: entry.type,
						typeDescriptionLink: entry.typeHref,
						default: tags.default,
						required: entry.required,
						deprecated: entry.deprecated,
						parameters: tags.params,
						returns: tags.returns,
					},
				];
			})
		);

		return (
			<TypeTable
				{...props}
				id={`type-table-${table.id}`}
				key={table.id}
				type={entries}
				variant={variant}
			/>
		);
	});
}
