import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { CossistantRestClient } from "./rest-client";

const visitorId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const trackedVisitorId = "01ARZ3NDEKTSV4RRFFQ69G5FAA";

const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"navigator"
);
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"window"
);

type StorageValueMap = Record<string, string>;

function createStorage() {
	const store: StorageValueMap = {};

	return {
		getItem(key: string) {
			return Object.hasOwn(store, key) ? store[key] : null;
		},
		setItem(key: string, value: string) {
			store[key] = String(value);
		},
		removeItem(key: string) {
			delete store[key];
		},
		clear() {
			for (const key of Object.keys(store)) {
				delete store[key];
			}
		},
		key(index: number) {
			return Object.keys(store)[index] ?? null;
		},
		get length() {
			return Object.keys(store).length;
		},
	} satisfies Storage;
}

function installBrowserEnvironment(params: {
	href: string;
	referrer: string;
	title: string;
}) {
	const listeners = new Map<string, Set<() => void>>();
	const storage = createStorage();
	const location = {
		href: params.href,
	};
	const history = {
		pushState: (
			_state: unknown,
			_unused: string,
			url?: string | URL | null
		) => {
			if (!url) {
				return;
			}
			location.href = new URL(String(url), location.href).toString();
		},
		replaceState: (
			_state: unknown,
			_unused: string,
			url?: string | URL | null
		) => {
			if (!url) {
				return;
			}
			location.href = new URL(String(url), location.href).toString();
		},
	};
	const windowObject = {
		location,
		history,
		localStorage: storage,
		addEventListener(type: string, listener: () => void) {
			const existing = listeners.get(type) ?? new Set<() => void>();
			existing.add(listener);
			listeners.set(type, existing);
		},
		removeEventListener(type: string, listener: () => void) {
			listeners.get(type)?.delete(listener);
		},
		dispatch(type: string) {
			for (const listener of listeners.get(type) ?? []) {
				listener();
			}
		},
	};

	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: windowObject,
	});
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			referrer: params.referrer,
			title: params.title,
		},
	});
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: {
			language: "en-US",
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0 Safari/537.36",
		},
	});
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: storage,
	});

	return windowObject;
}

function createTrackedVisitorResponse() {
	return {
		id: trackedVisitorId,
		browser: "Chrome",
		browserVersion: "134.0",
		os: "macOS",
		osVersion: "15.0",
		device: "Mac",
		deviceType: "desktop",
		ip: null,
		city: null,
		region: null,
		country: null,
		countryCode: null,
		latitude: null,
		longitude: null,
		language: "en-US",
		timezone: "UTC",
		screenResolution: "1728x1117",
		viewport: "1440x900",
		createdAt: "2026-03-11T03:00:00.000Z",
		updatedAt: "2026-03-11T03:00:00.000Z",
		lastSeenAt: "2026-03-11T03:00:00.000Z",
		websiteId: "site-1",
		organizationId: "org-1",
		blockedAt: null,
		blockedByUserId: null,
		isBlocked: false,
		attribution: null,
		currentPage: null,
		contact: null,
	};
}

async function flushAsyncWork() {
	await new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(() => {
	globalThis.fetch = originalFetch;
});

afterEach(() => {
	if (originalWindowDescriptor) {
		Object.defineProperty(globalThis, "window", originalWindowDescriptor);
	} else {
		Reflect.deleteProperty(globalThis, "window");
	}

	if (originalNavigatorDescriptor) {
		Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
	} else {
		Reflect.deleteProperty(globalThis, "navigator");
	}

	if (originalDocument) {
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: originalDocument,
		});
	} else {
		Reflect.deleteProperty(globalThis, "document");
	}

	if (originalLocalStorage) {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: originalLocalStorage,
		});
	} else {
		Reflect.deleteProperty(globalThis, "localStorage");
	}

	globalThis.fetch = originalFetch;
});

function createFeedbackResponse() {
	return {
		feedback: {
			id: "feedback-1",
			organizationId: "org-1",
			websiteId: "site-1",
			conversationId: "conv-1",
			visitorId,
			contactId: "contact-1",
			rating: 5,
			topic: "Bug",
			comment: "The drawer closes unexpectedly",
			trigger: "billing_page",
			source: "widget",
			createdAt: "2026-03-11T03:00:00.000Z",
			updatedAt: "2026-03-11T03:00:00.000Z",
		},
	};
}

