import { describe, expect, it } from "bun:test";
import {
	getApiKeyCacheTagForKey,
	invalidateApiKeyCacheForWebsite,
} from "./api-key-cache";

describe("invalidateApiKeyCacheForWebsite", () => {
	it("invalidates the concrete per-key cache tags for a website", async () => {
		let invalidationInput: Record<string, unknown> | null = null;

		await invalidateApiKeyCacheForWebsite(
			{
				select: () => ({
					from: () => ({
						where: async () => [
							{ key: "hashed-key-1" },
							{ key: "hashed-key-2" },
							{ key: "hashed-key-1" },
							{ key: null },
						],
					}),
				}),
				$cache: {
					invalidate: async (input: Record<string, unknown>) => {
						invalidationInput = input;
					},
				},
			} as never,
			"site-1"
		);

		expect(invalidationInput).not.toBeNull();
		expect(invalidationInput as unknown as Record<string, unknown>).toEqual({
			tags: [
				getApiKeyCacheTagForKey("hashed-key-1"),
				getApiKeyCacheTagForKey("hashed-key-2"),
			],
		});
	});
});
