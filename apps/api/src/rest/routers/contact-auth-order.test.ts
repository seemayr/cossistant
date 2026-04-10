import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { OpenAPIHono } from "@hono/zod-openapi";

const contactRouterPath = new URL("./contact.ts", import.meta.url);

describe("contact router auth ordering", () => {
	it("mounts runtime routes before control routes and preserves public identify access", async () => {
		const source = readFileSync(contactRouterPath, "utf8");
		const runtimeRouteIndex = source.indexOf(
			'.route("/", contactRuntimeRouter)'
		);
		const controlRouteIndex = source.indexOf(
			'.route("/", contactControlRouter)'
		);

		expect(runtimeRouteIndex).toBeGreaterThan(-1);
		expect(controlRouteIndex).toBeGreaterThan(-1);
		expect(runtimeRouteIndex).toBeLessThan(controlRouteIndex);

		const runtimeRouter = new OpenAPIHono();
		runtimeRouter.use("/*", async (c, next) => {
			if (!c.req.header("X-Public-Key")) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "API key is required" },
					401
				);
			}

			await next();
		});
		runtimeRouter.post("/identify", (c) => c.json({ ok: true }, 200));

		const controlRouter = new OpenAPIHono();
		controlRouter.use("/*", async (c, next) => {
			if (!c.req.header("Authorization")?.startsWith("Bearer ")) {
				return c.json(
					{ error: "UNAUTHORIZED", message: "API key is required" },
					401
				);
			}

			await next();
		});

		const router = new OpenAPIHono()
			.route("/", runtimeRouter)
			.route("/", controlRouter);

		const response = await router.request(
			new Request("http://localhost/identify", {
				method: "POST",
				headers: {
					"X-Public-Key": "pk_test_123",
				},
			})
		);

		expect(response.status).toBe(200);
	});
});
