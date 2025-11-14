"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { signIn, signUp } from "@/lib/auth/client";
import { GithubIcon, GoogleIcon } from "./login-form";

export function SignupForm() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const baseURL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

	const handleEmailSignup = async (event: React.FormEvent) => {
		event.preventDefault();
		setError(null);

		if (!(email.trim() && password.trim() && name.trim())) {
			setError("Please fill in your name, email, and password.");
			return;
		}

		setIsLoading(true);
		try {
			const result = await signUp.email(
				{
					email: email.trim(),
					password,
					name: name.trim(),
					callbackURL: `${baseURL}/welcome`,
				},
				{
					onSuccess: () => {
						router.push("/welcome");
					},
					onError: (ctx) => {
						setError(ctx.error.message || "We couldn't create your account.");
					},
				}
			);

			if (result.error) {
				setError(result.error.message || "We couldn't create your account.");
			}
		} catch (signupError) {
			console.error("Email signup error:", signupError);
			setError(
				"Something went wrong while creating your account. Please try again."
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handleSocialSignup = (provider: "google" | "github") => {
		setError(null);
		return signIn.social(
			{
				provider,
				callbackURL: `${baseURL}/welcome`,
				errorCallbackURL: `${baseURL}/signup?error=${provider}`,
			},
			{
				onSuccess: () => {
					router.push("/welcome");
				},
				onError: () => {
					setError(
						"We couldn't sign you up with that provider. Please try again."
					);
				},
			}
		);
	};

	return (
		<div className="flex flex-col items-center justify-center gap-6">
			<div className="w-full max-w-md space-y-4">
				<div className="flex flex-col gap-2 text-center">
					<h1 className="font-f37-stout text-5xl">Create your account</h1>
					<p className="text-md text-primary/60">
						Start serving customers in minutes with AI-assisted support.
					</p>
				</div>

				<form className="mt-10 space-y-3" onSubmit={handleEmailSignup}>
					<Input
						disabled={isLoading}
						onChange={(event) => setName(event.target.value)}
						placeholder="Full name"
						required
						type="text"
						value={name}
						variant="lg"
					/>
					<Input
						autoComplete="email"
						disabled={isLoading}
						onChange={(event) => setEmail(event.target.value)}
						placeholder="Work email"
						required
						type="email"
						value={email}
						variant="lg"
					/>
					<Input
						autoComplete="new-password"
						disabled={isLoading}
						onChange={(event) => setPassword(event.target.value)}
						placeholder="Create a password"
						required
						type="password"
						value={password}
						variant="lg"
					/>
					{error ? <p className="text-destructive text-sm">{error}</p> : null}
					<BaseSubmitButton
						className="w-full"
						disabled={
							isLoading || !email.trim() || !password.trim() || !name.trim()
						}
						isSubmitting={isLoading}
						size="lg"
					>
						Get started
					</BaseSubmitButton>
					<p className="text-primary/60 text-sm">
						Already have an account?{" "}
						<Link
							className="text-primary underline hover:text-primary/80"
							href="/login"
						>
							Log in
						</Link>
					</p>
				</form>
			</div>

			<div className="flex w-full max-w-md items-center gap-4">
				<Separator className="flex-1" />
				<span className="text-primary/50 text-xs">OR CONTINUE WITH</span>
				<Separator className="flex-1" />
			</div>

			<div className="flex w-full max-w-md flex-col gap-3">
				<Button
					className="w-full"
					onClick={() => handleSocialSignup("google")}
					size="lg"
					variant="outline"
				>
					<GoogleIcon className="size-4" />
					Continue with Google
				</Button>
				<Button
					className="w-full"
					onClick={() => handleSocialSignup("github")}
					size="lg"
					variant="outline"
				>
					<GithubIcon className="size-4" />
					Continue with GitHub
				</Button>
			</div>
		</div>
	);
}