describe("CossistantRestClient.submitFeedback", () => {
	it("posts feedback with visitor headers and topic context", async () => {
		const client = new CossistantRestClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});
		client.setWebsiteContext("site-1", visitorId);

		const previousFetch = globalThis.fetch;
		const fetchMock = mock(
			async () =>
				new Response(JSON.stringify(createFeedbackResponse()), {
					status: 201,
					headers: { "Content-Type": "application/json" },
				})
		);
		globalThis.fetch = fetchMock as typeof fetch;

		try {
			const response = await client.submitFeedback({
				rating: 5,
				topic: "Bug",
				comment: "The drawer closes unexpectedly",
				trigger: "billing_page",
				conversationId: "conv-1",
				contactId: "contact-1",
			});

			const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
			const headers = init.headers as Record<string, string>;
			const body = JSON.parse(String(init.body)) as Record<string, string>;

			expect(url).toBe("https://api.example.com/feedback");
			expect(init.method).toBe("POST");
			expect(headers["X-Visitor-Id"]).toBe(visitorId);
			expect(body).toEqual({
				rating: 5,
				source: "widget",
				topic: "Bug",
				comment: "The drawer closes unexpectedly",
				trigger: "billing_page",
				conversationId: "conv-1",
				contactId: "contact-1",
			});
			expect(response.feedback.topic).toBe("Bug");
			expect(response.feedback.trigger).toBe("billing_page");
		} finally {
			globalThis.fetch = previousFetch;
		}
	});

	it("throws when no visitor context is available", async () => {
		const client = new CossistantRestClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});

		await expect(client.submitFeedback({ rating: 4 })).rejects.toThrow(
			"Visitor ID is required to submit feedback"
		);
	});
});

describe("CossistantRestClient.submitConversationRating", () => {
	it("keeps the legacy rating request shape intact", async () => {
		const client = new CossistantRestClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});
		client.setWebsiteContext("site-1", visitorId);

		const previousFetch = globalThis.fetch;
		const fetchMock = mock(
			async () =>
				new Response(
					JSON.stringify({
						conversationId: "conv-1",
						rating: 4,
						ratedAt: "2026-03-11T03:00:00.000Z",
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					}
				)
		);
		globalThis.fetch = fetchMock as typeof fetch;

		try {
			await client.submitConversationRating({
				conversationId: "conv-1",
				rating: 4,
				comment: "Solid support flow",
			});

			const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
			const headers = init.headers as Record<string, string>;
			const body = JSON.parse(String(init.body)) as Record<string, string>;

			expect(url).toBe("https://api.example.com/conversations/conv-1/rating");
			expect(init.method).toBe("POST");
			expect(headers["X-Visitor-Id"]).toBe(visitorId);
			expect(body).toEqual({
				rating: 4,
				comment: "Solid support flow",
			});
		} finally {
			globalThis.fetch = previousFetch;
		}
	});
});

describe("CossistantRestClient.getWebsite visitor tracking", () => {
	it("tracks the initial pageview, skips duplicate SPA URLs, and tracks route changes", async () => {
		const windowObject = installBrowserEnvironment({
			href: "https://app.example.com/pricing?utm_source=hn&utm_medium=referral&utm_campaign=launch#hero",
			referrer: "https://news.ycombinator.com/item?id=1",
			title: "Pricing | Cossistant",
		});
		const client = new CossistantRestClient({
			apiUrl: "https://api.example.com",
			publicKey: "pk_test",
		});
		const fetchMock = mock(async (input: string | URL, init?: RequestInit) => {
			const url = String(input);

			if (url.endsWith("/websites")) {
				return new Response(
					JSON.stringify({
						id: "site-1",
						name: "Cossistant",
						domain: "app.example.com",
						description: null,
						logoUrl: null,
						organizationId: "org-1",
						status: "active",
						lastOnlineAt: null,
						availableHumanAgents: [],
						availableAIAgents: [],
						visitor: {
							id: trackedVisitorId,
							isBlocked: false,
							language: "en-US",
							contact: null,
						},
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					}
				);
			}

			if (url.endsWith(`/visitors/${trackedVisitorId}`)) {
				return new Response(JSON.stringify(createTrackedVisitorResponse()), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
		});
		globalThis.fetch = fetchMock as typeof fetch;

		try {
			await client.getWebsite();
			await flushAsyncWork();

			expect(fetchMock).toHaveBeenCalledTimes(2);
			const firstPatch = fetchMock.mock.calls[1] as [string, RequestInit];
			const firstBody = JSON.parse(String(firstPatch[1].body)) as {
				attribution?: {
					firstTouch?: {
						channel?: string;
						referrer?: {
							domain?: string | null;
						};
					};
				};
				currentPage?: {
					path?: string | null;
					url?: string | null;
				};
			};

			expect(firstBody.attribution?.firstTouch?.channel).toBe("referral");
			expect(firstBody.attribution?.firstTouch?.referrer?.domain).toBe(
				"news.ycombinator.com"
			);
			expect(firstBody.currentPage?.path).toBe("/pricing");
			expect(firstBody.currentPage?.url).toBe(
				"https://app.example.com/pricing?utm_source=hn&utm_medium=referral&utm_campaign=launch"
			);

			windowObject.history.pushState(
				{},
				"",
				"/pricing?utm_source=hn&utm_medium=referral&utm_campaign=launch#details"
			);
			await flushAsyncWork();
			expect(fetchMock).toHaveBeenCalledTimes(2);

			windowObject.history.pushState(
				{},
				"",
				"/docs?utm_source=hn&utm_medium=referral&utm_campaign=launch"
			);
			await flushAsyncWork();

			expect(fetchMock).toHaveBeenCalledTimes(3);
			const secondPatch = fetchMock.mock.calls[2] as [string, RequestInit];
			const secondBody = JSON.parse(String(secondPatch[1].body)) as {
				currentPage?: {
					path?: string | null;
				};
			};
			expect(secondBody.currentPage?.path).toBe("/docs");
		} finally {
			client.destroy();
		}
	});
});
