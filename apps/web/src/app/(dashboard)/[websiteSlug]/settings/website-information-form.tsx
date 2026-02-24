"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import Icon from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { SettingsRowFooter } from "@/components/ui/layout/settings-layout";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import { useTRPC } from "@/lib/trpc/client";
import { buildUniqueUploadIdentity } from "@/lib/uploads/avatar-upload-key";
import { isValidDomain } from "@/lib/utils";

const PROTOCOL_REGEX = /^https?:\/\//i;
const PATH_REGEX = /\/.*$/;
const LOGO_ACCEPT =
	"image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml";

const logoValueSchema = z
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

const websiteInformationFormSchema = z.object({
	name: z
		.string({ message: "Enter your website name." })
		.trim()
		.min(1, { message: "Enter your website name." })
		.max(120, {
			message: "Name must be 120 characters or fewer.",
		}),
	contactEmail: z
		.string()
		.trim()
		.refine((val) => val === "" || val.length <= 320, {
			message: "Email address must be 320 characters or fewer.",
		})
		.refine((val) => val === "" || z.string().email().safeParse(val).success, {
			message: "Enter a valid email address.",
		}),
	domain: z
		.string({ message: "Enter your domain." })
		.trim()
		.min(1, { message: "Enter your domain." })
		.refine((value) => isValidDomain(value), {
			message: "Enter a valid domain.",
		}),
	logo: logoValueSchema,
});

export type WebsiteInformationFormValues = z.infer<
	typeof websiteInformationFormSchema
>;

type WebsiteInformationFormProps = {
	initialName: string;
	initialDomain: string;
	initialContactEmail?: string | null;
	initialLogoUrl?: string | null;
	organizationId: string;
	websiteId: string;
	websiteSlug: string;
};

