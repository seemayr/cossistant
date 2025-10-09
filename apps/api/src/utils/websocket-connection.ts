import { WEBSOCKET_ERRORS } from "@api/utils/websocket-errors";
import type { RawSocket, WebSocketAuthSuccess } from "@api/ws/socket";
import type { RealtimeEvent } from "@cossistant/types/realtime-events";
import type { ServerWebSocket } from "bun";

export type AuthResult = WebSocketAuthSuccess;

export type WSContext = {
	send: (data: string | ArrayBuffer) => void;
	close: (code?: number, reason?: string) => void;
	raw?: RawSocket;
};

type ConnectionError = {
	error: string;
	message: string;
	code?: number;
};

export async function handleAuthenticationFailure(
	ws: WSContext,
	connectionId: string
): Promise<void> {
	console.error(
		`[WebSocket] Authentication failed for connection: ${connectionId}`
	);
	const error = WEBSOCKET_ERRORS.authenticationFailed();
	ws.send(JSON.stringify(error));
	ws.close(error.code, error.error);
}

export async function handleIdentificationFailure(
	ws: WSContext,
	connectionId: string
): Promise<void> {
	console.error(
		`[WebSocket] No user ID or visitor ID provided for connection: ${connectionId}`
	);
	const error = WEBSOCKET_ERRORS.identificationRequired();
	ws.send(JSON.stringify(error));
	ws.close(error.code, error.error);
}

export function storeConnectionId(ws: WSContext, connectionId: string): void {
	if (ws.raw) {
		(ws.raw as ServerWebSocket & { connectionId?: string }).connectionId =
			connectionId;
	}
}

export function sendConnectionEstablishedMessage(
	ws: WSContext,
	connectionId: string,
	authResult: AuthResult
): void {
	ws.send(
		JSON.stringify({
			type: "CONNECTION_ESTABLISHED",
			payload: {
				connectionId,
				userId: authResult.userId,
				visitorId: authResult.visitorId,
				organizationId: authResult.organizationId,
				websiteId: authResult.websiteId,
				timestamp: Date.now(),
			},
		})
	);
}

export function createConnectionEvent(
	authResult: AuthResult,
	connectionId: string
): RealtimeEvent {
	const isUserConnection = !!authResult.userId;

if (isUserConnection) {
if (!authResult.userId) {
throw new Error("No userId available for user connection");
}
if (!(authResult.websiteId && authResult.organizationId)) {
			throw new Error(
				"Missing website or organization metadata for connection event"
			);
		}
return {
type: "USER_CONNECTED",
payload: {
userId: authResult.userId,
connectionId,
timestamp: Date.now(),
organizationId: authResult.organizationId,
websiteId: authResult.websiteId,
visitorId: null,
},
timestamp: Date.now(),
websiteId: authResult.websiteId,
organizationId: authResult.organizationId,
visitorId: null,
		};
	}

	// Only create visitor event if we have a valid visitorId
	if (!authResult.visitorId) {
		throw new Error("No visitorId available for visitor connection");
	}

	if (!(authResult.websiteId && authResult.organizationId)) {
		throw new Error(
			"Missing website or organization metadata for connection event"
		);
	}

return {
type: "VISITOR_CONNECTED",
payload: {
visitorId: authResult.visitorId,
connectionId,
timestamp: Date.now(),
organizationId: authResult.organizationId,
websiteId: authResult.websiteId,
},
timestamp: Date.now(),
websiteId: authResult.websiteId,
organizationId: authResult.organizationId,
visitorId: authResult.visitorId,
	};
}

export async function updatePresenceIfNeeded(
	authResult: AuthResult
): Promise<void> {
	if (!authResult.websiteId) {
		return;
	}

	const presenceId = authResult.userId || authResult.visitorId;
	if (!presenceId) {
		return;
	}

	console.log("[WebSocket] Presence update (local-only)", {
		status: "online",
		presenceId,
		websiteId: authResult.websiteId,
	});
}

export function getConnectionIdFromSocket(ws: WSContext): string | undefined {
	return ws.raw
		? (ws.raw as ServerWebSocket & { connectionId?: string }).connectionId
		: undefined;
}

export function sendError(ws: WSContext, error: ConnectionError): void {
	ws.send(JSON.stringify(error));
}
