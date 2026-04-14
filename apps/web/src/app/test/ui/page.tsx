import Link from "next/link";
import { createTestUiPageMetadata } from "@/components/test-ui/metadata";
import { TEST_UI_PAGE_DEFINITIONS } from "@/components/test-ui/registry";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const metadata = createTestUiPageMetadata("index");

export default function TestUiIndexPage() {
	return (
		<div className="grid gap-4 lg:grid-cols-2">
			{TEST_UI_PAGE_DEFINITIONS.map((page) => (
				<Link href={page.href} key={page.href}>
					<Card className="h-full border-border/70 transition-colors hover:border-foreground/20">
						<CardHeader>
							<CardTitle>{page.title}</CardTitle>
							<CardDescription>{page.description}</CardDescription>
						</CardHeader>
						<CardContent className="text-muted-foreground text-sm">
							Open {page.href}
						</CardContent>
					</Card>
				</Link>
			))}
		</div>
	);
}
