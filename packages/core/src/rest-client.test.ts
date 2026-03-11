import { describe, expect, it, mock } from "bun:test";
import { CossistantRestClient } from "./rest-client";

const visitorId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

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

		const originalFetch = globalThis.fetch;
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
			globalThis.fetch = originalFetch;
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

		const originalFetch = globalThis.fetch;
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
			globalThis.fetch = originalFetch;
		}
	});
});
