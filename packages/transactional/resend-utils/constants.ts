// Email system constants
export const ANTHONY_EMAIL = "anthony@cossistant.com";
export const TRANSACTIONAL_EMAIL_DOMAIN = "updates.cossistant.com";
export const DEFAULT_RESEND_AUDIENCE_ID =
	"668cc440-8027-4a31-9f8f-2633efbf12a4";
export const RESEND_AUDIENCE_ID =
	process.env.RESEND_AUDIENCE_ID?.trim() || DEFAULT_RESEND_AUDIENCE_ID;

// Email variant to sender mapping (only notifications and marketing)
export const VARIANT_TO_FROM_MAP = {
	notifications: "Cossistant <notifications@mail.cossistant.com>",
	marketing: "Anthony from Cossistant <anthony@updates.cossistant.com>",
} as const;
