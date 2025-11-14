const getEnvVariable = (name: string, defaultValue?: string): string => {
	const value = process.env[name];

	if (value == null) {
		if (defaultValue == null) {
			// During build time in Vercel, some env vars might not be available
			// when building packages that don't actually need them
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

export const env = {
	NODE_ENV: getEnvVariable("NODE_ENV"),
	DATABASE_HOST: getEnvVariable("DATABASE_HOST"),
	DATABASE_PORT: +getEnvVariable("DATABASE_PORT"),
	DATABASE_USERNAME: getEnvVariable("DATABASE_USERNAME"),
	DATABASE_PASSWORD: getEnvVariable("DATABASE_PASSWORD"),
	DATABASE_NAME: getEnvVariable("DATABASE_NAME"),
	REDIS_URL: getEnvVariable("REDIS_URL"),
	BETTER_AUTH_URL: getEnvVariable("BETTER_AUTH_URL"),
	BETTER_AUTH_SECRET: getEnvVariable("BETTER_AUTH_SECRET"),
	API_KEY_SECRET: getEnvVariable("API_KEY_SECRET"),
	GOOGLE_CLIENT_ID: getEnvVariable("GOOGLE_CLIENT_ID"),
	GOOGLE_CLIENT_SECRET: getEnvVariable("GOOGLE_CLIENT_SECRET"),
	GITHUB_CLIENT_ID: getEnvVariable("GITHUB_CLIENT_ID"),
	GITHUB_CLIENT_SECRET: getEnvVariable("GITHUB_CLIENT_SECRET"),
        RESEND_API_KEY: getEnvVariable("RESEND_API_KEY"),
        RESEND_AUDIENCE_ID: getEnvVariable("RESEND_AUDIENCE_ID"),
        PUBLIC_APP_URL: getEnvVariable("PUBLIC_APP_URL"),
        PORT: +getEnvVariable("PORT", "8787"),
        QSTASH_TOKEN: getEnvVariable("QSTASH_TOKEN"),
        POLAR_ACCESS_TOKEN: getEnvVariable("POLAR_ACCESS_TOKEN"),
        POLAR_WEBHOOK_SECRET: getEnvVariable("POLAR_WEBHOOK_SECRET"),
        QSTASH_CURRENT_SIGNING_KEY: getEnvVariable("QSTASH_CURRENT_SIGNING_KEY"),
        QSTASH_NEXT_SIGNING_KEY: getEnvVariable("QSTASH_NEXT_SIGNING_KEY"),
        QSTASH_URL: getEnvVariable("QSTASH_URL"),
        S3_BUCKET_NAME: getEnvVariable("S3_BUCKET_NAME"),
	S3_REGION: getEnvVariable("S3_REGION"),
	S3_ACCESS_KEY_ID: getEnvVariable("S3_ACCESS_KEY_ID"),
	S3_SECRET_ACCESS_KEY: getEnvVariable("S3_SECRET_ACCESS_KEY"),
	S3_ENDPOINT: getEnvVariable("S3_ENDPOINT", ""),
	S3_FORCE_PATH_STYLE:
		getEnvVariable("S3_FORCE_PATH_STYLE", "false") === "true",
	S3_SIGNED_URL_EXPIRATION_SECONDS: +getEnvVariable(
		"S3_SIGNED_URL_EXPIRATION_SECONDS",
		"900"
	),
	S3_PUBLIC_BASE_URL: getEnvVariable("S3_PUBLIC_BASE_URL", ""),
	S3_CDN_BASE_URL: getEnvVariable("S3_CDN_BASE_URL", ""),
};
