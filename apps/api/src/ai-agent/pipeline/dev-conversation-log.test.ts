import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalNodeEnv = process.env.NODE_ENV;
const originalCaptureEnv =
	process.env.AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED;

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function loadCreateDevConversationLog() {
	mock.restore();
	const module = await import(
		`./dev-conversation-log.ts?real=${Date.now()}-${Math.random()}`
	);
	return module.createDevConversationLog;
}

afterEach(() => {
	mock.restore();
	if (originalCaptureEnv == null) {
		process.env.AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED = undefined;
	} else {
		process.env.AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED = originalCaptureEnv;
	}

	if (originalNodeEnv == null) {
		process.env.NODE_ENV = undefined;
		return;
	}

	process.env.NODE_ENV = originalNodeEnv;
});

describe("createDevConversationLog", () => {
	it("writes only in development", async () => {
		process.env.NODE_ENV = "test";
		const createDevConversationLog = await loadCreateDevConversationLog();
		const logDir = await mkdtemp(join(tmpdir(), "ai-agent-dev-log-"));
		const conversationId = "conv-disabled";
		const logger = createDevConversationLog(conversationId, { logDir });

		logger.log("This should not be written");
		await logger.flush();

		expect(await fileExists(join(logDir, conversationId))).toBe(false);
	});

	it("appends logs to a conversation-id file", async () => {
		process.env.NODE_ENV = "development";
		const createDevConversationLog = await loadCreateDevConversationLog();
		const logDir = await mkdtemp(join(tmpdir(), "ai-agent-dev-log-"));
		const conversationId = "conv-append";

		const firstRun = createDevConversationLog(conversationId, { logDir });
		firstRun.log("first line");
		await firstRun.flush();

		const secondRun = createDevConversationLog(conversationId, { logDir });
		secondRun.warn("second line");
		await secondRun.flush();

		const content = await readFile(join(logDir, conversationId), "utf8");

		expect(content).toContain("[LOG]");
		expect(content).toContain("first line");
		expect(content).toContain("[WARN]");
		expect(content).toContain("second line");
		expect(content.indexOf("first line")).toBeLessThan(
			content.indexOf("second line")
		);
	});

	it("safely no-ops flush when disabled", async () => {
		process.env.NODE_ENV = "production";
		const createDevConversationLog = await loadCreateDevConversationLog();
		const logDir = await mkdtemp(join(tmpdir(), "ai-agent-dev-log-"));
		const conversationId = "conv-noop";
		const logger = createDevConversationLog(conversationId, { logDir });

		logger.warn("This should not be written either");
		await logger.flush();

		expect(await fileExists(join(logDir, conversationId))).toBe(false);
	});

	it("does not append to file when worker conversation-log capture is enabled", async () => {
		process.env.NODE_ENV = "development";
		process.env.AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED = "true";
		const createDevConversationLog = await loadCreateDevConversationLog();
		const logDir = await mkdtemp(join(tmpdir(), "ai-agent-dev-log-"));
		const conversationId = "conv-worker-router";
		const logger = createDevConversationLog(conversationId, { logDir });

		logger.log("this should be routed by worker log router");
		await logger.flush();

		expect(await fileExists(join(logDir, conversationId))).toBe(false);
	});

	it("fails open when flush cannot write to disk", async () => {
		process.env.NODE_ENV = "development";
		const createDevConversationLog = await loadCreateDevConversationLog();
		const workspaceDir = await mkdtemp(join(tmpdir(), "ai-agent-dev-log-"));
		const notADirectoryPath = join(workspaceDir, "not-a-directory");
		await writeFile(notADirectoryPath, "occupied", "utf8");

		const warnSpy = mock((..._args: unknown[]) => {});
		const originalWarn = console.warn;
		console.warn = warnSpy as typeof console.warn;

		try {
			const logger = createDevConversationLog("conv-fail-open", {
				logDir: notADirectoryPath,
			});
			logger.error("still logs to stderr");

			await expect(logger.flush()).resolves.toBeUndefined();
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
				"Failed to flush conversation log file"
			);
		} finally {
			console.warn = originalWarn;
		}
	});
});
