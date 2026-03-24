import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
	createFileSystemGeneratorCache,
	createGenerator,
	type DocEntry,
	type GeneratedDoc,
	type Generator,
} from "fumadocs-typescript";

function isAppRoot(dir: string): boolean {
	return (
		existsSync(resolve(dir, "package.json")) &&
		existsSync(resolve(dir, "source.config.ts"))
	);
}

function findAppRoot(startDir: string): string | null {
	let currentDir = resolve(startDir);

	while (true) {
		if (isAppRoot(currentDir)) {
			return currentDir;
		}

		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			return null;
		}

		currentDir = parentDir;
	}
}

function resolveAppRoot(): string {
	const cwd = process.cwd();
	const candidates = [
		cwd,
		resolve(cwd, "apps", "web"),
		resolve(cwd, ".source"),
		resolve(cwd, ".next"),
	];

	for (const candidate of candidates) {
		const appRoot = findAppRoot(candidate);
		if (appRoot) {
			return appRoot;
		}
	}

	throw new Error(
		`Unable to resolve the apps/web root from working directory: ${cwd}`
	);
}

const APP_ROOT = resolveAppRoot();
export const DOCS_TYPE_TABLE_BASE_PATH = resolve(APP_ROOT, "../..");

const rawDocsTypeTableGenerator = createGenerator({
	cache: createFileSystemGeneratorCache(
		resolve(APP_ROOT, ".next", "fumadocs-typescript")
	),
	tsconfigPath: resolve(APP_ROOT, "tsconfig.json"),
});

const GENERIC_SIMPLIFIED_TYPES = new Set([
	"array",
	"function",
	"object",
	"union",
]);

function normalizeTypeText(
	type: string,
	options: {
		stripUndefined?: boolean;
	} = {}
): string {
	const normalized = options.stripUndefined
		? type.replace(/\s+\|\s+undefined\b/g, "").trim()
		: type.trim();

	return normalized.replace(
		/^\(\((?<fn>.+?=>.+)\)\)$/s,
		(_match, fn: string) => fn
	);
}

function shouldUseFullTypeAsShortType(type: string): boolean {
	return type.length > 0 && type.length <= 96 && !type.includes("\n");
}

function normalizeEntry(entry: DocEntry): DocEntry {
	const stripUndefined = !entry.required;
	const type = normalizeTypeText(entry.type, { stripUndefined });
	const simplifiedType = normalizeTypeText(entry.simplifiedType, {
		stripUndefined,
	});

	if (!GENERIC_SIMPLIFIED_TYPES.has(simplifiedType)) {
		return {
			...entry,
			type,
			simplifiedType,
		};
	}

	return {
		...entry,
		type,
		simplifiedType: shouldUseFullTypeAsShortType(type) ? type : simplifiedType,
	};
}

function normalizeDoc(doc: GeneratedDoc): GeneratedDoc {
	return {
		...doc,
		entries: doc.entries.map(normalizeEntry),
	};
}

export const docsTypeTableGenerator: Generator = {
	async generateDocumentation(file, name, options) {
		const docs = await rawDocsTypeTableGenerator.generateDocumentation(
			file,
			name,
			options
		);

		return docs.map(normalizeDoc);
	},
	async generateTypeTable(props, options) {
		const docs = await rawDocsTypeTableGenerator.generateTypeTable(
			props,
			options
		);

		return docs.map(normalizeDoc);
	},
};
