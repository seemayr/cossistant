import { ANTHONY_EMAIL, TRANSACTIONAL_EMAIL_DOMAIN } from "@api/constants";
import { env } from "@api/env";
import { generateShortPrimaryId } from "@api/utils/db/ids";
import type { ReactNode } from "react";
import { Resend } from "resend";

const SUPPORT_EMAIL = "support@cossistant.com";

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export const resend = resendClient;

export const VARIANT_TO_FROM_MAP = {
        primary: `Cossistant <system@${TRANSACTIONAL_EMAIL_DOMAIN}>`,
        notifications: `Cossistant <notifications@${TRANSACTIONAL_EMAIL_DOMAIN}>`,
        marketing: `Anthony from Cossistant.com <${ANTHONY_EMAIL}>`,
} as const;

export type ResendEmailVariant = keyof typeof VARIANT_TO_FROM_MAP;

export type ResendEmailOptions = {
        to: string | string[];
        from?: string;
        variant?: ResendEmailVariant;
        bcc?: string | string[];
        replyTo?: string;
        subject: string;
        text?: string;
        react?: ReactNode;
        scheduledAt?: Date | string;
        headers?: Record<string, string>;
        tags?: Array<{ name: string; value: string }>;
};

export type ResendBulkEmailOptions = ResendEmailOptions[];

const normalizeArrayField = (value?: string | string[]) => {
        if (!value) {
                return undefined;
        }

        if (Array.isArray(value)) {
                return value.length > 0 ? value : undefined;
        }

        return value;
};

const marketingUnsubscribeUrl = `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/email/unsubscribe`;

const resendEmailForOptions = (opts: ResendEmailOptions) => {
        const variant = opts.variant ?? "primary";
        const replyTo =
                opts.replyTo === "noreply" ? undefined : opts.replyTo || SUPPORT_EMAIL;

        const headers =
                variant === "marketing"
                        ? {
                                  ...(opts.headers || {}),
                                  "List-Unsubscribe":
                                          opts.headers?.["List-Unsubscribe"] ||
                                          `<${marketingUnsubscribeUrl}>`,
                          }
                        : opts.headers;

        return {
                to: opts.to,
                from: opts.from || VARIANT_TO_FROM_MAP[variant],
                bcc: normalizeArrayField(opts.bcc),
                ...(replyTo ? { replyTo } : {}),
                subject: opts.subject,
                text: opts.text,
                react: opts.react,
                scheduledAt: opts.scheduledAt,
                headers,
                tags: opts.tags,
        };
};

const ensureResendClient = () => {
        if (resendClient) {
                return resendClient;
        }

        console.info("RESEND_API_KEY is not set in the environment. Skipping Resend call.");
        return null;
};

export type ContactData = {
	email: string;
	firstName?: string;
	lastName?: string;
	unsubscribed?: boolean;
};

export const addContactToAudience = async (
        audienceId: string,
        contactData: ContactData
): Promise<boolean> => {
        const client = ensureResendClient();

        if (!client) {
                return false;
        }

        try {
                await client.contacts.create({
                        email: contactData.email,
                        firstName: contactData.firstName,
                        lastName: contactData.lastName,
                        unsubscribed: contactData.unsubscribed ?? false,
                        audienceId,
                });

                console.log(
                        `Successfully added contact ${contactData.email} to Resend audience ${audienceId}`
                );
                return true;
        } catch (error) {
                console.error("Failed to add contact to Resend audience:", error);
                // Don't throw error to avoid blocking user operations
                return false;
        }
};

export const removeContactFromAudience = async (
        audienceId: string,
        email: string
): Promise<boolean> => {
        const client = ensureResendClient();

        if (!client) {
                return false;
        }

        try {
                await client.contacts.remove({
                        email,
                        audienceId,
                });

                console.log(
                        `Successfully removed contact ${email} from Resend audience ${audienceId}`
                );
                return true;
        } catch (error) {
                console.error("Failed to remove contact from Resend audience:", error);
                // Don't throw error to avoid blocking user operations
                return false;
        }
};

