/** biome-ignore-all lint/nursery/noUnnecessaryConditions: ok */
/** biome-ignore-all lint/complexity/useOptionalChain:ok */
/** biome-ignore-all lint/suspicious/noExplicitAny:ok */
/** biome-ignore-all lint/style/useConsistentMemberAccessibility:ok */
/** biome-ignore-all lint/style/noParameterProperties:ok */
/** biome-ignore-all lint/style/noNonNullAssertion:ok */
/** biome-ignore-all lint/nursery/useMaxParams: ok */

import { getTableName, Table } from "drizzle-orm";
import type { MutationOption } from "drizzle-orm/cache/core";
import { Cache } from "drizzle-orm/cache/core";
import type { CacheConfig } from "drizzle-orm/cache/core/types";
import { entityKind, is } from "drizzle-orm/entity";
import type Redis from "ioredis";
import { getRedis } from "../../redis";

type RedisClient = Redis;

const UNSUPPORTED_CACHE_CONFIG_KEYS = [
	"px",
	"exat",
	"pxat",
	"keepTtl",
] as const;

const getByTagScript = `
local tagsMapKey = KEYS[1] -- tags map key
local tag        = ARGV[1] -- tag

local compositeTableName = redis.call('HGET', tagsMapKey, tag)
if not compositeTableName then
  return nil
end

local value = redis.call('HGET', compositeTableName, tag)
return value
`;

const onMutateScript = `
local tagsMapKey = KEYS[1] -- tags map key
local tables     = {}      -- initialize tables array
local tags       = ARGV    -- tags array

for i = 2, #KEYS do
  tables[#tables + 1] = KEYS[i] -- add all keys except the first one to tables
end

if #tags > 0 then
  for _, tag in ipairs(tags) do
    if tag ~= nil and tag ~= '' then
      local compositeTableName = redis.call('HGET', tagsMapKey, tag)
      if compositeTableName then
        redis.call('HDEL', compositeTableName, tag)
      end
    end
  end
  redis.call('HDEL', tagsMapKey, unpack(tags))
end

local keysToDelete = {}

if #tables > 0 then
  local compositeTableNames = redis.call('SUNION', unpack(tables))
  for _, compositeTableName in ipairs(compositeTableNames) do
    keysToDelete[#keysToDelete + 1] = compositeTableName
  end
  for _, table in ipairs(tables) do
    keysToDelete[#keysToDelete + 1] = table
  end
  redis.call('DEL', unpack(keysToDelete))
end
`;

type ExpireOptions = "NX" | "nx" | "XX" | "xx" | "GT" | "gt" | "LT" | "lt";

function toRedisExpireMode(
	value?: ExpireOptions
): "NX" | "XX" | "GT" | "LT" | undefined {
	if (!value) {
		return;
	}

	return value.toUpperCase() as "NX" | "XX" | "GT" | "LT";
}

function assertSupportedCacheConfig(config?: CacheConfig): void {
	if (!config) {
		return;
	}

	const unsupportedKeys = UNSUPPORTED_CACHE_CONFIG_KEYS.filter(
		(key) => config[key] !== undefined
	);

	if (unsupportedKeys.length === 0) {
		return;
	}

	throw new Error(
		`[BunRedisCache] Unsupported cache config option(s): ${unsupportedKeys.join(
			", "
		)}. Only "ex" and "hexOptions" are supported.`
	);
}

export class BunRedisCache extends Cache {
	static override readonly [entityKind]: string = "BunRedisCache";
	/**
	 * Prefix for sets which denote the composite table names for each unique table
	 *
	 * Example: In the composite table set of "table1", you may find
	 * `${compositeTablePrefix}table1,table2` and `${compositeTablePrefix}table1,table3`
	 */
	private static compositeTableSetPrefix = "__CTS__";
	/**
	 * Prefix for hashes which map hash or tags to cache values
	 */
	private static compositeTablePrefix = "__CT__";
	/**
	 * Key which holds the mapping of tags to composite table names
	 *
	 * Using this tagsMapKey, you can find the composite table name for a given tag
	 * and get the cache value for that tag:
	 *
	 * ```ts
	 * const compositeTable = redis.hget(tagsMapKey, 'tag1')
	 * console.log(compositeTable) // `${compositeTablePrefix}table1,table2`
	 *
	 * const cachevalue = redis.hget(compositeTable, 'tag1')
	 */
	private static tagsMapKey = "__tagsMap__";
	/**
	 * Queries whose auto invalidation is false aren't stored in their respective
	 * composite table hashes because those hashes are deleted when a mutation
	 * occurs on related tables.
	 *
	 * Instead, they are stored in a separate hash with the prefix
	 * `__nonAutoInvalidate__` to prevent them from being deleted when a mutation
	 */
	private static nonAutoInvalidateTablePrefix = "__nonAutoInvalidate__";

	private internalConfig: { seconds: number; hexOptions?: ExpireOptions };

	constructor(
		public redis: RedisClient,
		config?: CacheConfig,
		protected useGlobally?: boolean
	) {
		super();
		assertSupportedCacheConfig(config);
		this.internalConfig = this.toInternalConfig(config);
		this.redis.on("error", (error) => {
			console.error("[BunRedisCache] Redis client error", error);
		});
		if (this.redis.status === "wait") {
			void this.redis.connect().catch((error) => {
				console.error("[BunRedisCache] Failed to connect to Redis", error);
			});
		}
	}

