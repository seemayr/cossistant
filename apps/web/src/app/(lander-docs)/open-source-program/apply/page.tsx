import Link from "next/link";
import { Button } from "@/components/ui/button";
import { utilityNoindex } from "@/lib/metadata";
import { OpenSourceProgramApplicationCard } from "../application-card";

const PAGE_TITLE = "Apply to the Open Source Program";
const PAGE_DESCRIPTION =
	"Submit your open source project for the Cossistant OSS program.";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata = utilityNoindex({
	title: PAGE_TITLE,
	description: PAGE_DESCRIPTION,
	path: "/open-source-program/apply",
});

export default function OpenSourceProgramApplyPage() {
	return (
		<div className="px-4 pt-28 pb-16 md:px-0 md:pt-32">
			<div className="mx-auto flex w-full max-w-xl flex-col gap-8">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-3">
							<Button asChild className="w-fit px-4" variant="outline">
								<Link href="/open-source-program">Back to program</Link>
							</Button>
							<h1 className="font-f37-stout text-3xl leading-tight md:text-5xl">
								Apply to the OSS Program
							</h1>
						</div>
					</div>

					<p className="max-w-3xl text-muted-foreground leading-7">
						You need to be logged in and have a website created in Cossistant
						before you can submit. Pick the website, share the repository, and
						tell us why this project should be part of the program.
					</p>
				</div>

				<OpenSourceProgramApplicationCard />
			</div>
		</div>
	);
}
