import { LoginForm } from "@/app/(lander-docs)/components/login-form";
import { FakeSupportWidget } from "@/components/landing/fake-support-widget";
import { BackgroundImage } from "@/components/ui/background-image";
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
				<BackgroundImage
					alt="Cossistant Background"
					largeSrc="https://cdn.cossistant.com/landing/secondary-large.jpg"
					mediumSrc="https://cdn.cossistant.com/landing/secondary-medium.jpg"
					portraitOnMobile
					smallSrc="https://cdn.cossistant.com/landing/secondary-small.jpg"
				/>
				<FakeSupportWidget />
			</div>{" "}
		</div>
	);
}
