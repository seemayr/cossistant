import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type PackFile = {
	path: string;
	size: number;
};

type PackSummary = {
	entryCount: number;
	files: PackFile[];
	name: string;
	unpackedSize: number;
	version: string;
};

function assertNoForbiddenTypeSpecifiers(
	files: PackFile[],
	rootDir: string
): void {
	const forbiddenTypeSpecifiers = [
		/packages\/core\/src\//,
		/packages\/types\/src\//,
		/node_modules\/\.bun\//,
	];

	const offendingFiles = files
		.filter(({ path: filePath }) => filePath.endsWith(".d.ts"))
		.flatMap(({ path: filePath }) => {
			const contents = readFileSync(path.join(rootDir, filePath), "utf8");
			return forbiddenTypeSpecifiers.some((pattern) => pattern.test(contents))
				? [filePath]
				: [];
		});

	if (offendingFiles.length > 0) {
		const details = offendingFiles
			.map((filePath) => `- ${filePath}`)
			.join("\n");
		throw new Error(
			`Package declarations still contain forbidden local specifiers:\n${details}`
		);
	}
}

const packageDir = path.resolve(import.meta.dir, "..");
const distDir = path.join(packageDir, "dist");
const distPackageJsonPath = path.join(distDir, "package.json");

if (!existsSync(distPackageJsonPath)) {
	throw new Error(
		`Expected built package metadata at ${distPackageJsonPath}. Run \`bun run build\` first.`
	);
}

const rawOutput = execFileSync(
	"npm",
	["pack", "--json", "--dry-run", "--cache", "/tmp/npm-cache"],
	{
		cwd: distDir,
		encoding: "utf8",
	}
).trim();

const [packSummary] = JSON.parse(rawOutput) as PackSummary[];

if (!packSummary) {
	throw new Error("npm pack did not return a package summary.");
}

const forbiddenMatchers = [
	{
		description: "vendored @cossistant/core source declarations",
		pattern: /^core\/src\//,
	},
	{
		description: "vendored @cossistant/types source declarations",
		pattern: /^types\/src\//,
	},
	{
		description: "test-only helpers",
		pattern: /^test-utils\//,
	},
];

const offendingFiles = packSummary.files.filter(({ path: filePath }) =>
	forbiddenMatchers.some(({ pattern }) => pattern.test(filePath))
);

if (offendingFiles.length > 0) {
	const details = offendingFiles
		.map(({ path: filePath }) => `- ${filePath}`)
		.join("\n");
	throw new Error(`Package output still includes forbidden files:\n${details}`);
}

assertNoForbiddenTypeSpecifiers(packSummary.files, distDir);

console.log(
	`[check:pack] ${packSummary.name}@${packSummary.version}: ${packSummary.entryCount} files, ${packSummary.unpackedSize} bytes unpacked`
);
