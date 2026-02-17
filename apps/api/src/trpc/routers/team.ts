import { getOrganizationBySlug } from "@api/db/queries/organization";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import { website } from "@api/db/schema";
import { user as authUser, invitation, member } from "@api/db/schema/auth";
import { auth } from "@api/lib/auth";
import {
	calculateWebsiteSeatUsage,
	hasPrivilegedRole,
	invitationAppliesToWebsite,
	listWebsiteAccessUsers,
	normalizeEmail,
	parseRoleList,
	withWebsiteInviteAdvisoryLock,
} from "@api/lib/team-seats";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init";

const teamRoleSchema = z.enum(["member", "admin"]);
const emailSchema = z.email();

const inviteStatusSchema = z.enum([
	"invited",
	"already-member",
	"already-invited",
	"invalid-email",
	"plan-limit",
	"failed",
]);

const teamSettingsSchema = z.object({
	viewerRole: z.string().nullable(),
	canManageTeam: z.boolean(),
	seats: z.object({
		limit: z.number().nullable(),
		used: z.number(),
		reserved: z.number(),
		remaining: z.number().nullable(),
	}),
	members: z.array(
		z.object({
			memberId: z.string().nullable(),
			userId: z.string(),
			name: z.string().nullable(),
			email: z.string(),
			image: z.string().nullable(),
			role: z.string().nullable(),
			lastSeenAt: z.string().nullable(),
			accessSource: z.enum([
				"team",
				"org-admin-owner",
				"team-and-org-admin-owner",
			]),
		})
	),
	invitations: z.array(
		z.object({
			id: z.string(),
			email: z.string(),
			role: z.string(),
			status: z.string(),
			expiresAt: z.string(),
			inviterName: z.string().nullable(),
			isExpired: z.boolean(),
		})
	),
});

const joinRouteStateSchema = z.object({
	organizationId: z.string(),
	organizationName: z.string(),
	organizationSlug: z.string(),
	organizationLogoUrl: z.string().nullable(),
	websiteName: z.string().nullable(),
	websiteLogoUrl: z.string().nullable(),
	invitationId: z.string(),
	invitationStatus: z.enum([
		"pending",
		"accepted",
		"rejected",
		"canceled",
		"expired",
		"not-found",
	]),
	isInvitationValid: z.boolean(),
	invitedEmail: z.string().nullable(),
	recommendedAuthAction: z.enum(["login", "sign-up"]).nullable(),
	isAuthenticated: z.boolean(),
	signedInEmail: z.string().nullable(),
	isSignedInEmailMatchingInvitation: z.boolean().nullable(),
	isAlreadyMember: z.boolean(),
});

function mapInviteError(error: unknown): {
	status: z.infer<typeof inviteStatusSchema>;
	message: string;
} {
	const message =
		error instanceof Error ? error.message : "Failed to create invitation";
	const lowerMessage = message.toLowerCase();

	if (
		lowerMessage.includes("already invited") ||
		lowerMessage.includes("already_invited")
	) {
		return {
			status: "already-invited",
			message,
		};
	}

	if (
		lowerMessage.includes("already a member") ||
		lowerMessage.includes("already_member")
	) {
		return {
			status: "already-member",
			message,
		};
	}

	if (lowerMessage.includes("limit")) {
		return {
			status: "plan-limit",
			message,
		};
	}

	return {
		status: "failed",
		message,
	};
}

