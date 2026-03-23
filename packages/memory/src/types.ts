import type { EmbeddingModel, LanguageModel } from "ai";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Memory } from "./memory";

export type MemoryMetadataValue = string | number | boolean | null;
export type MemoryMetadata = Record<string, MemoryMetadataValue>;

export type MemoryWhere =
	| Record<string, MemoryMetadataValue>
	| { and: MemoryWhere[] }
	| { or: MemoryWhere[] };

export type MemoryItem = {
	id: string;
	content: string;
	metadata: MemoryMetadata;
	priority: number;
	createdAt: Date;
	updatedAt: Date;
	score?: number;
};

export type RememberInput = {
	content: string;
	metadata?: MemoryMetadata;
	priority?: number;
	createdAt?: Date;
	source?: "agent" | "user" | "human" | "system" | "tool";
};

export type RememberResult = {
	id: string;
	createdAt: Date;
};

export type ContextInput = {
	where?: MemoryWhere;
	text?: string;
	limit?: number;
	includeSummary?: boolean;
};

export type ContextResult = {
	items: MemoryItem[];
	summary?: string;
};

export type ForgetInput = { id: string } | { where: MemoryWhere };

export type ForgetResult = {
	deletedCount: number;
};

export type SummarizeInput = {
	where: MemoryWhere;
	maxItems?: number;
	targetMetadata?: MemoryMetadata;
};

export type SummarizeResult = {
	id: string;
	summary: string;
};

export type MemoryEmbeddingModel = Exclude<EmbeddingModel, string>;
export type MemorySummarizeModel = Exclude<LanguageModel, string>;

export type MemoryModels = {
	embed?: MemoryEmbeddingModel;
	summarize?: MemorySummarizeModel;
};

export type MemoryNow = () => Date;

export type DrizzlePostgresDatabase = NodePgDatabase<Record<string, unknown>>;
export type MemoryDatabase = DrizzlePostgresDatabase;

export type MemoryOptions = {
	db: MemoryDatabase;
	models?: MemoryModels;
	now?: MemoryNow;
};

export type CreateMemoryToolOptions = {
	memory: Memory;
	remember: {
		metadata: MemoryMetadata;
		description?: string;
	};
	recall: {
		where: MemoryWhere;
		defaults?: {
			limit?: number;
			includeSummary?: boolean;
		};
		description?: string;
	};
};

export type RememberMemoryToolInput = {
	content: string;
	priority?: number;
};

export type RecallMemoryToolInput = {
	text?: string;
	limit?: number;
	includeSummary?: boolean;
};

export type MemoryToolFailureResult = {
	success: false;
	changed: false;
	error: string;
};

export type RememberMemoryToolResult =
	| {
			success: true;
			changed: true;
			data: RememberResult;
	  }
	| MemoryToolFailureResult;

export type RecallMemoryToolResult =
	| {
			success: true;
			changed: false;
			data: ContextResult;
	  }
	| MemoryToolFailureResult;
