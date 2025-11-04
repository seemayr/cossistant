import { Hr, Link, Tailwind, Text } from "@react-email/components";

export function Footer({
        email,
        marketing,
        notificationSettingsUrl,
}: {
        email: string;
        marketing?: boolean;
        notificationSettingsUrl?: string;
}) {
        const settingsUrl =
                notificationSettingsUrl ?? "https://app.cossistant.com/settings/notifications";

        if (marketing) {
                return (
                        <Tailwind>
                                <Hr className="mx-0 my-6 w-full border border-neutral-200" />
                                <Text className="text-[12px] leading-6 text-neutral-500">
                                        We send product updates occasionally – no spam, no nonsense. Don&apos;t want
                                        to get these emails?{" "}
                                        <Link
                                                className="text-neutral-700 underline"
                                                href={settingsUrl}
                                        >
                                                Unsubscribe here.
                                        </Link>
                                </Text>
                                <Text className="text-[12px] text-neutral-500">
                                        Cossistant, Inc.
                                        <br />
                                        San Francisco, CA
                                </Text>
                        </Tailwind>
                );
        }

        return (
                <Tailwind>
                        <Hr className="mx-0 my-6 w-full border border-neutral-200" />
                        <Text className="text-[12px] leading-6 text-neutral-500">
                                This email was intended for <span className="text-black">{email}</span>. If you were not
                                expecting this, you can safely ignore it. If you&apos;re concerned about your
                                account&apos;s safety, please reply to this email to get in touch with us.
                        </Text>

                        {notificationSettingsUrl && (
                                <Text className="text-[12px] leading-6 text-neutral-500">
                                        Don’t want to get these emails?{" "}
                                        <Link
                                                className="text-neutral-700 underline"
                                                href={notificationSettingsUrl}
                                        >
                                                Adjust your notification settings
                                        </Link>
                                </Text>
                        )}
                        <Text className="text-[12px] text-neutral-500">
                                Cossistant, Inc.
                                <br />
                                San Francisco, CA
                        </Text>
                </Tailwind>
        );
}
