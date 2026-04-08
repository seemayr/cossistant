import { env } from "@api/env";

export type MailProvider = "resend" | "ses";

const DEFAULT_RESEND_INBOUND_EMAIL_DOMAIN = "inbound.cossistant.com";
const DEFAULT_SES_INBOUND_EMAIL_DOMAIN = "ses-inbound.cossistant.com";

export function getEmailTransportProvider(): MailProvider {
	return env.EMAIL_TRANSPORT_PROVIDER === "ses" ? "ses" : "resend";
}

export function getInboundEmailDomain(provider: MailProvider): string {
	if (provider === "ses") {
		return env.EMAIL_SES_INBOUND_DOMAIN || DEFAULT_SES_INBOUND_EMAIL_DOMAIN;
	}

	return env.EMAIL_RESEND_INBOUND_DOMAIN || DEFAULT_RESEND_INBOUND_EMAIL_DOMAIN;
}

export function getActiveInboundEmailDomain(): string {
	return getInboundEmailDomain(getEmailTransportProvider());
}
