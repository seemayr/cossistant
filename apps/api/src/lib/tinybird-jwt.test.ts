import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const createTinybirdLocalJwtMock = mock(
	async (_websiteId: string) => "local-jwt"
);
const jsonwebtokenSignMock = mock(() => "cloud-jwt");

describe("tinybird jwt generation", () => {
	beforeEach(() => {
		createTinybirdLocalJwtMock.mockClear();
		jsonwebtokenSignMock.mockClear();
	});

	afterAll(() => {
		mock.restore();
	});

	it("uses Tinybird CLI to mint JWTs for local hosts", async () => {
		mock.module("@api/env", () => ({
			env: {
				TINYBIRD_HOST: "http://localhost:7181",
				TINYBIRD_SIGNING_KEY: "unused-signing-key",
				TINYBIRD_TOKEN: "unused-token",
				TINYBIRD_WORKSPACE: "workspace-local",
			},
		}));
		mock.module("@api/lib/tinybird-local-cli", () => ({
			createTinybirdLocalJwt: createTinybirdLocalJwtMock,
			readTinybirdLocalStatus: async () => ({
				host: "http://localhost:7181",
				workspace: "workspace-local",
			}),
		}));
		mock.module("jsonwebtoken", () => ({
			default: {
				sign: jsonwebtokenSignMock,
			},
		}));

		const module = await import(`./tinybird-jwt.ts?local=${Math.random()}`);
		const token = await module.generateTinybirdJWT("site-1");

		expect(token).toBe("local-jwt");
		expect(createTinybirdLocalJwtMock).toHaveBeenCalledWith("site-1", [
			"online_now",
			"visitor_presence",
			"presence_locations",
			"inbox_analytics",
			"unique_visitors",
		]);
		expect(jsonwebtokenSignMock).not.toHaveBeenCalled();
	});

	it("self-signs JWTs for non-local Tinybird hosts", async () => {
		mock.module("@api/env", () => ({
			env: {
				TINYBIRD_HOST: "https://api.us-east.aws.tinybird.co",
				TINYBIRD_SIGNING_KEY: "cloud-signing-key",
				TINYBIRD_TOKEN: "cloud-token",
				TINYBIRD_WORKSPACE: "workspace-cloud",
			},
		}));
		mock.module("@api/lib/tinybird-local-cli", () => ({
			createTinybirdLocalJwt: createTinybirdLocalJwtMock,
			readTinybirdLocalStatus: async () => ({
				host: "http://localhost:7181",
				workspace: "workspace-local",
			}),
		}));
		mock.module("jsonwebtoken", () => ({
			default: {
				sign: jsonwebtokenSignMock,
			},
		}));

		const module = await import(`./tinybird-jwt.ts?cloud=${Math.random()}`);
		const token = await module.generateTinybirdJWT("site-1");

		expect(token).toBe("cloud-jwt");
		expect(jsonwebtokenSignMock).toHaveBeenCalledTimes(1);
		expect(createTinybirdLocalJwtMock).not.toHaveBeenCalled();
	});

	it("returns null when Tinybird is disabled", async () => {
		mock.module("@api/env", () => ({
			env: {
				TINYBIRD_ENABLED: false,
				TINYBIRD_HOST: "https://api.us-east.aws.tinybird.co",
				TINYBIRD_SIGNING_KEY: "cloud-signing-key",
				TINYBIRD_TOKEN: "cloud-token",
				TINYBIRD_WORKSPACE: "workspace-cloud",
			},
		}));
		mock.module("@api/lib/tinybird-local-cli", () => ({
			createTinybirdLocalJwt: createTinybirdLocalJwtMock,
			readTinybirdLocalStatus: async () => ({
				host: "http://localhost:7181",
				workspace: "workspace-local",
			}),
		}));
		mock.module("jsonwebtoken", () => ({
			default: {
				sign: jsonwebtokenSignMock,
			},
		}));

		const module = await import(`./tinybird-jwt.ts?disabled=${Math.random()}`);
		const token = await module.generateTinybirdJWT("site-1");

		expect(token).toBeNull();
		expect(createTinybirdLocalJwtMock).not.toHaveBeenCalled();
		expect(jsonwebtokenSignMock).not.toHaveBeenCalled();
	});
});