export function WebsiteInformationForm({
	initialName,
	initialDomain,
	initialContactEmail,
	initialLogoUrl,
	organizationId,
	websiteId,
	websiteSlug,
}: WebsiteInformationFormProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [isUploadingLogo, setIsUploadingLogo] = useState(false);
	const logoProgressToastAtRef = useRef(0);

	const form = useForm<WebsiteInformationFormValues>({
		resolver: standardSchemaResolver(websiteInformationFormSchema),
		mode: "onChange",
		defaultValues: {
			name: initialName,
			domain: initialDomain,
			contactEmail: initialContactEmail ?? "",
			logo: initialLogoUrl ?? null,
		},
	});

	const domainValue = form.watch("domain");

	const [domainBaseline, setDomainBaseline] = useState(() =>
		initialDomain.trim().toLowerCase()
	);

	useEffect(() => {
		setDomainBaseline(initialDomain.trim().toLowerCase());
	}, [initialDomain]);

	const normalizedDomainValue = useMemo(
		() =>
			domainValue
				? domainValue
						.trim()
						.replace(PROTOCOL_REGEX, "")
						.replace(PATH_REGEX, "")
						.toLowerCase()
				: "",
		[domainValue]
	);

	const hasDomainChanged =
		normalizedDomainValue.length > 0 &&
		normalizedDomainValue !== domainBaseline;

	const shouldCheckDomain =
		hasDomainChanged &&
		form.formState.isDirty &&
		isValidDomain(normalizedDomainValue) &&
		!form.formState.isSubmitting;

	const { data: isDomainTaken, isFetching: isCheckingDomain } = useQuery({
		...trpc.website.checkDomain.queryOptions({
			domain: normalizedDomainValue,
		}),
		enabled: shouldCheckDomain,
	});

	const logoUploadToastId = `website-logo-upload-${websiteId}`;

	const { mutateAsync: updateWebsite, isPending: isUpdatingWebsite } =
		useMutation(
			trpc.website.update.mutationOptions({
				onSuccess: async (updatedWebsite) => {
					await Promise.all([
						queryClient.invalidateQueries({
							queryKey: trpc.website.getBySlug.queryKey({
								slug: websiteSlug,
							}),
						}),
						queryClient.invalidateQueries({
							queryKey: trpc.website.developerSettings.queryKey({
								slug: websiteSlug,
							}),
						}),
						queryClient.invalidateQueries({
							queryKey: trpc.website.listByOrganization.queryKey({
								organizationId,
							}),
						}),
						queryClient.invalidateQueries({
							queryKey: trpc.user.me.queryKey(),
						}),
					]);

					form.reset({
						name: updatedWebsite.name,
						domain: updatedWebsite.domain,
						contactEmail: updatedWebsite.contactEmail ?? "",
						logo: updatedWebsite.logoUrl ?? null,
					});

					setDomainBaseline(updatedWebsite.domain.trim().toLowerCase());

					toast.success("Website information updated.");
					authClient.$store.notify("$sessionSignal");
				},
				onError: (error) => {
					toast.error(
						error instanceof Error
							? error.message
							: "Failed to update website information. Please try again."
					);
				},
			})
		);

	const { mutateAsync: createSignedUrl } = useMutation(
		trpc.upload.createSignedUrl.mutationOptions()
	);

	const handleLogoUpload = useCallback(
		async (file: File): Promise<Partial<AvatarInputValue>> => {
			try {
				toast.loading("Uploading logo…", { id: logoUploadToastId });
				logoProgressToastAtRef.current = Date.now();
				const uploadIdentity = buildUniqueUploadIdentity(file);

				const uploadDetails = await createSignedUrl({
					contentType: file.type,
					fileName: uploadIdentity.fileName,
					fileExtension: uploadIdentity.fileExtension,
					websiteId,
					scope: {
						type: "user",
						userId: organizationId,
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
						if (progress >= 1 || now - logoProgressToastAtRef.current >= 150) {
							logoProgressToastAtRef.current = now;
							const percentage = Math.round(progress * 100);
							toast.loading(`Uploading logo… ${percentage}%`, {
								id: logoUploadToastId,
							});
						}
					},
				});

				const publicUrl = uploadDetails.publicUrl;

				toast.success("Logo uploaded. Click Save to apply.", {
					id: logoUploadToastId,
				});

				return {
					url: publicUrl,
					mimeType: file.type,
					name: file.name,
				};
			} catch (error) {
				const uploadError =
					error instanceof Error
						? error
						: new Error("Failed to upload logo. Please try again.");

				toast.error(uploadError.message, { id: logoUploadToastId });
				(uploadError as Error & { handledByToast?: boolean }).handledByToast =
					true;
				throw uploadError;
			}
		},
		[createSignedUrl, organizationId, websiteId]
	);

	const onSubmit = useCallback(
		async (values: WebsiteInformationFormValues) => {
			if (hasDomainChanged && isDomainTaken) {
				toast.error(
					"This domain is already in use. Please choose another one."
				);
				return;
			}

			const normalizedDomain = values.domain
				.trim()
				.replace(PROTOCOL_REGEX, "")
				.replace(PATH_REGEX, "")
				.toLowerCase();

			const contactEmailValue = values.contactEmail?.trim?.() ?? "";
			const contactEmail = contactEmailValue
				? contactEmailValue.toLowerCase()
				: null;

			const logoValue = values.logo;
			let logoUrl: string | null = null;

			if (typeof logoValue === "string") {
				logoUrl = logoValue;
			} else if (logoValue && typeof logoValue === "object") {
				if (!logoValue.url) {
					toast.error(
						"Please wait for the logo upload to finish before saving."
					);
					return;
				}
				logoUrl = logoValue.url;
			}

			await updateWebsite({
				organizationId,
				websiteId,
				data: {
					name: values.name.trim(),
					domain: normalizedDomain,
					contactEmail,
					logoUrl,
				},
			});
		},
		[hasDomainChanged, isDomainTaken, organizationId, updateWebsite, websiteId]
	);

	const isSubmitting =
		isUpdatingWebsite || isUploadingLogo || form.formState.isSubmitting;

	return (
		<Form {...form}>
			<form className="flex flex-col" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="space-y-6 px-4 py-6">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Website name</FormLabel>
								<FormControl>
									<Input
										autoComplete="organization"
										disabled={isSubmitting}
										placeholder="Acme Inc"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="contactEmail"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Contact email (optional)</FormLabel>
								<FormControl>
									<Input
										autoComplete="email"
										disabled={isSubmitting}
										placeholder="support@acme.com"
										type="email"
										{...field}
									/>
								</FormControl>
								<FormDescription>
									Provide an email if visitors should be able to reach a human
									directly.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="domain"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Domain</FormLabel>
								<FormControl>
									<div className="relative">
										<Input
											placeholder="example.com"
											{...field}
											append={
												field.value &&
												hasDomainChanged &&
												isValidDomain(normalizedDomainValue) && (
													<div className="flex items-center gap-2">
														{isCheckingDomain && <Spinner />}
														{!isCheckingDomain && isDomainTaken && (
															<Icon name="x" />
														)}
														{!(isCheckingDomain || isDomainTaken) && (
															<Icon name="check" />
														)}
													</div>
												)
											}
											disabled={isSubmitting}
											onBlur={(event) => {
												const value = event.target.value;
												const domainWithoutProtocol = value
													.trim()
													.replace(PROTOCOL_REGEX, "");
												const sanitized = domainWithoutProtocol.replace(
													PATH_REGEX,
													""
												);
												field.onChange(sanitized);
												form.trigger("domain");
											}}
										/>
									</div>
								</FormControl>
								<FormDescription>
									{hasDomainChanged && isDomainTaken ? (
										<span className="text-destructive">
											This domain is already in use. Please choose another.
										</span>
									) : (
										"The domain visitors will use to chat with your team."
									)}
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="logo"
						render={({ field }) => (
							<FormItem className="flex flex-col gap-2">
								<FormLabel>Website logo</FormLabel>
								<FormControl>
									<AvatarInput
										accept={LOGO_ACCEPT}
										allowSvgUploads
										disabled={isSubmitting}
										name={field.name}
										onBlur={field.onBlur}
										onChange={field.onChange}
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
											setIsUploadingLogo(false);
										}}
										onUpload={handleLogoUpload}
										onUploadComplete={() => setIsUploadingLogo(false)}
										onUploadStart={() => setIsUploadingLogo(true)}
										placeholder="Upload a square image at least 256×256px. SVG uploads are allowed."
										ref={field.ref}
										uploadLabel="Upload logo"
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
						disabled={
							!(form.formState.isDirty && form.formState.isValid) ||
							isSubmitting ||
							(hasDomainChanged &&
								(!isValidDomain(normalizedDomainValue) || isDomainTaken))
						}
						isSubmitting={isSubmitting}
						size="sm"
						type="submit"
					>
						Save website information
					</BaseSubmitButton>
				</SettingsRowFooter>
			</form>
		</Form>
	);
}
