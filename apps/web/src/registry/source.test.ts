import { describe, expect, it } from "bun:test";
import { resolveRegistrySourceDescriptor } from "./source";

describe("resolveRegistrySourceDescriptor", () => {
	it("falls back to the runtime path when no separate source is provided", () => {
		expect(
			resolveRegistrySourceDescriptor({
				path: "src/components/example.tsx",
			})
		).toEqual({
			type: "file",
			path: "src/components/example.tsx",
		});
	});

	it("prefers sourcePath over the runtime path when present", () => {
		expect(
			resolveRegistrySourceDescriptor({
				path: "src/components/runtime.tsx",
				sourcePath: "src/components/example.tsx",
			})
		).toEqual({
			type: "file",
			path: "src/components/example.tsx",
		});
	});

	it("prefers inline code over file-based sources", () => {
		expect(
			resolveRegistrySourceDescriptor({
				code: "export default function Example() { return null; }",
				path: "src/components/runtime.tsx",
				sourcePath: "src/components/example.tsx",
			})
		).toEqual({
			type: "inline",
			code: "export default function Example() { return null; }",
		});
	});
});
