import {
        Body,
        Container,
        Head,
        Heading,
        Html,
        Img,
        Link,
        Preview,
        Section,
        Tailwind,
        Text,
} from "@react-email/components";

// Needed for email templates, don't remove
import React from "react";

import { LOGO_URL } from "../constants";
import { Footer } from "./components/footer";

type ConversationDigestMessage = {
        sender: string;
        preview: string;
        createdAt: string;
};

type ConversationUnseenDigestEmailProps = {
        recipientName?: string | null;
        recipientEmail: string;
        conversationTitle?: string | null;
        conversationUrl: string;
        messages: ConversationDigestMessage[];
        totalMessages: number;
        notificationSettingsUrl?: string;
};

const MAX_DISPLAYED_MESSAGES = 3;

const parseTimestamp = (value: string): Date | null => {
        const parsed = Date.parse(value);

        if (Number.isNaN(parsed)) {
                return null;
        }

        return new Date(parsed);
};

const formatTimestamp = (value: string): string => {
        const parsedDate = parseTimestamp(value);

        if (!parsedDate) {
                        return value;
        }

        return parsedDate.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "numeric",
        });
};

export const ConversationUnseenDigestEmail = ({
        recipientName,
        recipientEmail,
        conversationTitle,
        conversationUrl,
        messages,
        totalMessages,
        notificationSettingsUrl,
}: ConversationUnseenDigestEmailProps) => {
        const sanitizedTitle = conversationTitle?.trim() || "your conversation";
        const previewText =
                totalMessages === 1
                        ? `New unread message in ${sanitizedTitle}`
                        : `${totalMessages} unread messages in ${sanitizedTitle}`;

        const displayedMessages = messages
                .slice(-MAX_DISPLAYED_MESSAGES)
                .reverse();

        const remainingCount = Math.max(totalMessages - displayedMessages.length, 0);

        return (
                <Html dir="ltr" lang="en">
                        <Tailwind>
                                <Head />
                                <Preview>{previewText}</Preview>
                                <Body className="mx-auto my-auto bg-white font-sans">
                                        <Container className="mx-auto my-8 max-w-[600px] px-8 py-8">
                                                <Section className="mt-4">
                                                        <Img
                                                                src={LOGO_URL}
                                                                height="32"
                                                                alt="Cossistant"
                                                        />
                                                </Section>

                                                <Section className="my-8">
                                                        <Heading className="my-0 text-xl font-semibold text-black">
                                                                {previewText}
                                                        </Heading>
                                                        <Text className="mt-2 text-[14px] text-neutral-600">
                                                                Hi {recipientName || "there"}, here&apos;s what you&apos;ve missed in
                                                                {" "}
                                                                <strong>{sanitizedTitle}</strong> since you last checked in.
                                                        </Text>
                                                </Section>

                                                <Section className="rounded-xl border border-solid border-neutral-200 p-6">
                                                        {displayedMessages.map((message, index) => (
                                                                <Section
                                                                        key={`${message.createdAt}-${index}`}
                                                                        className={index > 0 ? "mt-4" : ""}
                                                                >
                                                                        <Text className="my-0 text-[12px] font-medium text-neutral-500">
                                                                                <span className="text-neutral-700">{message.sender}</span>
                                                                                {" "}•{" "}
                                                                                {formatTimestamp(message.createdAt)}
                                                                        </Text>
                                                                        <Text
                                                                                className="mt-2 rounded-lg rounded-tl-none bg-neutral-100 px-4 py-3 text-sm leading-5 text-neutral-800"
                                                                                style={{ whiteSpace: "pre-wrap" }}
                                                                        >
                                                                                {message.preview}
                                                                        </Text>
                                                                </Section>
                                                        ))}
                                                        {remainingCount > 0 && (
                                                                <Text className="mt-4 text-center text-[12px] text-neutral-500">
                                                                        {remainingCount} more {remainingCount === 1 ? "message" : "messages"}
                                                                        {" "}are waiting for you in this conversation.
                                                                </Text>
                                                        )}
                                                        <Link
                                                                className="mt-6 block rounded-lg bg-neutral-900 px-6 py-3 text-center text-[13px] font-medium text-white no-underline"
                                                                href={conversationUrl}
                                                        >
                                                                Reply in Cossistant
                                                        </Link>
                                                </Section>

                                                <Footer
                                                        email={recipientEmail}
                                                        notificationSettingsUrl={notificationSettingsUrl}
                                                />
                                        </Container>
                                </Body>
                        </Tailwind>
                </Html>
        );
};
