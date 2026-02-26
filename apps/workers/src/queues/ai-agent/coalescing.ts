export type QueueMessageMetadata = {
	id: string;
	userId: string | null;
	visitorId: string | null;
};

export function isTriggerableMessage(metadata: QueueMessageMetadata): boolean {
	return Boolean(metadata.userId || metadata.visitorId);
}
