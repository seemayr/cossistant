/**
 * Identify Visitor Tool
 *
 * Links a visitor to a contact using name/email and emits a timeline event
 * when the visitor is first identified.
 */

import {
	identifyContact,
	linkVisitorToContact,
	updateContact,
} from "@api/db/queries/contact";
import { getCompleteVisitorWithContact } from "@api/db/queries/visitor";
import { realtime } from "@api/realtime/emitter";
import { createConversationEvent } from "@api/utils/conversation-event";
import { formatVisitorWithContactResponse } from "@api/utils/format-visitor";
import {
	ConversationEventType,
	TimelineItemVisibility,
} from "@cossistant/types";
import { tool } from "ai";
import { z } from "zod";
import type { ToolContext, ToolResult } from "./types";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const inputSchema = z
	.object({
		email: z
			.string()
			.email()
			.optional()
			.describe(
				"Visitor's email address only, e.g. 'john@example.com'. Do NOT include name here."
			),
		name: z
			.string()
			.max(100)
			.optional()
			.describe(
				"Visitor's name only, e.g. 'John Smith'. Do NOT include email here. Must be a single line."
			)
			.refine((val) => !val?.includes("\\n"), {
				message: "Name must be a single line without newlines",
			})
			.refine((val) => !(val && EMAIL_PATTERN.test(val)), {
				message:
					"Name should not contain an email address. Use the email field for emails.",
			}),
	})
	.refine((data) => Boolean(data.email?.trim() || data.name?.trim()), {
		message: "Provide at least a name or email",
	});

export function createIdentifyVisitorTool(ctx: ToolContext) {
	let cachedResult: ToolResult<{
		visitorId: string;
		contactId: string;
		eventEmitted: boolean;
	}> | null = null;

	return tool({
		description:
			"Identify or update a visitor's contact details. IMPORTANT: Put the name in the 'name' field (e.g., 'John Smith') and the email in the 'email' field (e.g., 'john@example.com'). Never combine them in a single field.",
		inputSchema,
		execute: async ({
			email,
			name,
		}): Promise<
			ToolResult<{
				visitorId: string;
				contactId: string;
				eventEmitted: boolean;
			}>
		> => {
			try {
				// Enforce one identify call per trigger run.
				if (cachedResult) {
					console.log(
						`[tool:identifyVisitor] conv=${ctx.conversationId} | Reusing cached result`
					);
					return cachedResult;
				}

				const trimmedEmail = email?.trim() || undefined;
				const trimmedName = name?.trim() || undefined;

				const visitorRecord = await getCompleteVisitorWithContact(ctx.db, {
					visitorId: ctx.visitorId,
				});

				if (!visitorRecord) {
					cachedResult = {
						success: false,
						error: "Visitor not found",
					};
					return cachedResult;
				}

				const previousContact = visitorRecord.contact ?? null;

				let contact = previousContact;
				let contactChanged = false;

				if (contact) {
					const updates: Record<string, string> = {};

					if (trimmedEmail && trimmedEmail !== contact.email) {
						updates.email = trimmedEmail;
					}

					if (trimmedName && trimmedName !== contact.name) {
						updates.name = trimmedName;
					}

					if (Object.keys(updates).length > 0) {
						const updated = await updateContact(ctx.db, {
							contactId: contact.id,
							websiteId: ctx.websiteId,
							data: updates,
						});

						if (!updated) {
							cachedResult = {
								success: false,
								error: "Failed to update contact",
							};
							return cachedResult;
						}

						contact = updated;
						contactChanged = true;
					}
				} else {
					if (!trimmedEmail) {
						cachedResult = {
							success: false,
							error:
								"For first-time identification, provide email in the call. Name is optional.",
						};
						return cachedResult;
					}

					contact = await identifyContact(ctx.db, {
						websiteId: ctx.websiteId,
						organizationId: ctx.organizationId,
						email: trimmedEmail,
						name: trimmedName,
					});

					await linkVisitorToContact(ctx.db, {
						visitorId: ctx.visitorId,
						contactId: contact.id,
						websiteId: ctx.websiteId,
					});

					contactChanged = true;
				}

				if (contactChanged) {
					await createConversationEvent({
						db: ctx.db,
						context: {
							conversationId: ctx.conversationId,
							organizationId: ctx.organizationId,
							websiteId: ctx.websiteId,
							visitorId: ctx.visitorId,
						},
						event: {
							type: ConversationEventType.VISITOR_IDENTIFIED,
							actorAiAgentId: ctx.aiAgentId,
							visibility: TimelineItemVisibility.PUBLIC,
						},
					});
				}

				// Emit visitorIdentified for realtime cache sync after successful identify/link.
				const updatedVisitor = await getCompleteVisitorWithContact(ctx.db, {
					visitorId: ctx.visitorId,
				});
				if (updatedVisitor?.contact) {
					try {
						await realtime.emit("visitorIdentified", {
							websiteId: updatedVisitor.websiteId,
							organizationId: updatedVisitor.organizationId,
							visitorId: updatedVisitor.id,
							userId: null,
							visitor: formatVisitorWithContactResponse(updatedVisitor),
						});
					} catch (emitError) {
						console.error(
							`[tool:identifyVisitor] conv=${ctx.conversationId} | visitor=${ctx.visitorId} | website=${updatedVisitor.websiteId} | Failed to emit visitorIdentified:`,
							emitError
						);
					}
				}

				cachedResult = {
					success: true,
					data: {
						visitorId: ctx.visitorId,
						contactId: contact.id,
						eventEmitted: contactChanged,
					},
				};
				return cachedResult;
			} catch (error) {
				console.error(
					`[tool:identifyVisitor] conv=${ctx.conversationId} | Failed:`,
					error
				);
				cachedResult = {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to identify visitor",
				};
				return cachedResult;
			}
		},
	});
}
