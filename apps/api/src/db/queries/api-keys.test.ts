import { describe, expect, it } from "bun:test";
import { getApiKeyCacheTagForKey } from "@api/utils/cache/api-key-cache";
import { getApiKeyByKey } from "./api-keys";

describe("getApiKeyByKey", () => {
	it("uses a per-key cache tag for invalidation", async () => {
		let withCacheOptions: Record<string, unknown> | null = null;

		const result = await getApiKeyByKey(
			{
				select: () => ({
					from: () => ({
						where: () => ({
							innerJoin: () => ({
								innerJoin: () => ({
									limit: () => ({
										$withCache: async (options: Record<string, unknown>) => {
											withCacheOptions = options;
											return [
												{
													api_key: {
														id: "key-1",
														key: "hashed-key",
														keyType: "private",
													},
													organization: { id: "org-1" },
													website: { id: "site-1" },
												},
											];
										},
									}),
								}),
							}),
						}),
					}),
				}),
			} as never,
			{
				key: "hashed-key",
			}
		);

		expect(result).toMatchObject({
			id: "key-1",
			key: "hashed-key",
			organization: { id: "org-1" },
			website: { id: "site-1" },
		});
		expect(withCacheOptions).not.toBeNull();
		expect(withCacheOptions).toMatchObject({
			tag: getApiKeyCacheTagForKey("hashed-key"),
			config: { ex: 60 },
		});
	});
});