export const teamRouter = createTRPCRouter({
	getJoinRouteState: publicProcedure
		.input(
			z.object({
				organizationSlug: z.string(),
				invitationId: z.string(),
			})
		)
		.output(joinRouteStateSchema.nullable())
		.query(async ({ ctx: { db, user, session }, input }) => {
			const organization = await getOrganizationBySlug(
				db,
				input.organizationSlug
			);

			if (!organization) {
				return null;
			}

			const currentUser = user ?? null;
			const currentSession = session ?? null;
			const isAuthenticated = Boolean(currentUser && currentSession);
			const signedInEmail =
				isAuthenticated && currentUser
					? normalizeEmail(currentUser.email)
					: null;

			const [invitationRecord] = await db
				.select({
					id: invitation.id,
					email: invitation.email,
					status: invitation.status,
					expiresAt: invitation.expiresAt,
					teamId: invitation.teamId,
				})
				.from(invitation)
				.where(
					and(
						eq(invitation.id, input.invitationId),
						eq(invitation.organizationId, organization.id)
					)
				)
				.limit(1);

			if (!invitationRecord) {
				return {
					organizationId: organization.id,
					organizationName: organization.name,
					organizationSlug: organization.slug,
					organizationLogoUrl: organization.logo ?? null,
					websiteName: null,
					websiteLogoUrl: null,
					invitationId: input.invitationId,
					invitationStatus: "not-found",
					isInvitationValid: false,
					invitedEmail: null,
					recommendedAuthAction: null,
					isAuthenticated,
					signedInEmail,
					isSignedInEmailMatchingInvitation: null,
					isAlreadyMember: false,
				};
			}

			const invitedEmail = normalizeEmail(invitationRecord.email);
			const invitationStatus =
				invitationRecord.status === "pending"
					? invitationRecord.expiresAt.getTime() <= Date.now()
						? "expired"
						: "pending"
					: invitationRecord.status === "accepted"
						? "accepted"
						: invitationRecord.status === "rejected"
							? "rejected"
							: "canceled";
			const isInvitationValid = invitationStatus === "pending";

			const invitationTeamIds = invitationRecord.teamId
				? invitationRecord.teamId
						.split(",")
						.map((value) => value.trim())
						.filter(Boolean)
				: [];

			const [targetWebsite] =
				invitationTeamIds.length > 0
					? await db
							.select({
								name: website.name,
								logoUrl: website.logoUrl,
							})
							.from(website)
							.where(
								and(
									eq(website.organizationId, organization.id),
									inArray(website.teamId, invitationTeamIds),
									isNull(website.deletedAt)
								)
							)
							.limit(1)
					: [];

			const isSignedInEmailMatchingInvitation = signedInEmail
				? signedInEmail === invitedEmail
				: null;
			const [matchingUser] =
				!isAuthenticated && isInvitationValid
					? await db
							.select({
								id: authUser.id,
							})
							.from(authUser)
							.where(eq(authUser.email, invitedEmail))
							.limit(1)
					: [];
			const [existingMembership] =
				isAuthenticated && currentUser
					? await db
							.select({
								id: member.id,
							})
							.from(member)
							.where(
								and(
									eq(member.organizationId, organization.id),
									eq(member.userId, currentUser.id)
								)
							)
							.limit(1)
					: [];

			return {
				organizationId: organization.id,
				organizationName: organization.name,
				organizationSlug: organization.slug,
				organizationLogoUrl: organization.logo ?? null,
				websiteName: targetWebsite?.name ?? null,
				websiteLogoUrl: targetWebsite?.logoUrl ?? null,
				invitationId: invitationRecord.id,
				invitationStatus,
				isInvitationValid,
				invitedEmail,
				recommendedAuthAction:
					!isAuthenticated && isInvitationValid
						? matchingUser
							? "login"
							: "sign-up"
						: null,
				isAuthenticated,
				signedInEmail,
				isSignedInEmailMatchingInvitation,
				isAlreadyMember: Boolean(existingMembership),
			};
		}),
	getSettings: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
			})
		)
		.output(teamSettingsSchema)
		.query(async ({ ctx: { db, user }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const [viewerMembership, accessUsers, seatUsage, invitationsRows] =
				await Promise.all([
					db
						.select({
							role: member.role,
						})
						.from(member)
						.where(
							and(
								eq(member.organizationId, websiteData.organizationId),
								eq(member.userId, user.id)
							)
						)
						.limit(1),
					listWebsiteAccessUsers(db, {
						organizationId: websiteData.organizationId,
						teamId: websiteData.teamId,
					}),
					calculateWebsiteSeatUsage(db, {
						website: websiteData,
					}),
					db
						.select({
							id: invitation.id,
							email: invitation.email,
							role: invitation.role,
							status: invitation.status,
							expiresAt: invitation.expiresAt,
							teamId: invitation.teamId,
							inviterName: authUser.name,
						})
						.from(invitation)
						.leftJoin(authUser, eq(invitation.inviterId, authUser.id))
						.where(eq(invitation.organizationId, websiteData.organizationId)),
				]);

			const viewerRole = viewerMembership[0]?.role ?? null;
			const canManageTeam = hasPrivilegedRole(viewerRole);

			const relevantInvitations = invitationsRows
				.filter((row) =>
					invitationAppliesToWebsite(row.role, row.teamId, websiteData.teamId)
				)
				.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())
				.map((row) => ({
					id: row.id,
					email: normalizeEmail(row.email),
					role: row.role ?? "member",
					status: row.status,
					expiresAt: row.expiresAt.toISOString(),
					inviterName: row.inviterName ?? null,
					isExpired:
						row.status === "pending" && row.expiresAt.getTime() <= Date.now(),
				}));

			return {
				viewerRole,
				canManageTeam,
				seats: seatUsage,
				members: accessUsers.map((accessUser) => ({
					memberId: accessUser.memberId,
					userId: accessUser.userId,
					name: accessUser.name,
					email: accessUser.email,
					image: accessUser.image,
					role: accessUser.role,
					lastSeenAt: accessUser.lastSeenAt?.toISOString() ?? null,
					accessSource: accessUser.accessSource,
				})),
				invitations: relevantInvitations,
			};
		}),
	inviteMany: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				emails: z.array(z.string()).min(1).max(50),
				role: teamRoleSchema,
			})
		)
		.output(
			z.object({
				results: z.array(
					z.object({
						email: z.string(),
						status: inviteStatusSchema,
						message: z.string().optional(),
					})
				),
				summary: z.object({
					requested: z.number(),
					invited: z.number(),
					failed: z.number(),
				}),
				seats: z.object({
					limit: z.number().nullable(),
					used: z.number(),
					reserved: z.number(),
					remaining: z.number().nullable(),
				}),
			})
		)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const [viewerMembership] = await db
				.select({
					role: member.role,
				})
				.from(member)
				.where(
					and(
						eq(member.organizationId, websiteData.organizationId),
						eq(member.userId, user.id)
					)
				)
				.limit(1);

			if (!hasPrivilegedRole(viewerMembership?.role)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only admins and owners can invite team members.",
				});
			}

			const normalizedEmails = [...new Set(input.emails.map(normalizeEmail))]
				.filter(Boolean)
				.slice(0, 50);

			const inviteLockResult = await withWebsiteInviteAdvisoryLock(db, {
				websiteId: websiteData.id,
				run: async () => {
					const [accessUsers, seatUsage, invitationRows] = await Promise.all([
						listWebsiteAccessUsers(db, {
							organizationId: websiteData.organizationId,
							teamId: websiteData.teamId,
						}),
						calculateWebsiteSeatUsage(db, {
							website: websiteData,
						}),
						db
							.select({
								email: invitation.email,
								role: invitation.role,
								status: invitation.status,
								expiresAt: invitation.expiresAt,
								teamId: invitation.teamId,
							})
							.from(invitation)
							.where(eq(invitation.organizationId, websiteData.organizationId)),
					]);

					const existingAccessEmails = new Set(
						accessUsers.map((accessUser) => normalizeEmail(accessUser.email))
					);

					const pendingRelevantInvitations = new Set(
						invitationRows
							.filter(
								(row) =>
									row.status === "pending" &&
									row.expiresAt.getTime() > Date.now() &&
									invitationAppliesToWebsite(
										row.role,
										row.teamId,
										websiteData.teamId
									)
							)
							.map((row) => normalizeEmail(row.email))
					);

					let remainingSeats = seatUsage.remaining;
					const results: Array<{
						email: string;
						status: z.infer<typeof inviteStatusSchema>;
						message?: string;
					}> = [];

					for (const email of normalizedEmails) {
						if (!emailSchema.safeParse(email).success) {
							results.push({
								email,
								status: "invalid-email",
								message: "Invalid email format.",
							});
							continue;
						}

						if (existingAccessEmails.has(email)) {
							results.push({
								email,
								status: "already-member",
								message: "This user already has access.",
							});
							continue;
						}

						if (pendingRelevantInvitations.has(email)) {
							results.push({
								email,
								status: "already-invited",
								message:
									"There is already a pending invitation for this email.",
							});
							continue;
						}

						if (remainingSeats !== null && remainingSeats <= 0) {
							results.push({
								email,
								status: "plan-limit",
								message:
									"Your team member limit has been reached. Upgrade your plan to invite more teammates.",
							});
							continue;
						}

						try {
							await auth.api.createInvitation({
								headers,
								body: {
									organizationId: websiteData.organizationId,
									email,
									role: input.role,
									teamId:
										input.role === "member" ? websiteData.teamId : undefined,
								},
							});

							results.push({
								email,
								status: "invited",
							});
							pendingRelevantInvitations.add(email);
							if (remainingSeats !== null) {
								remainingSeats -= 1;
							}
						} catch (error) {
							const mappedError = mapInviteError(error);
							results.push({
								email,
								status: mappedError.status,
								message: mappedError.message,
							});
						}
					}

					const invitedCount = results.filter(
						(result) => result.status === "invited"
					).length;
					const failedCount = results.length - invitedCount;
					const updatedSeatUsage = await calculateWebsiteSeatUsage(db, {
						website: websiteData,
					});

					return {
						results,
						summary: {
							requested: normalizedEmails.length,
							invited: invitedCount,
							failed: failedCount,
						},
						seats: updatedSeatUsage,
					};
				},
			});

			if (!inviteLockResult.acquired) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Another invite operation is in progress. Please retry.",
				});
			}

			return inviteLockResult.value;
		}),
	resendInvitation: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				invitationId: z.string(),
			})
		)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const [viewerMembership] = await db
				.select({
					role: member.role,
				})
				.from(member)
				.where(
					and(
						eq(member.organizationId, websiteData.organizationId),
						eq(member.userId, user.id)
					)
				)
				.limit(1);

			if (!hasPrivilegedRole(viewerMembership?.role)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only admins and owners can resend invitations.",
				});
			}

			const [existingInvitation] = await db
				.select({
					id: invitation.id,
					email: invitation.email,
					role: invitation.role,
					teamId: invitation.teamId,
					status: invitation.status,
					expiresAt: invitation.expiresAt,
				})
				.from(invitation)
				.where(
					and(
						eq(invitation.id, input.invitationId),
						eq(invitation.organizationId, websiteData.organizationId)
					)
				)
				.limit(1);

			if (
				!(
					existingInvitation &&
					invitationAppliesToWebsite(
						existingInvitation.role,
						existingInvitation.teamId,
						websiteData.teamId
					)
				)
			) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Invitation not found.",
				});
			}

			const parsedRole = parseRoleList(existingInvitation.role).find(
				(value): value is "owner" | "admin" | "member" =>
					value === "owner" || value === "admin" || value === "member"
			);
			const role =
				parsedRole ?? (existingInvitation.teamId ? "member" : "admin");
			const teamIdPayload = existingInvitation.teamId?.includes(",")
				? existingInvitation.teamId
						.split(",")
						.map((teamId) => teamId.trim())
						.filter(Boolean)
				: (existingInvitation.teamId ?? undefined);

			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: websiteData.organizationId,
					email: normalizeEmail(existingInvitation.email),
					role,
					teamId: teamIdPayload,
					resend: true,
				},
			});

			return { success: true };
		}),
	cancelInvitation: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				invitationId: z.string(),
			})
		)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const [viewerMembership] = await db
				.select({
					role: member.role,
				})
				.from(member)
				.where(
					and(
						eq(member.organizationId, websiteData.organizationId),
						eq(member.userId, user.id)
					)
				)
				.limit(1);

			if (!hasPrivilegedRole(viewerMembership?.role)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only admins and owners can cancel invitations.",
				});
			}

			const [existingInvitation] = await db
				.select({
					id: invitation.id,
					role: invitation.role,
					teamId: invitation.teamId,
				})
				.from(invitation)
				.where(
					and(
						eq(invitation.id, input.invitationId),
						eq(invitation.organizationId, websiteData.organizationId)
					)
				)
				.limit(1);

			if (
				!(
					existingInvitation &&
					invitationAppliesToWebsite(
						existingInvitation.role,
						existingInvitation.teamId,
						websiteData.teamId
					)
				)
			) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Invitation not found.",
				});
			}

			await auth.api.cancelInvitation({
				headers,
				body: {
					invitationId: input.invitationId,
				},
			});

			return { success: true };
		}),
	updateMemberRole: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				memberId: z.string(),
				role: teamRoleSchema,
			})
		)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const [viewerMembership, accessUsers] = await Promise.all([
				db
					.select({
						role: member.role,
					})
					.from(member)
					.where(
						and(
							eq(member.organizationId, websiteData.organizationId),
							eq(member.userId, user.id)
						)
					)
					.limit(1),
				listWebsiteAccessUsers(db, {
					organizationId: websiteData.organizationId,
					teamId: websiteData.teamId,
				}),
			]);

			if (!hasPrivilegedRole(viewerMembership[0]?.role)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only admins and owners can update member roles.",
				});
			}

			const targetMember = accessUsers.find(
				(accessUser) => accessUser.memberId === input.memberId
			);

			if (!targetMember) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Member not found for this website.",
				});
			}

			await auth.api.updateMemberRole({
				headers,
				body: {
					organizationId: websiteData.organizationId,
					memberId: input.memberId,
					role: input.role,
				},
			});

			return {
				success: true,
			};
		}),
	removeMemberAccess: protectedProcedure
		.input(
			z.object({
				websiteSlug: z.string(),
				memberId: z.string(),
			})
		)
		.mutation(async ({ ctx: { db, user, headers }, input }) => {
			const websiteData = await getWebsiteBySlugWithAccess(db, {
				userId: user.id,
				websiteSlug: input.websiteSlug,
			});

			if (!websiteData?.teamId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Website not found or access denied",
				});
			}

			const [viewerMembership, accessUsers] = await Promise.all([
				db
					.select({
						role: member.role,
					})
					.from(member)
					.where(
						and(
							eq(member.organizationId, websiteData.organizationId),
							eq(member.userId, user.id)
						)
					)
					.limit(1),
				listWebsiteAccessUsers(db, {
					organizationId: websiteData.organizationId,
					teamId: websiteData.teamId,
				}),
			]);

			if (!hasPrivilegedRole(viewerMembership[0]?.role)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only admins and owners can remove members.",
				});
			}

			const targetMember = accessUsers.find(
				(accessUser) => accessUser.memberId === input.memberId
			);

			if (!targetMember) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Member not found for this website.",
				});
			}

			if (targetMember.userId === user.id) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "You can't remove yourself from the organization here.",
				});
			}

			if (targetMember.accessSource === "team") {
				await auth.api.removeTeamMember({
					headers,
					body: {
						teamId: websiteData.teamId,
						userId: targetMember.userId,
					},
				});
			} else {
				await auth.api.removeMember({
					headers,
					body: {
						organizationId: websiteData.organizationId,
						memberIdOrEmail: input.memberId,
					},
				});
			}

			return {
				success: true,
			};
		}),
});
