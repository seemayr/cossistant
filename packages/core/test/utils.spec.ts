import {
	computeBackoffDelay,
	DroppingQueue,
	ENVELOPE_VERSION,
	type InEvent,
	parseInbound,
} from "../events";

type TestCase = {
	readonly name: string;
	readonly fn: () => void | Promise<void>;
};

const tests: TestCase[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
	tests.push({ name, fn });
}

function expect(condition: unknown, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
	if (actual !== expected) {
		throw new Error(`${message} (expected ${expected}, received ${actual})`);
	}
}

test("computeBackoffDelay stays within bounds", () => {
	const originalRandom = Math.random;
	Math.random = () => 0.5;
	try {
		const delay = computeBackoffDelay(3, 500, 30_000);
		expect(delay >= 500, "delay should be at least base interval");
		expect(delay <= 30_000, "delay should not exceed cap");
	} finally {
		Math.random = originalRandom;
	}
});

test("DroppingQueue discards oldest entries when full", () => {
	const queue = new DroppingQueue<number>(2);
	queue.push(1);
	queue.push(2);
	const result = queue.push(3);
	expect(result.dropped, "queue push should drop when capacity exceeded");
	expectEqual(result.droppedValue, 1, "oldest value must be dropped");
	expectEqual(queue.size(), 2, "queue should stay at capacity");
	expectEqual(queue.droppedCount(), 1, "dropped counter increments");
});

test("parseInbound validates correct envelopes", () => {
	const envelope = {
		v: ENVELOPE_VERSION,
		type: "pong",
		ts: Date.now(),
		id: "pong-id-1234",
		payload: { sequence: 1 },
	};
	const parsed = parseInbound(envelope);
	expect(parsed.ok, "expected parser to accept valid envelope");
	if (parsed.ok) {
		const event: InEvent = parsed.value;
		expectEqual(event.type, "pong", "expected pong event");
	}
});

test("parseInbound rejects unsupported versions", () => {
	const parsed = parseInbound({
		v: 999,
		type: "pong",
		ts: Date.now(),
		id: "bad",
		payload: { sequence: 1 },
	});
	expect(!parsed.ok, "expected parse to fail");
	if (!parsed.ok) {
		expectEqual(parsed.error.code, "unsupported_version", "wrong error code");
	}
});

async function run(): Promise<void> {
	let passed = 0;
	for (const { name, fn } of tests) {
		try {
			await fn();
			passed += 1;
			console.log(`✔ ${name}`);
		} catch (error) {
			console.error(`✖ ${name}: ${(error as Error).message}`);
		}
	}
	console.log(
		`Executed ${tests.length} tests: ${passed} passed, ${tests.length - passed} failed.`
	);
}

void run();
