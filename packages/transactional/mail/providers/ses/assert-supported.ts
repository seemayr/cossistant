import type { PreparedMail } from "../../core/types";

export function assertSupportedBySESTransport(mail: PreparedMail) {
	if (mail.scheduledAt) {
		throw new Error(
			"SES transport does not support scheduled sends in this rollout."
		);
	}

	if (mail.tags && mail.tags.length > 0) {
		throw new Error(
			"SES transport does not support provider tags in this rollout."
		);
	}
}
