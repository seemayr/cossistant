import type { Database } from "@api/db";
import {
        memberNotificationChannel,
        memberNotificationRule,
} from "@api/db/schema";
import { generateULID } from "@api/utils/db/ids";
import type {
        MemberNotificationChannelInsert,
        MemberNotificationChannelSelect,
        MemberNotificationRuleSelect,
} from "@api/db/schema/notification";
import type { MemberNotificationRuleUpdate } from "@cossistant/types";
import { and, asc, eq, inArray } from "drizzle-orm";

export const MEMBER_NOTIFICATION_DEFAULTS = [
        {
                notificationType: "marketing.email",
                isEnabled: true,
                settings: { category: "marketing" },
                channels: [
                        {
                                channelType: "email",
                                delaySeconds: 0,
                                orderIndex: 0,
                                isEnabled: true,
                                config: { category: "marketing" },
                                conditions: null,
                        },
                ],
        },
        {
                notificationType: "inbox.unread.email_followup",
                isEnabled: true,
                settings: { category: "inbox", behavior: "unread_email_followup" },
                channels: [
                        {
                                channelType: "email",
                                delaySeconds: 300,
                                orderIndex: 0,
                                isEnabled: true,
                                config: { template: "unread-reminder" },
                                conditions: { deliverOnlyIfUnread: true },
                        },
                ],
        },
        {
                notificationType: "inbox.new_message.browser",
                isEnabled: false,
                settings: { category: "inbox", behavior: "browser_push" },
                channels: [
                        {
                                channelType: "browser_push",
                                delaySeconds: 20,
                                orderIndex: 0,
                                isEnabled: false,
                                config: null,
                                conditions: { requiresSubscription: true },
                        },
                ],
        },
] as const satisfies readonly {
        notificationType: string;
        isEnabled: boolean;
        settings: Record<string, unknown> | null;
        channels: readonly (Omit<
                MemberNotificationChannelInsert,
                "id" | "ruleId" | "createdAt" | "updatedAt"
        > & {
                config: MemberNotificationChannelInsert["config"];
                conditions: MemberNotificationChannelInsert["conditions"];
        })[];
}[];

export type MemberNotificationRuleWithChannels = MemberNotificationRuleSelect & {
        channels: MemberNotificationChannelSelect[];
};

export async function ensureDefaultMemberNotificationRules(
        db: Database,
        params: { memberId: string }
): Promise<MemberNotificationRuleWithChannels[]> {
        return db.transaction(async (tx) => {
                const existingRules = await tx.query.memberNotificationRule.findMany({
                        where: eq(memberNotificationRule.memberId, params.memberId),
                        columns: {
                                id: true,
                                notificationType: true,
                        },
                });

                const ruleIdByType = new Map(
                        existingRules.map((rule) => [rule.notificationType, rule.id])
                );

                for (const definition of MEMBER_NOTIFICATION_DEFAULTS) {
                        const insertedRules = await tx
                                .insert(memberNotificationRule)
                                .values({
                                        id: generateULID(),
                                        memberId: params.memberId,
                                        notificationType: definition.notificationType,
                                        isEnabled: definition.isEnabled,
                                        settings: definition.settings,
                                })
                                .onConflictDoNothing({
                                        target: [
                                                memberNotificationRule.memberId,
                                                memberNotificationRule.notificationType,
                                        ],
                                })
                                .returning({ id: memberNotificationRule.id });

                        let ruleId = insertedRules.at(0)?.id;

                        if (!ruleId) {
                                ruleId = ruleIdByType.get(
                                        definition.notificationType
                                );
                        }

                        if (!ruleId) {
                                const existingRule = await tx
                                        .query.memberNotificationRule.findFirst({
                                                where: and(
                                                        eq(
                                                                memberNotificationRule.memberId,
                                                                params.memberId
                                                        ),
                                                        eq(
                                                                memberNotificationRule.notificationType,
                                                                definition.notificationType
                                                        )
                                                ),
                                                columns: { id: true },
                                        });

                                if (!existingRule) {
                                        throw new Error("RULE_LOOKUP_FAILED");
                                }

                                ruleId = existingRule.id;
                        }

                        ruleIdByType.set(definition.notificationType, ruleId);

                        for (const channel of definition.channels) {
                                const insertedChannels = await tx
                                        .insert(memberNotificationChannel)
                                        .values({
                                                id: generateULID(),
                                                ruleId,
                                                channelType: channel.channelType,
                                                config: channel.config ?? null,
                                                conditions: channel.conditions ?? null,
                                                delaySeconds: channel.delaySeconds,
                                                orderIndex: channel.orderIndex,
                                                isEnabled: channel.isEnabled,
                                        })
                                        .onConflictDoNothing({
                                                target: [
                                                        memberNotificationChannel.ruleId,
                                                        memberNotificationChannel.orderIndex,
                                                ],
                                        })
                                        .returning({
                                                id: memberNotificationChannel.id,
                                        });

                                if (insertedChannels.length === 0) {
                                        const existingChannel = await tx
                                                .query.memberNotificationChannel.findFirst({
                                                        where: and(
                                                                eq(
                                                                        memberNotificationChannel.ruleId,
                                                                        ruleId
                                                                ),
                                                                eq(
                                                                        memberNotificationChannel.orderIndex,
                                                                        channel.orderIndex
                                                                )
                                                        ),
                                                });

                                        if (!existingChannel) {
                                                throw new Error(
                                                        "CHANNEL_LOOKUP_FAILED"
                                                );
                                        }
                                }
                        }
                }

                return tx.query.memberNotificationRule.findMany({
                        where: eq(memberNotificationRule.memberId, params.memberId),
                        orderBy: (rules, { asc: ascOrder }) => [
                                ascOrder(rules.notificationType),
                        ],
                        with: {
                                channels: {
                                        orderBy: (channels, { asc: ascOrder }) => [
                                                ascOrder(channels.orderIndex),
                                                ascOrder(channels.createdAt),
                                        ],
                                },
                        },
                });
        });
}

