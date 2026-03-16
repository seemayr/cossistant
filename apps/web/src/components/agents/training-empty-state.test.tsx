import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TrainingEmptyState } from "./training-empty-state";

describe("TrainingEmptyState", () => {
	it("renders a blank facehash with a question mark mouth and action button", () => {
		const html = renderToStaticMarkup(
			<TrainingEmptyState
				actionLabel="Add file"
				description="Add a file to give your agent more context."
				onAction={() => {}}
				title="No files yet"
			/>
		);

		expect(html).toContain('data-facehash=""');
		expect(html).toContain('data-facehash-mouth=""');
		expect(html).toContain(">?</span>");
		expect(html).toContain(">Add file</button>");
		expect(html).not.toContain('data-slot="icon-');
	});
});
