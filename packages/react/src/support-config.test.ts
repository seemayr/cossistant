import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import * as supportConfigModule from "./support-config";

describe("support-config module exports", () => {
	it("exports SupportConfig", () => {
		expect(typeof supportConfigModule.SupportConfig).toBe("function");
	});

	it("does not export removed child-based APIs", () => {
		expect("DefaultMessage" in supportConfigModule).toBe(false);
		expect("extractDefaultMessagesFromChildren" in supportConfigModule).toBe(
			false
		);
		expect("resolveSupportConfigMessages" in supportConfigModule).toBe(false);
	});
});

describe("SupportConfig implementation", () => {
	it("updates only when props are defined (allowing [] to clear values)", () => {
		const source = readFileSync(
			new URL("./support-config.tsx", import.meta.url),
			"utf8"
		);

		expect(source).toContain("if (defaultMessages !== undefined)");
		expect(source).toContain("if (quickOptions !== undefined)");
	});

	it("removes children-based message configuration", () => {
		const source = readFileSync(
			new URL("./support-config.tsx", import.meta.url),
			"utf8"
		);

		expect(source).not.toContain("children?: React.ReactNode");
		expect(source).not.toContain("export function DefaultMessage");
		expect(source).not.toContain("extractDefaultMessagesFromChildren");
		expect(source).not.toContain("resolveSupportConfigMessages");
	});
});
