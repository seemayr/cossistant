import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { identifyContactRequestSchema } from "@cossistant/types/api/contact";
import {
	createConversationRequestSchema,
	getConversationResponseSchema,
} from "@cossistant/types/api/conversation";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
	actorUserIdHeader,
	openApiSecuritySchemes,
	PRIVATE_API_KEY_SECURITY_SCHEME,
	PUBLIC_API_KEY_SECURITY_SCHEME,
} from "./openapi";

const routersDir = path.resolve(import.meta.dir, "routers");
const apiIndexPath = path.resolve(import.meta.dir, "../index.ts");

type OpenAPIMetadataValueType = {
	type?: string;
};

type OpenAPIMetadataSchema = {
	type?: string | string[];
	description?: string;
	example?: Record<string, string | number>;
	additionalProperties?: {
		anyOf?: OpenAPIMetadataValueType[];
	};
};

type OpenAPISchemaWithProperties = {
	properties?: Record<
		string,
		OpenAPIMetadataSchema | OpenAPISchemaWithProperties
	>;
	required?: string[];
};

type OpenAPIJsonContent = {
	content?: {
		"application/json"?: {
			schema?: OpenAPISchemaWithProperties;
		};
	};
};

describe("REST OpenAPI contract guards", () => {
	it("defines the shared public and private security schemes", () => {
		expect(openApiSecuritySchemes).toHaveProperty(
			PRIVATE_API_KEY_SECURITY_SCHEME
		);
		expect(openApiSecuritySchemes).toHaveProperty(
			PUBLIC_API_KEY_SECURITY_SCHEME
		);
		expect(actorUserIdHeader.name).toBe("X-Actor-User-Id");
	});

	it("does not allow raw auth scheme names or duplicated auth header definitions in REST routers", () => {
		const routerFiles = readdirSync(routersDir)
			.filter((entry) => entry.endsWith(".ts"))
			.filter((entry) => !entry.endsWith(".test.ts"));

		for (const file of routerFiles) {
			const content = readFileSync(path.join(routersDir, file), "utf8");

			expect(content).not.toContain('"Public API Key"');
			expect(content).not.toContain('"Private API Key"');
			expect(content).not.toContain('name: "Authorization"');
			expect(content).not.toContain('name: "X-Public-Key"');
			expect(content).not.toContain('name: "Origin"');
			expect(content).not.toContain('name: "X-Visitor-Id"');
			expect(content).not.toContain('name: "X-Actor-User-Id"');
		}
	});

	it("uses shared security schemes in the OpenAPI root document and no global bearerAuth", () => {
		const content = readFileSync(apiIndexPath, "utf8");

		expect(content).toContain("securitySchemes: openApiSecuritySchemes");
		expect(content).not.toContain("bearerAuth");
	});

	it("documents the websocket handshake in the root OpenAPI document", () => {
		const content = readFileSync(apiIndexPath, "utf8");

		expect(content).toContain('"/ws"');
		expect(content).toContain("connectRealtimeWebSocket");
		expect(content).toContain('name: "actorUserId"');
		expect(content).toContain("actorUserIdHeader");
	});

	it("documents public conversation metadata on create requests and conversation reads", () => {
		const app = new OpenAPIHono();

		app.openapi(
			{
				method: "post",
				path: "/conversations",
				request: {
					body: {
						required: true,
						content: {
							"application/json": {
								schema: createConversationRequestSchema,
							},
						},
					},
				},
				responses: {
					200: {
						description: "Conversation created",
						content: {
							"application/json": {
								schema: getConversationResponseSchema,
							},
						},
					},
				},
			},
			(() => new Response(null)) as never
		);

		const doc = app.getOpenAPI31Document({
			openapi: "3.1.0",
			info: {
				title: "OpenAPI metadata contract test",
				version: "1.0.0",
			},
		});

		const postPath = doc.paths?.["/conversations"]?.post;
		const requestBody = postPath?.requestBody as OpenAPIJsonContent | undefined;
		const successResponse = postPath?.responses?.["200"] as
			| OpenAPIJsonContent
			| undefined;
		const requestMetadata = requestBody?.content?.["application/json"]?.schema
			?.properties?.metadata as OpenAPIMetadataSchema | undefined;
		const responseConversation = successResponse?.content?.["application/json"]
			?.schema?.properties?.conversation as
			| OpenAPISchemaWithProperties
			| undefined;
		const responseMetadata = responseConversation?.properties?.metadata as
			| OpenAPIMetadataSchema
			| undefined;

		expect(requestMetadata).toMatchObject({
			type: "object",
			description:
				"Public conversation metadata stored as flat key-value pairs.",
			example: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});
		expect(responseMetadata).toMatchObject({
			type: ["object", "null"],
			description:
				"Public conversation metadata stored as flat key-value pairs.",
			example: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});

		const requestValueTypes = [
			...new Set(
				(
					requestMetadata?.additionalProperties as
						| { anyOf?: Array<{ type?: string }> }
						| undefined
				)?.anyOf?.map((entry) => entry.type)
			),
		].sort();
		const responseValueTypes = [
			...new Set(
				(
					responseMetadata?.additionalProperties as
						| { anyOf?: Array<{ type?: string }> }
						| undefined
				)?.anyOf?.map((entry) => entry.type)
			),
		].sort();

		expect(requestValueTypes).toEqual(["boolean", "null", "number", "string"]);
		expect(responseValueTypes).toEqual(["boolean", "null", "number", "string"]);
	});

	it("documents contact identify visitorId precedence between body and X-Visitor-Id", () => {
		const app = new OpenAPIHono();

		app.openapi(
			{
				method: "post",
				path: "/contacts/identify",
				request: {
					body: {
						required: true,
						content: {
							"application/json": {
								schema: identifyContactRequestSchema,
							},
						},
					},
				},
				responses: {
					200: {
						description: "Contact identified",
					},
				},
			},
			(() => new Response(null)) as never
		);

		const doc = app.getOpenAPI31Document({
			openapi: "3.1.0",
			info: {
				title: "OpenAPI metadata contract test",
				version: "1.0.0",
			},
		});

		const postPath = doc.paths?.["/contacts/identify"]?.post;
		const requestBody = postPath?.requestBody as OpenAPIJsonContent | undefined;
		const requestSchema = requestBody?.content?.["application/json"]?.schema as
			| OpenAPISchemaWithProperties
			| undefined;
		const visitorIdSchema = requestSchema?.properties?.visitorId as
			| OpenAPIMetadataSchema
			| undefined;

		expect(requestSchema?.required ?? []).not.toContain("visitorId");
		expect(visitorIdSchema?.description).toContain("X-Visitor-Id");
		expect(visitorIdSchema?.description).toContain("body value wins");
	});
});
