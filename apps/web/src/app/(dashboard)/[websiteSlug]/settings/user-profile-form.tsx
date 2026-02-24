"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	AvatarInput,
	type AvatarInputValue,
	uploadToPresignedUrl,
} from "@/components/ui/avatar-input";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { authClient } from "@/lib/auth/client";
import { useTRPC } from "@/lib/trpc/client";
import { buildUniqueUploadIdentity } from "@/lib/uploads/avatar-upload-key";

const avatarValueSchema = z
	.union([
		z.string().min(1),
		z
			.object({
				previewUrl: z.string().min(1),
				url: z.string().optional(),
				mimeType: z.string(),
				name: z.string().optional(),
				size: z.number().optional(),
				file: z.instanceof(File).optional(),
			})
			.passthrough(),
	])
	.nullable();

const userProfileFormSchema = z.object({
	name: z
		.string({ message: "Enter your name." })
		.trim()
		.min(1, { message: "Enter your name." })
		.max(120, { message: "Name must be 120 characters or fewer." }),
	avatar: avatarValueSchema,
});

type UserProfileFormValues = z.infer<typeof userProfileFormSchema>;

type UserProfileFormProps = {
	initialName: string;
	initialAvatarUrl?: string | null;
	organizationId: string;
	userId: string;
	websiteId: string;
};

