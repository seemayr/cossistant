import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

describe("provider remount regressions", () => {
	it("keeps websocket identity changes from remounting the provider subtree", () => {
		const providerSource = readFileSync(
			new URL("./provider.tsx", import.meta.url),
			"utf8"
		);

		expect(providerSource).not.toContain("const webSocketKey");
		expect(providerSource).not.toContain("key={webSocketKey}");
	});

	it("keeps realtime provider wrapper stable across hydration", () => {
		const realtimeSource = readFileSync(
			new URL("./realtime/provider.tsx", import.meta.url),
			"utf8"
		);

		expect(realtimeSource).not.toContain("if (!isBrowser)");
		expect(realtimeSource).not.toContain("setIsBrowser(");
		expect(realtimeSource).toContain("export function RealtimeProvider");
		expect(realtimeSource).toContain("useSyncExternalStore(");
	});
	it("resets connection metadata when auth identity changes", () => {
		const realtimeSource = readFileSync(
			new URL("./realtime/provider.tsx", import.meta.url),
			"utf8"
		);

		expect(realtimeSource).toContain("function extractAuthIdentity");
		expect(realtimeSource).toContain(
			"const identity = useMemo(() => extractAuthIdentity(auth), [auth])"
		);
		expect(realtimeSource).toContain("visitorId: identity.visitorId");
		expect(realtimeSource).toContain("websiteId: identity.websiteId");
		expect(realtimeSource).toContain("userId: identity.userId");
	});
});
