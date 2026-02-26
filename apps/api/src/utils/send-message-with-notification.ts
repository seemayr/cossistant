import { db } from "@api/db";
import {
	getConversationById,
	getMessageMetadata,
} from "@api/db/queries/conversation";
import { enqueueAiAgentTrigger } from "@api/services/ai-trigger-service";
import {
	getLatestMessageForPush,
	getNotificationData,
} from "@api/utils/notification-helpers";
import {
	triggerMemberMessageNotification,
	triggerVisitorMessageNotification,
} from "@api/utils/queue-triggers";
import { sendMemberPushNotification } from "@api/workflows/message/member-push-notifier";

/**
 * Trigger notification workflow when a member sends a message
 * This notifies other participants and the visitor
 * Also triggers AI agent response if configured
 */
export async function triggerMemberSentMessageWorkflow(params: {
	conversationId: string;
	messageId: string;
	websiteId: string;
	organizationId: string;
	senderId: string;
}): Promise<void> {
	try {
		// Fetch message metadata for the initial message timestamp
		const messageMetadata = await getMessageMetadata(db, {
			messageId: params.messageId,
			organizationId: params.organizationId,
		});

		if (!messageMetadata) {
			console.error(
				`[notification] Message ${params.messageId} not found, skipping notification`
			);
			return;
		}

		console.log(
			`[notification] Triggering member-sent notification for conversation ${params.conversationId}`
		);

		// Use BullMQ queue with deduplication
		await triggerMemberMessageNotification({
			conversationId: params.conversationId,
			messageId: params.messageId,
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			senderId: params.senderId,
			initialMessageCreatedAt: messageMetadata.createdAt,
		});

		console.log(
			`[notification] Member-sent notification queued for conversation ${params.conversationId}`
		);

		// Also trigger AI agent response workflow (if configured)
		// Fetch conversation to get the visitor ID
		const conversation = await getConversationById(db, {
			conversationId: params.conversationId,
		});

		if (conversation?.visitorId) {
			await triggerAiAgentResponseWorkflow({
				conversationId: params.conversationId,
				messageId: params.messageId,
				websiteId: params.websiteId,
				organizationId: params.organizationId,
			});
		}
	} catch (error) {
		// Log errors but don't throw - we don't want to block message creation
		console.error(
			`[notification] Failed to trigger member-sent notification for conversation ${params.conversationId}:`,
			error
		);
	}
}

/**
 * Send immediate push notifications to team members
 * This is called synchronously when a visitor sends a message
 * Uses the SAME recipient logic as email notifications (getNotificationData)
 */
async function sendImmediatePushNotifications(params: {
	conversationId: string;
	websiteId: string;
	organizationId: string;
}): Promise<void> {
	try {
		// Use the SAME function as email notifications to get recipients
		const { websiteInfo, participants } = await getNotificationData(db, {
			conversationId: params.conversationId,
			websiteId: params.websiteId,
			organizationId: params.organizationId,
		});

		if (!websiteInfo || participants.length === 0) {
			console.log(
				`[push] No recipients for push notifications: websiteInfo=${!!websiteInfo}, participants=${participants.length}`
			);
			return;
		}

		// Get latest message for the notification content
		const latestMessage = await getLatestMessageForPush(db, {
			conversationId: params.conversationId,
			organizationId: params.organizationId,
		});

		if (!latestMessage) {
			console.log("[push] No message found for push notification");
			return;
		}

		console.log(
			`[push] Sending push notifications to ${participants.length} participants for conversation ${params.conversationId}`
		);

		// Send push notifications to the same recipients as email would use
		const pushPromises = participants.map((participant) =>
			sendMemberPushNotification({
				db,
				recipient: {
					kind: "member",
					userId: participant.userId,
					memberId: participant.memberId,
					email: participant.userEmail,
				},
				conversationId: params.conversationId,
				organizationId: params.organizationId,
				websiteInfo: {
					name: websiteInfo.name,
					slug: websiteInfo.slug,
					logo: websiteInfo.logo,
				},
				messagePreview: latestMessage.text,
				senderName: latestMessage.senderName,
			})
		);

		const results = await Promise.allSettled(pushPromises);
		const sent = results.filter(
			(r) => r.status === "fulfilled" && r.value.sent
		).length;
		console.log(
			`[push] Push notification results: ${sent}/${participants.length} sent successfully`
		);
	} catch (error) {
		// Don't throw - push notification failures shouldn't block message flow
		console.error(
			`[push] Failed to send immediate push notifications for conversation ${params.conversationId}:`,
			error
		);
	}
}

