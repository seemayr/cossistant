import { generateSiteMetadata } from "@/lib/metadata";
import { SignupForm } from "../components/signup-form";

export const dynamic = "force-dynamic";

export const metadata = generateSiteMetadata({
	title: "Create your Cossistant account",
});

export default function Page() {
	return (
		<main className="flex min-h-[80vh] flex-col gap-6 px-6 pt-48">
			<SignupForm />
		</main>
	);
}