export function UserProfileForm({
	initialName,
	initialAvatarUrl,
	organizationId,
	userId,
	websiteId,
}: UserProfileFormProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
	const avatarProgressToastAtRef = useRef(0);

	const form = useForm<UserProfileFormValues>({
		resolver: standardSchemaResolver(userProfileFormSchema),
		mode: "onChange",
		defaultValues: {
			name: initialName,
			avatar: initialAvatarUrl
				? {
						previewUrl: initialAvatarUrl,
						url: initialAvatarUrl,
						mimeType: "image/jpeg", // Default mime type for existing avatars
					}
				: null,
		},
	});

	const avatarUploadToastId = useMemo(
		() => `profile-avatar-upload-${userId}`,
		[userId]
	);

	const { mutateAsync: updateProfile, isPending } = useMutation(
		trpc.user.updateProfile.mutationOptions({
			onSuccess: async (updatedUser) => {
				// Invalidate all queries that display user data
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.user.me.queryKey(),
					}),
					queryClient.invalidateQueries({
						predicate: (query) =>
							query.queryKey[0] === "user.getWebsiteMembers",
					}),
				]);

				// Force Better Auth to refetch session from server
				// This bypasses cookie cache, fetches from DB, and refreshes the cookie
				await authClient.getSession({
					query: {
						disableCookieCache: true,
					},
				});

				// Reset form with updated data
				form.reset({
					name: updatedUser.name ?? "",
					avatar: updatedUser.image
						? {
								previewUrl: updatedUser.image,
								url: updatedUser.image,
								mimeType: "image/jpeg",
							}
						: null,
				});

				toast.success("Profile updated.");
			},
			onError: () => {
				toast.error("Failed to update your profile. Please try again.");
			},
		})
	);

	const { mutateAsync: createSignedUrl } = useMutation(
		trpc.upload.createSignedUrl.mutationOptions()
	);

	const handleAvatarUpload = useCallback(
		async (file: File): Promise<Partial<AvatarInputValue>> => {
			try {
				toast.loading("Uploading profile picture…", {
					id: avatarUploadToastId,
				});
				avatarProgressToastAtRef.current = Date.now();
				const uploadIdentity = buildUniqueUploadIdentity(file);

				const uploadDetails = await createSignedUrl({
					contentType: file.type,
					fileName: uploadIdentity.fileName,
					fileExtension: uploadIdentity.fileExtension,
					websiteId,
					path: `users/${userId}/avatars`,
					scope: {
						type: "user",
						userId,
						organizationId,
						websiteId,
					},
					useCdn: true,
				});

				await uploadToPresignedUrl({
					file,
					url: uploadDetails.uploadUrl,
					headers: { "Content-Type": file.type },
					onProgress: (progress) => {
						const now = Date.now();
						if (
							progress >= 1 ||
							now - avatarProgressToastAtRef.current >= 150
						) {
							avatarProgressToastAtRef.current = now;
							const percentage = Math.round(progress * 100);
							toast.loading(`Uploading profile picture… ${percentage}%`, {
								id: avatarUploadToastId,
							});
						}
					},
				});

				const publicUrl = uploadDetails.publicUrl;

				toast.success("Profile picture uploaded. Click Save to apply.", {
					id: avatarUploadToastId,
				});

				return {
					url: publicUrl,
					mimeType: file.type,
					name: file.name,
					size: file.size,
				};
			} catch (error) {
				const uploadError =
					error instanceof Error
						? error
						: new Error("Failed to upload avatar. Please try again.");

				toast.error(uploadError.message, {
					id: avatarUploadToastId,
				});
				(uploadError as Error & { handledByToast?: boolean }).handledByToast =
					true;
				throw uploadError;
			}
		},
		[createSignedUrl, organizationId, userId, websiteId]
	);

	const onSubmit = useCallback(
		async (values: UserProfileFormValues) => {
			const name = values.name.trim();
			const avatarValue = values.avatar;

			let imageUrl: string | null = null;

			// Explicitly handle null (avatar removed)
			if (avatarValue === null) {
				imageUrl = null;
			} else if (typeof avatarValue === "string") {
				// Strip any existing query parameters (like cache-busting)
				try {
					const url = new URL(avatarValue);
					url.search = ""; // Remove all query parameters
					imageUrl = url.toString();
				} catch {
					imageUrl = avatarValue;
				}
			} else if (avatarValue && typeof avatarValue === "object") {
				if (!avatarValue.url) {
					toast.error(
						"Please wait for the avatar upload to finish before saving."
					);
					return;
				}

				// Strip any existing query parameters before saving
				try {
					const url = new URL(avatarValue.url);
					url.search = ""; // Remove all query parameters
					imageUrl = url.toString();
				} catch {
					imageUrl = avatarValue.url;
				}
			}

			await updateProfile({
				userId,
				name,
				image: imageUrl,
			});
		},
		[updateProfile, userId]
	);

	const nameValue = form.watch("name");
	const avatarValue = form.watch("avatar");

	const fallbackInitials = useMemo(() => {
		const trimmed = nameValue?.trim();
		if (!trimmed) {
			return;
		}

		const [first] = trimmed;
		return first ? first.toUpperCase() : undefined;
	}, [nameValue]);

	// Check if avatar has actually changed by comparing URLs
	const hasAvatarChanged = useMemo(() => {
		const currentAvatarUrl =
			avatarValue === null
				? null
				: typeof avatarValue === "string"
					? avatarValue
					: avatarValue?.url || avatarValue?.previewUrl;

		const initialUrl = initialAvatarUrl || null;

		// Normalize URLs by removing query params for comparison
		const normalizeUrl = (url: string | null) => {
			if (!url) {
				return null;
			}
			try {
				const urlObj = new URL(url);
				urlObj.search = "";
				return urlObj.toString();
			} catch {
				return url;
			}
		};

		return normalizeUrl(currentAvatarUrl) !== normalizeUrl(initialUrl);
	}, [avatarValue, initialAvatarUrl]);

	const isSubmitting = isPending || isUploadingAvatar;
	const hasChanges = form.formState.isDirty || hasAvatarChanged;

	return (
		<Form {...form}>
			<form className="flex flex-col" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="space-y-6 px-4 py-6">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input
										autoComplete="name"
										placeholder="Ada Lovelace"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="avatar"
						render={({ field }) => (
							<FormItem className="flex flex-col gap-2">
								<FormLabel>Profile picture</FormLabel>
								<FormControl>
									<AvatarInput
										fallbackInitials={fallbackInitials}
										name={field.name}
										onBlur={field.onBlur}
										onChange={(value) => {
											field.onChange(value);
											void form.trigger("avatar");
										}}
										onError={(error) => {
											if (
												!(
													error as Error & {
														handledByToast?: boolean;
													}
												)?.handledByToast
											) {
												toast.error(error.message);
											}
											setIsUploadingAvatar(false);
										}}
										onUpload={handleAvatarUpload}
										onUploadComplete={() => setIsUploadingAvatar(false)}
										onUploadStart={() => setIsUploadingAvatar(true)}
										placeholder="Upload a square image at least 256×256px. SVG uploads are disabled by default for security."
										ref={field.ref}
										value={field.value}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
				<SettingsRowFooter className="flex items-center justify-end gap-2">
					<BaseSubmitButton
						disabled={!(hasChanges && form.formState.isValid) || isSubmitting}
						isSubmitting={isSubmitting}
						size="sm"
						type="submit"
					>
						Save profile
					</BaseSubmitButton>
				</SettingsRowFooter>
			</form>
		</Form>
	);
}
