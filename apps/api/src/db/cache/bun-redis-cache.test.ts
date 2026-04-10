import { describe, expect, it } from "bun:test";
import type { CacheConfig } from "drizzle-orm/cache/core/types";
import { BunRedisCache } from "./bun-redis-cache";

type FakeHashStore = Map<string, Map<string, string>>;
type FakeSetStore = Map<string, Set<string>>;

function createFakeRedis() {
	const hashes: FakeHashStore = new Map();
	const sets: FakeSetStore = new Map();
	const expirations = new Map<string, { seconds: number; mode?: string }>();

	const ensureHash = (key: string) => {
		let hash = hashes.get(key);
		if (!hash) {
			hash = new Map();
			hashes.set(key, hash);
		}
		return hash;
	};

	const ensureSet = (key: string) => {
		let set = sets.get(key);
		if (!set) {
			set = new Set();
			sets.set(key, set);
		}
		return set;
	};

	const deleteKeys = (...keys: string[]) => {
		for (const key of keys) {
			hashes.delete(key);
			sets.delete(key);
			expirations.delete(key);
		}
	};

	return {
		hashes,
		sets,
		expirations,
		status: "ready",
		on() {},
		async connect() {},
		async hget(key: string, field: string) {
			return hashes.get(key)?.get(field) ?? null;
		},
		async hset(key: string, field: string, value: string) {
			ensureHash(key).set(field, value);
			return 1;
		},
		async expire(key: string, seconds: number, mode?: string) {
			expirations.set(key, { seconds, mode });
			return 1;
		},
		async sadd(key: string, value: string) {
			ensureSet(key).add(value);
			return 1;
		},
		async del(...keys: string[]) {
			deleteKeys(...keys);
			return keys.length;
		},
		async eval(
			script: string,
			numKeys: number,
			...args: string[]
		): Promise<string | null> {
			const keys = args.slice(0, numKeys);
			const values = args.slice(numKeys);

			if (
				script.includes(
					"local compositeTableNames = redis.call('SUNION', unpack(tables))"
				)
			) {
				const [tagsMapKey, ...tableKeys] = keys;

				for (const tag of values) {
					const compositeTableName = hashes.get(tagsMapKey)?.get(tag);
					if (compositeTableName) {
						hashes.get(compositeTableName)?.delete(tag);
					}
					hashes.get(tagsMapKey)?.delete(tag);
				}

				const keysToDelete = new Set<string>();
				for (const tableKey of tableKeys) {
					for (const compositeTableName of sets.get(tableKey) ?? []) {
						keysToDelete.add(compositeTableName);
					}
					keysToDelete.add(tableKey);
				}

				if (keysToDelete.size > 0) {
					deleteKeys(...keysToDelete);
				}

				return null;
			}

			if (
				script.includes(
					"local compositeTableName = redis.call('HGET', tagsMapKey, tag)"
				)
			) {
				const tagsMapKey = keys[0];
				const tag = values[0];
				const compositeTableName = hashes.get(tagsMapKey)?.get(tag);

				if (!compositeTableName) {
					return null;
				}

				return hashes.get(compositeTableName)?.get(tag) ?? null;
			}

			throw new Error(`Unsupported script: ${script}`);
		},
	};
}

function createCache(config?: CacheConfig) {
	const redis = createFakeRedis();
	const cache = new BunRedisCache(redis as never, config);
	return { cache, redis };
}

describe("BunRedisCache", () => {
	it("uses explicit cache mode by default", () => {
		const { cache } = createCache();
		expect(cache.strategy()).toBe("explicit");
	});

	it("round-trips serialized query results", async () => {
		const { cache } = createCache({ ex: 60 });
		const response = [{ id: "row-1" }];

		await cache.put("query-key", response, ["table-1"]);
		const cached = await cache.get("query-key", ["table-1"], false, true);

		expect(cached).toEqual(response);
	});

	it("removes tagged cache entries when the tag is invalidated", async () => {
		const { cache } = createCache({ ex: 60 });

		await cache.put("api-key:1", [{ id: "key-1" }], ["api_key"], true);
		expect(await cache.get("api-key:1", ["api_key"], true, true)).toEqual([
			{ id: "key-1" },
		]);

		await cache.onMutate({ tags: "api-key:1" });

		expect(
			await cache.get("api-key:1", ["api_key"], true, true)
		).toBeUndefined();
	});

	it("removes table-backed cache entries when a related table mutates", async () => {
		const { cache } = createCache({ ex: 60 });

		await cache.put("member-1", [{ id: "member-1" }], ["member"]);
		expect(await cache.get("member-1", ["member"], false, true)).toEqual([
			{ id: "member-1" },
		]);

		await cache.onMutate({ tables: "member" });

		expect(
			await cache.get("member-1", ["member"], false, true)
		).toBeUndefined();
	});

	it("rejects unsupported cache config fields clearly", () => {
		expect(() => createCache({ px: 1000 })).toThrow(
			'Only "ex" and "hexOptions" are supported.'
		);
	});
});
