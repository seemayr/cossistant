import { describe, expect, it } from "bun:test";
import {
	getSupportInstallCommand,
	getSupportInstallCommands,
} from "./support-integration-guide";

describe("support integration install commands", () => {
	it("returns unpinned Next.js commands for all package managers", () => {
		expect(getSupportInstallCommands("nextjs")).toEqual({
			bun: "bun add @cossistant/next",
			npm: "npm install @cossistant/next",
			pnpm: "pnpm add @cossistant/next",
			yarn: "yarn add @cossistant/next",
		});
	});

	it("returns unpinned React commands for all package managers", () => {
		expect(getSupportInstallCommands("react")).toEqual({
			bun: "bun add @cossistant/react",
			npm: "npm install @cossistant/react",
			pnpm: "pnpm add @cossistant/react",
			yarn: "yarn add @cossistant/react",
		});
	});

	it("returns version-pinned Next.js commands for all package managers", () => {
		expect(getSupportInstallCommands("nextjs", "0.0.28")).toEqual({
			bun: "bun add @cossistant/next@0.0.28",
			npm: "npm install @cossistant/next@0.0.28",
			pnpm: "pnpm add @cossistant/next@0.0.28",
			yarn: "yarn add @cossistant/next@0.0.28",
		});
	});

	it("returns version-pinned React commands for all package managers", () => {
		expect(getSupportInstallCommands("react", "0.0.28")).toEqual({
			bun: "bun add @cossistant/react@0.0.28",
			npm: "npm install @cossistant/react@0.0.28",
			pnpm: "pnpm add @cossistant/react@0.0.28",
			yarn: "yarn add @cossistant/react@0.0.28",
		});
	});

	it("returns a single version-pinned command for the requested package manager", () => {
		expect(
			getSupportInstallCommand({
				installationTarget: "react",
				packageManager: "npm",
				version: "0.1.2",
			})
		).toBe("npm install @cossistant/react@0.1.2");
	});
});
