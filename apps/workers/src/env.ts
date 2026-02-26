const getEnvVariable = (name: string, defaultValue?: string): string => {
	const value = process.env[name];

	if (value == null) {
		if (defaultValue == null) {
			// During build time in Vercel, some env vars might not be available
			if (process.env.VERCEL || process.env.BUILDING_FOR_VERCEL) {
				console.warn(
					`Warning: Environment variable ${name} not found during build, using placeholder`
				);
				return "build-time-placeholder";
			}

			console.warn(
				`WARNING: Environment variable ${name} not found during build`
			);

			return "";
		}
		return defaultValue;
	}

	return value;
};

const defaultBullBoardEnabled =
	process.env.NODE_ENV === "production" ? "false" : "true";

export const env = {
	NODE_ENV: getEnvVariable("NODE_ENV"),
	PORT: +getEnvVariable("PORT", "8790"),
	REDIS_URL: getEnvVariable("REDIS_URL"),
	AI_AGENT_CONCURRENCY: +getEnvVariable("AI_AGENT_CONCURRENCY", "10"),
	AI_AGENT_LOCK_DURATION_MS: +getEnvVariable(
		"AI_AGENT_LOCK_DURATION_MS",
		"120000"
	),
	AI_AGENT_STALLED_INTERVAL_MS: +getEnvVariable(
		"AI_AGENT_STALLED_INTERVAL_MS",
		"30000"
	),
	AI_AGENT_MAX_STALLED_COUNT: +getEnvVariable(
		"AI_AGENT_MAX_STALLED_COUNT",
		"2"
	),
	AI_AGENT_DRAIN_MAX_MESSAGES: +getEnvVariable(
		"AI_AGENT_DRAIN_MAX_MESSAGES",
		"5"
	),
	AI_AGENT_DRAIN_MAX_RUNTIME_MS: +getEnvVariable(
		"AI_AGENT_DRAIN_MAX_RUNTIME_MS",
		"25000"
	),
	AI_AGENT_DRAIN_LOCK_TTL_MS: +getEnvVariable(
		"AI_AGENT_DRAIN_LOCK_TTL_MS",
		"120000"
	),
	AI_AGENT_WAKE_SWEEP_INTERVAL_MS: +getEnvVariable(
		"AI_AGENT_WAKE_SWEEP_INTERVAL_MS",
		"5000"
	),
	AI_AGENT_WAKE_RECOVERY_JITTER_MS: +getEnvVariable(
		"AI_AGENT_WAKE_RECOVERY_JITTER_MS",
		"1500"
	),
	AI_AGENT_STRICT_FIFO:
		getEnvVariable("AI_AGENT_STRICT_FIFO", "true") === "true",
	// Database (needed for notification queries)
	DATABASE_HOST: getEnvVariable("DATABASE_HOST"),
	DATABASE_PORT: +getEnvVariable("DATABASE_PORT"),
	DATABASE_USERNAME: getEnvVariable("DATABASE_USERNAME"),
	DATABASE_PASSWORD: getEnvVariable("DATABASE_PASSWORD"),
	DATABASE_NAME: getEnvVariable("DATABASE_NAME"),
	// Resend (needed for sending emails)
	RESEND_API_KEY: getEnvVariable("RESEND_API_KEY"),
	PUBLIC_APP_URL: getEnvVariable("PUBLIC_APP_URL"),
	BULL_BOARD_ENABLED:
		getEnvVariable("WORKERS_ENABLE_BULL_BOARD", defaultBullBoardEnabled) ===
		"true",
	BULL_BOARD_TOKEN: getEnvVariable("WORKERS_BULL_BOARD_TOKEN", ""),
	// Firecrawl API key for web crawling
	FIRECRAWL_API_KEY: getEnvVariable("FIRECRAWL_API_KEY", ""),
	// Polar AI credits meter configuration
	POLAR_AI_USAGE_METER_ID: getEnvVariable("POLAR_AI_USAGE_METER_ID", ""),
	AI_CREDIT_USAGE_EVENT_NAME: getEnvVariable(
		"AI_CREDIT_USAGE_EVENT_NAME",
		"ai_usage"
	),
	AI_CREDIT_BALANCE_CACHE_TTL_SECONDS: +getEnvVariable(
		"AI_CREDIT_BALANCE_CACHE_TTL_SECONDS",
		"15"
	),
	AI_CREDIT_BALANCE_STALE_TTL_SECONDS: +getEnvVariable(
		"AI_CREDIT_BALANCE_STALE_TTL_SECONDS",
		"300"
	),
	AI_CREDIT_INGEST_BACKOFF_SECONDS: +getEnvVariable(
		"AI_CREDIT_INGEST_BACKOFF_SECONDS",
		"30"
	),
};
