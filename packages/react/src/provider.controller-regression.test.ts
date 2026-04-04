import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

describe("provider controller regression coverage", () => {
	it("creates the support controller inside the provider", () => {
		const source = readFileSync(
			new URL("./provider.tsx", import.meta.url),
			"utf8"
		);

		expect(source).toContain("createSupportController(");
		expect(source).toContain("<SupportControllerContext.Provider");
	});

	it("supports injecting an existing controller into the provider", () => {
		const source = readFileSync(
			new URL("./provider.tsx", import.meta.url),
			"utf8"
		);

		expect(source).toContain("controller?: SupportController");
		expect(source).toContain(
			"const controller = externalController ?? ownedController"
		);
	});

	it("routes support store access through the controller context", () => {
		const source = readFileSync(
			new URL("./support/store/support-store.ts", import.meta.url),
			"utf8"
		);

		expect(source).toContain("useSupportController()");
		expect(source).not.toContain("const store = createSupportStore");
	});
});
