import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Facehash } from "./avatar";

describe("Avatar facehash wrapper", () => {
	it("pins the fallback foreground to black", () => {
		const html = renderToStaticMarkup(
			<Facehash className="text-white dark:text-white" name="agent-47" />
		);

		expect(html).toContain("color:#000000");
		expect(html).toContain("display:block;overflow:visible;color:inherit");
	});
});