	public strategy() {
		return this.useGlobally ? "all" : "explicit";
	}

	private toInternalConfig(config?: CacheConfig): {
		seconds: number;
		hexOptions?: ExpireOptions;
	} {
		assertSupportedCacheConfig(config);

		return {
			seconds: typeof config?.ex === "number" ? config.ex : 1,
			hexOptions: config?.hexOptions,
		};
	}

	override async get(
		key: string,
		tables: string[],
		isTag = false,
		isAutoInvalidate?: boolean
	): Promise<any[] | undefined> {
		if (!isAutoInvalidate) {
			const rawValue = await this.redis.hget(
				BunRedisCache.nonAutoInvalidateTablePrefix,
				key
			);
			return this.deserialize(rawValue);
		}

		if (isTag) {
			const result = (await this.redis.eval(
				getByTagScript,
				1,
				BunRedisCache.tagsMapKey,
				key
			)) as string | null;
			return this.deserialize(result);
		}

		const compositeKey = this.getCompositeKey(tables);
		const rawValue = await this.redis.hget(compositeKey, key);
		return this.deserialize(rawValue);
	}

	override async put(
		key: string,
		response: any,
		tables: string[],
		isTag = false,
		config?: CacheConfig
	): Promise<void> {
		assertSupportedCacheConfig(config);

		const isAutoInvalidate = tables.length !== 0;
		const ttlSeconds = config?.ex ?? this.internalConfig.seconds;
		const expireMode = toRedisExpireMode(
			config?.hexOptions ?? this.internalConfig.hexOptions
		);
		const serializedResponse = this.serialize(response);

		if (!isAutoInvalidate) {
			if (isTag) {
				await this.redis.hset(
					BunRedisCache.tagsMapKey,
					key,
					BunRedisCache.nonAutoInvalidateTablePrefix
				);
				await this.expireKey(BunRedisCache.tagsMapKey, ttlSeconds, expireMode);
			}

			await this.redis.hset(
				BunRedisCache.nonAutoInvalidateTablePrefix,
				key,
				serializedResponse
			);
			await this.expireKey(
				BunRedisCache.nonAutoInvalidateTablePrefix,
				ttlSeconds,
				expireMode
			);
			return;
		}

		const compositeKey = this.getCompositeKey(tables);

		await this.redis.hset(compositeKey, key, serializedResponse);
		await this.expireKey(compositeKey, ttlSeconds, expireMode);

		if (isTag) {
			await this.redis.hset(BunRedisCache.tagsMapKey, key, compositeKey);
			await this.expireKey(BunRedisCache.tagsMapKey, ttlSeconds, expireMode);
		}

		for (const table of tables) {
			const tableSetKey = this.addTablePrefix(table);
			await this.redis.sadd(tableSetKey, compositeKey);
		}
	}

	override async onMutate(params: MutationOption) {
		const tags = Array.isArray(params.tags)
			? params.tags
			: params.tags
				? [params.tags]
				: [];
		const tables = Array.isArray(params.tables)
			? params.tables
			: params.tables
				? [params.tables]
				: [];
		const tableNames: string[] = tables.map((table) =>
			is(table, Table) ? getTableName(table) : (table as string)
		);

		const compositeTableSets = tableNames.map((table) =>
			this.addTablePrefix(table)
		);
		const keys = [BunRedisCache.tagsMapKey, ...compositeTableSets];
		const tagArguments = tags.map((tag) => String(tag));
		await this.redis.eval(
			onMutateScript,
			keys.length,
			...keys,
			...tagArguments
		);
	}

	private serialize(value: unknown): string {
		try {
			const serialized = JSON.stringify(value);
			return typeof serialized === "string" ? serialized : "null";
		} catch (error) {
			console.error("[BunRedisCache] Failed to serialize cache value", error);
			throw error;
		}
	}

	private deserialize(value: string | null | undefined): any[] | undefined {
		if (value === null || value === undefined) {
			return;
		}

		try {
			return JSON.parse(value) as any[];
		} catch (error) {
			console.error("[BunRedisCache] Failed to parse cached value", error);
			return;
		}
	}

	private async expireKey(
		key: string,
		ttlSeconds: number,
		expireMode?: "NX" | "XX" | "GT" | "LT"
	) {
		switch (expireMode) {
			case "NX":
				return await this.redis.expire(key, ttlSeconds, "NX");
			case "XX":
				return await this.redis.expire(key, ttlSeconds, "XX");
			case "GT":
				return await this.redis.expire(key, ttlSeconds, "GT");
			case "LT":
				return await this.redis.expire(key, ttlSeconds, "LT");
			default:
				return await this.redis.expire(key, ttlSeconds);
		}
	}

	private addTablePrefix = (table: string) =>
		`${BunRedisCache.compositeTableSetPrefix}${table}`;

	private getCompositeKey = (tables: string[]) =>
		`${BunRedisCache.compositeTablePrefix}${tables.sort().join(",")}`;
}

export function bunRedisCache({
	url: _url,
	redisClient,
	config,
	global = false,
}: {
	url?: string;
	redisClient?: RedisClient;
	config?: CacheConfig;
	global?: boolean;
}): BunRedisCache {
	const redis = redisClient ?? getRedis();
	return new BunRedisCache(redis, config, global);
}
