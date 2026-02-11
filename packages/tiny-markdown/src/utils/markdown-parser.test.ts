import { describe, expect, it } from "bun:test";
import { hasMarkdownFormatting, parseMarkdown } from "./markdown-parser";

function getFirstCodeToken(input: string) {
	const tokens = parseMarkdown(input);
	if (tokens.length !== 1 || tokens[0]?.type !== "code") {
		throw new Error("Expected exactly one code token");
	}

	const codeToken = tokens[0];
	if (codeToken?.type !== "code") {
		throw new Error("Expected first token to be a code token");
	}

	return codeToken;
}

describe("markdown-parser", () => {
	it("parses fenced code blocks with language", () => {
		const codeToken = getFirstCodeToken(
			["```jsx", "const el = <div />;", "```"].join("\n")
		);

		expect(codeToken.inline).toBe(false);
		expect(codeToken.language).toBe("jsx");
		expect(codeToken.content).toBe("const el = <div />;");
	});

	it("parses file names from fence metadata", () => {
		const codeToken = getFirstCodeToken(
			[
				'```tsx title="app/layout.tsx" showLineNumbers',
				"export default function Layout() {}",
				"```",
			].join("\n")
		);

		expect(codeToken.language).toBe("tsx");
		expect(codeToken.fileName).toBe("app/layout.tsx");
	});

	it("parses bare file names after language", () => {
		const codeToken = getFirstCodeToken(
			[
				"```tsx app/layout.tsx",
				"export default function Layout() {}",
				"```",
			].join("\n")
		);

		expect(codeToken.language).toBe("tsx");
		expect(codeToken.fileName).toBe("app/layout.tsx");
	});

	it("infers file names from first-line code comments", () => {
		const codeToken = getFirstCodeToken(
			[
				"```tsx",
				"// app/layout.tsx",
				"export default function Layout() {}",
				"```",
			].join("\n")
		);

		expect(codeToken.fileName).toBe("app/layout.tsx");
		expect(codeToken.content).toContain("// app/layout.tsx");
	});

	it("keeps markdown syntax literal inside fenced code blocks", () => {
		const codeToken = getFirstCodeToken(
			["```ts", "**bold** and [link](https://example.com)", "```"].join("\n")
		);

		expect(codeToken.content).toContain("**bold**");
		expect(codeToken.content).toContain("[link](https://example.com)");
	});

	it("detects fenced code blocks as markdown formatting", () => {
		const input = ["```js", "const value = 1;", "```"].join("\n");
		expect(hasMarkdownFormatting(input)).toBe(true);
	});

	it("parses tool mention tokens", () => {
		const tokens = parseMarkdown(
			"Use [@Search Knowledge Base](mention:tool:searchKnowledgeBase) first."
		);

		const paragraph = tokens.find((token) => token.type === "p");
		expect(paragraph?.type).toBe("p");

		if (paragraph?.type === "p") {
			const mentionToken = paragraph.children.find(
				(token) => token.type === "mention"
			);
			expect(mentionToken?.type).toBe("mention");
			if (mentionToken?.type === "mention") {
				expect(mentionToken.mention.type).toBe("tool");
				expect(mentionToken.mention.id).toBe("searchKnowledgeBase");
			}
		}
	});
});
