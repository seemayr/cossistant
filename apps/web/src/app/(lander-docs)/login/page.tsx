import { LoginForm } from "@/app/(lander-docs)/components/login-form";
import { FakeSupportWidget } from "@/components/landing/fake-support-widget";
import { Background } from "@/components/ui/background";
import { utilityNoindex } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = utilityNoindex({
	title: "Sign in",
	path: "/login",
});

export default function LoginPage() {
	return (
		<div className="flex h-screen w-full items-center justify-center border-primary/10 border-b border-dashed">
			<div className="flex items-center justify-center md:w-1/2">
				<LoginForm />
			</div>
			<div className="cossistant relative hidden h-full w-1/2 items-center justify-center border-primary/10 border-l border-dashed lg:flex">
				<Background />
				<FakeSupportWidget />
			</div>
		</div>
	);
}
