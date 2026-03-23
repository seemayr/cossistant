import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/**/*.ts", "!src/**/*.test.ts"],
	clean: true,
	dts: {
		resolve: true,
	},
	hash: false,
	minify: false,
	sourcemap: true,
	treeshake: true,
	unbundle: true,
	outExtensions: () => ({
		js: ".js",
		dts: ".d.ts",
	}),
	external: [
		"ai",
		"drizzle-orm",
		"drizzle-orm/node-postgres",
		"drizzle-orm/pg-core",
		"zod",
	],
});