export const removeContactFromAudienceById = async (
        audienceId: string,
        contactId: string
): Promise<boolean> => {
        const client = ensureResendClient();

        if (!client) {
                return false;
        }

        try {
                await client.contacts.remove({
                        id: contactId,
                        audienceId,
                });

                console.log(
                        `Successfully removed contact ${contactId} from Resend audience ${audienceId}`
                );
                return true;
        } catch (error) {
                console.error("Failed to remove contact from Resend audience:", error);
                // Don't throw error to avoid blocking user operations
                return false;
        }
};

export const updateContactSubscriptionStatus = async (
        audienceId: string,
        email: string,
        unsubscribed: boolean
): Promise<boolean> => {
        const client = ensureResendClient();

        if (!client) {
                return false;
        }

        try {
                await client.contacts.update({
                        email,
                        audienceId,
                        unsubscribed,
                });

                console.log(
                        `Successfully updated contact ${email} subscription status to ${unsubscribed ? "unsubscribed" : "subscribed"}`
                );
                return true;
        } catch (error) {
                console.error("Failed to update contact subscription status:", error);
                // Don't throw error to avoid blocking user operations
                return false;
        }
};

export const addUserToDefaultAudience = async (
	email: string,
	name?: string
): Promise<boolean> => {
	const firstName = name?.split(" ")[0] || "";
	const lastName = name?.split(" ").slice(1).join(" ") || "";

	return addContactToAudience(env.RESEND_AUDIENCE_ID, {
		email,
		firstName,
		lastName,
		unsubscribed: false,
	});
};

export const removeUserFromDefaultAudience = async (
	email: string
): Promise<boolean> => removeContactFromAudience(env.RESEND_AUDIENCE_ID, email);

export const sendEmailViaResend = async (opts: ResendEmailOptions) => {
        const client = ensureResendClient();

        if (!client) {
                return;
        }

        return client.emails.send(resendEmailForOptions(opts));
};

export const sendBatchEmailViaResend = async (
        opts: ResendBulkEmailOptions,
        options?: { idempotencyKey?: string }
) => {
        const client = ensureResendClient();

        if (!client) {
                return { data: null, error: null };
        }

        if (opts.length === 0) {
                return { data: null, error: null };
        }

        const payload = opts.map(resendEmailForOptions);

        const idempotencyKey = options?.idempotencyKey || undefined;

        return client.batch.send(
                payload,
                idempotencyKey ? { idempotencyKey } : undefined
        );
};

type SendEmailParams = {
        to: string[];
        from?: string;
        subject: string;
        marketing?: boolean;
        replyTo?: string;
        refId?: string;
        includeUnsubscribe?: boolean;
        variant?: ResendEmailVariant;
        headers?: Record<string, string>;
        tags?: Array<{ name: string; value: string }>;
        bcc?: string | string[];
        text?: string;
        scheduledAt?: Date | string;
} & {
        content: ReactNode;
};

export const sendEmail = async ({
        to,
        subject,
        from,
        marketing = false,
        replyTo,
        refId = generateShortPrimaryId(),
        includeUnsubscribe = true,
        variant,
        headers: customHeaders,
        tags,
        bcc,
        text,
        scheduledAt,
        content,
}: SendEmailParams) => {
        const normalizedRecipients = to;
        const headers: Record<string, string> = {
                ...(customHeaders || {}),
                "X-Entity-Ref-ID": refId,
        };

        if (includeUnsubscribe && !headers["List-Unsubscribe"]) {
                const baseAppUrl = env.PUBLIC_APP_URL.replace(/\/$/, "");
                const unsubscribeUrl =
                        normalizedRecipients.length === 1
                                ? `${baseAppUrl}/email/unsubscribe?email=${encodeURIComponent(normalizedRecipients[0])}`
                                : `${baseAppUrl}/email/unsubscribe`;

                headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
                headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
        }

        return sendEmailViaResend({
                to: normalizedRecipients,
                from,
                replyTo,
                subject: subject.replace(/\s*\n\s*/g, " "),
                react: content,
                headers,
                variant: variant ?? (marketing ? "marketing" : "notifications"),
                tags,
                bcc,
                text,
                scheduledAt,
        });
};

export default resendClient;
