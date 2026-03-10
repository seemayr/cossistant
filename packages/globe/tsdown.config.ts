import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/cossistant/index.tsx"],
	clean: true,
	dts: true,
	hash: false,
	minify: true,
	sourcemap: false,
	treeshake: true,
	outExtensions: () => ({
		js: ".js",
		dts: ".d.ts",
	}),
	external: ["react", "react-dom", "react/jsx-runtime", "phenomenon"],
});
