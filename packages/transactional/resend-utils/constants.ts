// Email system constants
export const ANTHONY_EMAIL = "anthony@cossistant.com";
export const TRANSACTIONAL_EMAIL_DOMAIN = "updates.cossistant.com";
export const DEFAULT_NOTIFICATION_FROM =
	"Cossistant <notifications@mail.cossistant.com>";
export const DEFAULT_MARKETING_FROM =
	"Anthony from Cossistant <anthony@updates.cossistant.com>";
export const DEFAULT_RESEND_AUDIENCE_ID =
	"668cc440-8027-4a31-9f8f-2633efbf12a4";
export const RESEND_AUDIENCE_ID =
	process.env.RESEND_AUDIENCE_ID?.trim() || DEFAULT_RESEND_AUDIENCE_ID;

// Email variant to sender mapping (only notifications and marketing)
export const VARIANT_TO_FROM_MAP = {
	notifications:
		process.env.EMAIL_NOTIFICATION_FROM?.trim() || DEFAULT_NOTIFICATION_FROM,
	marketing: process.env.EMAIL_MARKETING_FROM?.trim() || DEFAULT_MARKETING_FROM,
} as const;
