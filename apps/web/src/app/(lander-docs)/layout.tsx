import { DashboardButton } from "@/app/(lander-docs)/components/topbar/dashboard-button";
import { LandingSupportTrigger } from "@/components/support/landing-support-trigger";
import { Footer } from "./components/footer";
import { GitHubLink } from "./components/github-link";
import { TopBar } from "./components/topbar";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative flex min-h-svh flex-col overflow-clip border-grid-x">
			<TopBar>
				<DashboardButton />
			</TopBar>
			<main className="flex flex-1 flex-col">
				<div className="container-wrapper mx-auto">{children}</div>
			</main>
			<Footer />
			<LandingSupportTrigger />
		</div>
	);
}
