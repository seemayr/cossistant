import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Facehash } from "./facehash";

describe("Facehash", () => {
	it("lets the svg foreground inherit the wrapper text color", () => {
		const html = renderToStaticMarkup(
			<Facehash className="text-[#123456]" name="agent-47" />
		);

		expect(html).toContain('class="facehash text-[#123456]"');
		expect(html).toContain("display:block;overflow:visible;color:inherit");
		expect(html).not.toContain("color:black");
	});
});