export async function updateMemberNotificationRules(
        db: Database,
        params: { memberId: string; updates: MemberNotificationRuleUpdate[] }
): Promise<MemberNotificationRuleWithChannels[]> {
        if (params.updates.length === 0) {
                return ensureDefaultMemberNotificationRules(db, {
                        memberId: params.memberId,
                });
        }

        return db.transaction(async (tx) => {
                const ruleIds = params.updates.map((update) => update.ruleId);

                const ownedRules = await tx
                        .select({ id: memberNotificationRule.id })
                        .from(memberNotificationRule)
                        .where(
                                and(
                                        eq(memberNotificationRule.memberId, params.memberId),
                                        inArray(memberNotificationRule.id, ruleIds)
                                )
                        );

                if (ownedRules.length !== ruleIds.length) {
                        throw new Error("RULE_NOT_FOUND");
                }

                const channelUpdates = params.updates.flatMap(
                        (update) => update.channels ?? []
                );

                if (channelUpdates.length > 0) {
                        const channelIds = channelUpdates.map(
                                (channel) => channel.channelId
                        );

                        const ownedChannels = await tx
                                .select({
                                        id: memberNotificationChannel.id,
                                        ruleId: memberNotificationChannel.ruleId,
                                })
                                .from(memberNotificationChannel)
                                .where(inArray(memberNotificationChannel.id, channelIds));

                        const channelMap = new Map(
                                ownedChannels.map((channel) => [channel.id, channel.ruleId])
                        );

                        for (const update of params.updates) {
                                for (const channel of update.channels ?? []) {
                                        if (channelMap.get(channel.channelId) !== update.ruleId) {
                                                throw new Error("CHANNEL_NOT_FOUND");
                                        }
                                }
                        }
                }

                const timestamp = new Date().toISOString();

                for (const update of params.updates) {
                        const rulePatch: Partial<
                                typeof memberNotificationRule.$inferInsert
                        > = {};

                        if (typeof update.isEnabled === "boolean") {
                                rulePatch.isEnabled = update.isEnabled;
                        }

                        if (update.settings !== undefined) {
                                rulePatch.settings = update.settings;
                        }

                        if (Object.keys(rulePatch).length > 0) {
                                rulePatch.updatedAt = timestamp;

                                await tx
                                        .update(memberNotificationRule)
                                        .set(rulePatch)
                                        .where(
                                                and(
                                                        eq(
                                                                memberNotificationRule.id,
                                                                update.ruleId
                                                        ),
                                                        eq(
                                                                memberNotificationRule.memberId,
                                                                params.memberId
                                                        )
                                                )
                                        );
                        }

                        for (const channel of update.channels ?? []) {
                                const channelPatch: Partial<
                                        typeof memberNotificationChannel.$inferInsert
                                > = {};

                                if (typeof channel.isEnabled === "boolean") {
                                        channelPatch.isEnabled = channel.isEnabled;
                                }

                                if (channel.delaySeconds !== undefined) {
                                        channelPatch.delaySeconds = channel.delaySeconds;
                                }

                                if (channel.config !== undefined) {
                                        channelPatch.config = channel.config;
                                }

                                if (channel.conditions !== undefined) {
                                        channelPatch.conditions = channel.conditions;
                                }

                                if (channel.orderIndex !== undefined) {
                                        channelPatch.orderIndex = channel.orderIndex;
                                }

                                if (Object.keys(channelPatch).length > 0) {
                                        channelPatch.updatedAt = timestamp;

                                        await tx
                                                .update(memberNotificationChannel)
                                                .set(channelPatch)
                                                .where(
                                                        eq(
                                                                memberNotificationChannel.id,
                                                                channel.channelId
                                                        )
                                                );
                                }
                        }
                }

                return tx.query.memberNotificationRule.findMany({
                        where: eq(memberNotificationRule.memberId, params.memberId),
                        orderBy: (rules, { asc: ascOrder }) => [
                                ascOrder(rules.notificationType),
                        ],
                        with: {
                                channels: {
                                        orderBy: (channels, { asc: ascOrder }) => [
                                                ascOrder(channels.orderIndex),
                                                ascOrder(channels.createdAt),
                                        ],
                                },
                        },
                });
        });
}
