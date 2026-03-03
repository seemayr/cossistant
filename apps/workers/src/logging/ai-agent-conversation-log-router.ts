import { appendFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { formatWithOptions } from "node:util";

type ConsoleLevel = "log" | "warn" | "error";

type InstallAiAgentConversationLogRouterOptions = {
	enabled?: boolean;
	logDir?: string;
	flushIntervalMs?: number;
};

type AiAgentConversationLogRouter = {
	flush: () => Promise<void>;
	stop: () => Promise<void>;
	isInstalled: () => boolean;
};

const DEFAULT_LOG_DIR = resolve(
	import.meta.dir,
	"../../.logs/ai-agent-pipeline"
);
const DEFAULT_FLUSH_INTERVAL_MS = 200;

const CONVERSATION_ID_PATTERNS = [
	/\bconv=([^\s|,]+)/g,
	/\bconversationId=([^\s|,]+)/g,
];

function renderArgs(args: unknown[]): string {
	return formatWithOptions(
		{
			colors: false,
			depth: null,
		},
		...args
	);
}

function createLine(level: ConsoleLevel, renderedMessage: string): string {
	return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${renderedMessage}`;
}

function extractConversationIds(renderedMessage: string): string[] {
	const conversationIds = new Set<string>();

	for (const pattern of CONVERSATION_ID_PATTERNS) {
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null = pattern.exec(renderedMessage);
		while (match) {
			const conversationId = match[1]?.trim();
			if (conversationId) {
				conversationIds.add(conversationId);
			}
			match = pattern.exec(renderedMessage);
		}
	}

	return [...conversationIds];
}

export function installAiAgentConversationLogRouter(
	options: InstallAiAgentConversationLogRouterOptions = {}
): AiAgentConversationLogRouter {
	const enabled = options.enabled ?? process.env.NODE_ENV === "development";
	const flushIntervalMs = Math.max(
		10,
		options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
	);
	const logDir = options.logDir ?? DEFAULT_LOG_DIR;
	const bufferedLinesByConversation = new Map<string, string[]>();
	const originalConsole = {
		log: console.log.bind(console),
		warn: console.warn.bind(console),
		error: console.error.bind(console),
	};

	let flushTimer: ReturnType<typeof setInterval> | null = null;
	let stopped = false;
	let flushInProgress = false;
	let flushRequestedWhileBusy = false;

	const logInternalWarning = (...args: unknown[]) => {
		originalConsole.warn(...args);
	};

	const queueConversationLine = (conversationId: string, line: string) => {
		const existingLines = bufferedLinesByConversation.get(conversationId);
		if (existingLines) {
			existingLines.push(line);
			return;
		}

		bufferedLinesByConversation.set(conversationId, [line]);
	};

	const captureLine = (level: ConsoleLevel, args: unknown[]) => {
		if (stopped || !enabled) {
			return;
		}

		const renderedMessage = renderArgs(args);
		const conversationIds = extractConversationIds(renderedMessage);
		if (conversationIds.length === 0) {
			return;
		}

		const line = createLine(level, renderedMessage);
		for (const conversationId of conversationIds) {
			queueConversationLine(conversationId, line);
		}
	};

	const flush = async (): Promise<void> => {
		if (!enabled || stopped) {
			return;
		}

		if (flushInProgress) {
			flushRequestedWhileBusy = true;
			return;
		}

		flushInProgress = true;
		try {
			do {
				flushRequestedWhileBusy = false;
				if (bufferedLinesByConversation.size === 0) {
					continue;
				}

				const batch = new Map(bufferedLinesByConversation);
				bufferedLinesByConversation.clear();

				await mkdir(logDir, { recursive: true });
				for (const [conversationId, lines] of batch.entries()) {
					if (lines.length === 0) {
						continue;
					}
					const filePath = join(logDir, conversationId);
					const output = `${lines.join("\n")}\n`;
					await appendFile(filePath, output, "utf8");
				}
			} while (flushRequestedWhileBusy);
		} catch (error) {
			logInternalWarning(
				"[ai-agent:conversation-log-router] Failed to flush conversation logs",
				error
			);
		} finally {
			flushInProgress = false;
		}
	};

	if (enabled) {
		console.log = ((...args: unknown[]) => {
			originalConsole.log(...args);
			captureLine("log", args);
		}) as typeof console.log;
		console.warn = ((...args: unknown[]) => {
			originalConsole.warn(...args);
			captureLine("warn", args);
		}) as typeof console.warn;
		console.error = ((...args: unknown[]) => {
			originalConsole.error(...args);
			captureLine("error", args);
		}) as typeof console.error;

		flushTimer = setInterval(() => {
			void flush();
		}, flushIntervalMs);
		flushTimer.unref?.();
	}

	const stop = async (): Promise<void> => {
		if (stopped) {
			return;
		}
		stopped = true;

		if (flushTimer) {
			clearInterval(flushTimer);
			flushTimer = null;
		}

		if (enabled) {
			console.log = originalConsole.log;
			console.warn = originalConsole.warn;
			console.error = originalConsole.error;
		}

		if (!enabled || bufferedLinesByConversation.size === 0) {
			return;
		}

		await mkdir(logDir, { recursive: true });
		for (const [
			conversationId,
			lines,
		] of bufferedLinesByConversation.entries()) {
			if (lines.length === 0) {
				continue;
			}
			const filePath = join(logDir, conversationId);
			const output = `${lines.join("\n")}\n`;
			await appendFile(filePath, output, "utf8");
		}
		bufferedLinesByConversation.clear();
	};

	return {
		flush,
		stop,
		isInstalled: () => enabled && !stopped,
	};
}
