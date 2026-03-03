import { appendFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { formatWithOptions } from "node:util";

const DEV_WORKER_LOG_DIR = resolve(
	import.meta.dir,
	"../../../../workers/.logs/ai-agent-pipeline"
);

type DevConversationLog = {
	log: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
	flush: () => Promise<void>;
};

type CreateDevConversationLogOptions = {
	logDir?: string;
};

function renderArgs(args: unknown[]): string {
	return formatWithOptions(
		{
			colors: false,
			depth: null,
		},
		...args
	);
}

function createLine(level: "log" | "warn" | "error", args: unknown[]): string {
	return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${renderArgs(args)}`;
}

export function createDevConversationLog(
	conversationId: string,
	options: CreateDevConversationLogOptions = {}
): DevConversationLog {
	const enabled = process.env.NODE_ENV === "development";
	const routedByWorker =
		process.env.AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED === "true";
	const logDir = options.logDir ?? DEV_WORKER_LOG_DIR;
	const filePath = join(logDir, conversationId);
	const buffer: string[] = [];

	const write = (level: "log" | "warn" | "error", args: unknown[]) => {
		if (level === "error") {
			console.error(...args);
		} else if (level === "warn") {
			console.warn(...args);
		} else {
			console.log(...args);
		}

		if (!enabled) {
			return;
		}

		buffer.push(createLine(level, args));
	};

	return {
		log: (...args: unknown[]) => {
			write("log", args);
		},
		warn: (...args: unknown[]) => {
			write("warn", args);
		},
		error: (...args: unknown[]) => {
			write("error", args);
		},
		flush: async () => {
			if (!enabled || routedByWorker || buffer.length === 0) {
				return;
			}

			const output = `${buffer.join("\n")}\n`;
			buffer.length = 0;

			try {
				await mkdir(logDir, { recursive: true });
				await appendFile(filePath, output, "utf8");
			} catch (error) {
				console.warn(
					`[ai-agent:dev-log] conv=${conversationId} | Failed to flush conversation log file`,
					error
				);
			}
		},
	};
}
