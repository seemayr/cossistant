import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

describe("WebsiteInformationForm source", () => {
	it("no longer includes the default language field", () => {
		const source = readFileSync(
			new URL("./website-information-form.tsx", import.meta.url),
			"utf8"
		);

		expect(source).not.toContain('name="defaultLanguage"');
		expect(source).not.toContain("FormLabel>Default language</FormLabel>");
		expect(source).toContain("Website name");
		expect(source).toContain("Contact email (optional)");
	});
});
