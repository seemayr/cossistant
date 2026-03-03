import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installAiAgentConversationLogRouter } from "./ai-agent-conversation-log-router";

let activeRouter: ReturnType<
	typeof installAiAgentConversationLogRouter
> | null = null;

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

afterEach(async () => {
	if (activeRouter) {
		await activeRouter.stop();
		activeRouter = null;
	}
});

describe("installAiAgentConversationLogRouter", () => {
	it("routes conv-tagged console logs to the matching conversation file", async () => {
		const logDir = await mkdtemp(join(tmpdir(), "ai-agent-log-router-"));
		const conversationId = "conv-router-1";
		activeRouter = installAiAgentConversationLogRouter({
			enabled: true,
			logDir,
			flushIntervalMs: 25,
		});

		console.log(`[worker:ai-agent] conv=${conversationId} | started`);
		console.warn(`[ai-agent] conversationId=${conversationId} | warning`);
		console.error(`[ai-agent] conv=${conversationId} | failed`);
		console.log("[worker:ai-agent] no conversation id here");

		await activeRouter.flush();

		const conversationFile = join(logDir, conversationId);
		const content = await readFile(conversationFile, "utf8");
		expect(content).toContain("[LOG]");
		expect(content).toContain("[WARN]");
		expect(content).toContain("[ERROR]");
		expect(content).toContain("started");
		expect(content).toContain("warning");
		expect(content).toContain("failed");
		expect(content).not.toContain("no conversation id here");
	});

	it("does not create files when logs do not include conversation id", async () => {
		const logDir = await mkdtemp(join(tmpdir(), "ai-agent-log-router-"));
		activeRouter = installAiAgentConversationLogRouter({
			enabled: true,
			logDir,
			flushIntervalMs: 25,
		});

		console.log("[worker:ai-agent] health check log");
		console.warn("[worker:ai-agent] generic warning");
		await activeRouter.flush();

		const files = await readdir(logDir);
		expect(files).toHaveLength(0);
		expect(await fileExists(join(logDir, "conv-missing"))).toBe(false);
	});
});