/**
 * Trigger notification workflow when a visitor sends a message
 * This notifies all conversation participants (team members)
 */
export async function triggerVisitorSentMessageWorkflow(params: {
	conversationId: string;
	messageId: string;
	websiteId: string;
	organizationId: string;
	visitorId: string;
}): Promise<void> {
	// Send immediate push notifications (don't await - fire and forget)
	// This ensures push notifications are sent instantly without blocking
	sendImmediatePushNotifications({
		conversationId: params.conversationId,
		websiteId: params.websiteId,
		organizationId: params.organizationId,
	}).catch((error) => {
		console.error("[push] Background push notification failed:", error);
	});

	try {
		// Fetch message metadata for the initial message timestamp
		const messageMetadata = await getMessageMetadata(db, {
			messageId: params.messageId,
			organizationId: params.organizationId,
		});

		if (!messageMetadata) {
			console.error(
				`[notification] Message ${params.messageId} not found, skipping notification`
			);
			return;
		}

		console.log(
			`[notification] Triggering visitor-sent notification for conversation ${params.conversationId}`
		);

		// Use BullMQ queue with deduplication
		await triggerVisitorMessageNotification({
			conversationId: params.conversationId,
			messageId: params.messageId,
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			visitorId: params.visitorId,
			initialMessageCreatedAt: messageMetadata.createdAt,
		});

		console.log(
			`[notification] Visitor-sent notification queued for conversation ${params.conversationId}`
		);
	} catch (error) {
		// Log errors but don't throw - we don't want to block message creation
		console.error(
			`[notification] Failed to trigger visitor-sent notification for conversation ${params.conversationId}:`,
			error
		);
	}
}

/**
 * Trigger AI agent response workflow when a visitor sends a message
 * This checks if an AI agent is configured and active for the website
 */
export async function triggerAiAgentResponseWorkflow(params: {
	conversationId: string;
	messageId: string;
	websiteId: string;
	organizationId: string;
}): Promise<void> {
	try {
		const messageMetadata = await getMessageMetadata(db, {
			messageId: params.messageId,
			organizationId: params.organizationId,
		});

		if (!messageMetadata) {
			console.error(
				`[ai-agent] Message ${params.messageId} not found, skipping AI response queue`
			);
			return;
		}
		const result = await enqueueAiAgentTrigger({
			conversationId: params.conversationId,
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			messageId: messageMetadata.id,
			messageCreatedAt: messageMetadata.createdAt,
		});
		console.log(
			`[ai-agent] enqueue trigger result for conversation ${params.conversationId}: status=${result.status} recoveryMarked=${result.recoveryMarked}`
		);
	} catch (error) {
		// Log errors but don't throw - we don't want to block message creation
		console.error(
			`[ai-agent] Failed to trigger AI agent response workflow for conversation ${params.conversationId}:`,
			error
		);
	}
}

/**
 * Main function to trigger appropriate workflow based on message sender
 * Automatically determines which workflow to trigger based on the actor type
 */
export async function triggerMessageNotificationWorkflow(params: {
	conversationId: string;
	messageId: string;
	websiteId: string;
	organizationId: string;
	actor:
		| { type: "user"; userId: string }
		| { type: "visitor"; visitorId: string }
		| { type: "ai_agent"; aiAgentId: string };
}): Promise<void> {
	console.log(
		`[notification] Triggering message notification for actor type: ${params.actor.type}, messageId: ${params.messageId}, conversationId: ${params.conversationId}`
	);

	if (params.actor.type === "user") {
		// Member (user) sent a message -> notify other participants and visitor
		await triggerMemberSentMessageWorkflow({
			conversationId: params.conversationId,
			messageId: params.messageId,
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			senderId: params.actor.userId,
		});
	} else if (params.actor.type === "visitor") {
		// Visitor sent a message -> notify all team members
		await triggerVisitorSentMessageWorkflow({
			conversationId: params.conversationId,
			messageId: params.messageId,
			websiteId: params.websiteId,
			organizationId: params.organizationId,
			visitorId: params.actor.visitorId,
		});

		await triggerAiAgentResponseWorkflow({
			conversationId: params.conversationId,
			messageId: params.messageId,
			websiteId: params.websiteId,
			organizationId: params.organizationId,
		});
	} else if (params.actor.type === "ai_agent") {
		// AI agent sent a message -> treat as member message (notify visitor and participants)
		// For now, we skip AI agent messages as they might not need notifications
		// This can be implemented later if needed
		console.log(
			"[notification] AI agent messages are not configured for notifications yet"
		);
	}
}
