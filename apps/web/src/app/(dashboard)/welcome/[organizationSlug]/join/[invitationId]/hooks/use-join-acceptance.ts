"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";

export type InvitationStatus =
	| "pending"
	| "accepted"
	| "rejected"
	| "canceled"
	| "expired"
	| "not-found";

export type JoinAcceptanceState =
	| "accepting"
	| "success"
	| "wrong-account"
	| "invalid-invitation"
	| "error";

type UseJoinAcceptanceParams = {
	invitationId: string;
	invitationStatus: InvitationStatus;
	isInvitationValid: boolean;
	isSignedInEmailMatchingInvitation: boolean | null;
	organizationName: string;
};

export function useJoinAcceptance({
	invitationId,
	invitationStatus,
	isInvitationValid,
	isSignedInEmailMatchingInvitation,
	organizationName,
}: UseJoinAcceptanceParams) {
	const router = useRouter();
	const [state, setState] = useState<JoinAcceptanceState>("accepting");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const hasStartedRef = useRef(false);

	const runAcceptance = useCallback(async () => {
		if (!isInvitationValid) {
			setState("invalid-invitation");
			return;
		}

		if (isSignedInEmailMatchingInvitation === false) {
			setState("wrong-account");
			return;
		}

		setState("accepting");
		setErrorMessage(null);

		const response = await authClient.organization.acceptInvitation({
			invitationId,
		});

		if (response.error) {
			const message =
				response.error.message ||
				"We couldn't accept this invitation. Please ask your admin to send a new one.";
			const normalizedMessage = message.toLowerCase();

			if (normalizedMessage.includes("recipient")) {
				setState("wrong-account");
				return;
			}

			if (
				normalizedMessage.includes("invitation_not_found") ||
				normalizedMessage.includes("invitation not found") ||
				normalizedMessage.includes("expired")
			) {
				setState("invalid-invitation");
				return;
			}

			setState("error");
			setErrorMessage(message);
			return;
		}

		setState("success");
		toast.success(`You joined ${organizationName}.`);
		router.replace("/select");
	}, [
		invitationId,
		isInvitationValid,
		isSignedInEmailMatchingInvitation,
		organizationName,
		router,
	]);

	useEffect(() => {
		if (hasStartedRef.current) {
			return;
		}

		hasStartedRef.current = true;
		void runAcceptance();
	}, [runAcceptance]);

	const retry = useCallback(() => {
		if (!isInvitationValid && invitationStatus !== "pending") {
			setState("invalid-invitation");
			return;
		}
		void runAcceptance();
	}, [invitationStatus, isInvitationValid, runAcceptance]);

	return {
		state,
		errorMessage,
		retry,
	};
}
