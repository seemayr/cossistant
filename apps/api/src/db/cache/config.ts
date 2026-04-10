import type { CacheConfig } from "drizzle-orm/cache/core/types";

export const SECURITY_CACHE_CONFIG: CacheConfig = {
	ex: 60,
};

export const KNOWLEDGE_READ_CACHE_CONFIG: CacheConfig = {
	ex: 60,
};
