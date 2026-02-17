"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/lib/auth/client";
import {
	buildInviteAwarePath,
	readInviteAuthState,
} from "@/lib/auth/invite-state";

export default function ResetPasswordPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const inviteState = readInviteAuthState(searchParams, "/select");
	const inviteEmail = inviteState.inviteEmail;
	const inviteTarget = inviteState.inviteTarget;
	const isInviteFlow = inviteState.isInviteFlow;
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const loginHref = isInviteFlow
		? buildInviteAwarePath("/login", {
				callbackPath: inviteState.callbackPath,
				inviteEmail,
				inviteTarget,
			})
		: "/login";
	const loginSuccessHref = isInviteFlow
		? buildInviteAwarePath("/login", {
				callbackPath: inviteState.callbackPath,
				inviteEmail,
				inviteTarget,
				extraSearchParams: { reset: "success" },
			})
		: "/login?reset=success";
	const forgotPasswordHref = isInviteFlow
		? buildInviteAwarePath("/forgot-password", {
				callbackPath: inviteState.callbackPath,
				inviteEmail,
				inviteTarget,
			})
		: "/forgot-password";

	const token = searchParams.get("token");

	const validatePasswords = () => {
		if (!token) {
			return "Invalid reset link. Please request a new one.";
		}

		if (!(password.trim() && confirmPassword.trim())) {
			return "Please fill in all fields";
		}

		if (password !== confirmPassword) {
			return "Passwords do not match";
		}

		if (password.length < 8) {
			return "Password must be at least 8 characters long";
		}

		return null;
	};

	const handleResetPasswordError = (result: {
		error?: { message?: string };
	}) => {
		if (result.error?.message?.includes("expired")) {
			return "This reset link has expired. Please request a new one.";
		}
		return "Failed to reset password. Please try again.";
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		const validationError = validatePasswords();
		if (validationError) {
			setError(validationError);
			return;
		}

		setIsLoading(true);
		try {
			const result = await resetPassword({
				newPassword: password,
				token: token as string,
			});

			if (result.error) {
				setError(handleResetPasswordError(result));
			} else {
				router.push(loginSuccessHref);
			}
		} catch (_error) {
			console.error("Reset password error:", _error);
			setError("An error occurred. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	if (!token) {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<div className="w-full max-w-md space-y-4 text-center">
					<div className="space-y-2">
						<h1 className="font-f37-stout text-5xl">Invalid Reset Link</h1>
						<p className="text-primary/60">
							This password reset link is invalid or has expired.
						</p>
					</div>
					<Link
						className="inline-block rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
						href={forgotPasswordHref}
					>
						Request New Link
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<div className="w-full max-w-md space-y-6">
				<div className="space-y-2 text-center">
					<h1 className="font-f37-stout text-5xl">Set new password</h1>
					<p className="text-primary/60">
						Your new password must be at least 8 characters long
					</p>
					{isInviteFlow && inviteTarget ? (
						<p className="text-primary/60 text-sm">
							After reset, you&apos;ll continue joining {inviteTarget}.
						</p>
					) : null}
				</div>

				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-3">
						<Input
							autoComplete="new-password"
							disabled={isLoading}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="New password"
							required
							type="password"
							value={password}
							variant="lg"
						/>
						<Input
							autoComplete="new-password"
							disabled={isLoading}
							onChange={(e) => setConfirmPassword(e.target.value)}
							placeholder="Confirm new password"
							required
							type="password"
							value={confirmPassword}
							variant="lg"
						/>
						{error && <p className="text-destructive text-sm">{error}</p>}
					</div>

					<BaseSubmitButton
						className="w-full"
						disabled={isLoading || !password.trim() || !confirmPassword.trim()}
						isSubmitting={isLoading}
						size="lg"
						type="submit"
					>
						Reset Password
					</BaseSubmitButton>
				</form>

				<div className="text-center">
					<Link className="text-primary/60 text-sm underline" href={loginHref}>
						Back to login
					</Link>
				</div>
			</div>
		</div>
	);
}
