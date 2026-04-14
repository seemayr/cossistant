"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getTestUiNavItems } from "./registry";

export function TestUiNav() {
	const pathname = usePathname();
	const navItems = getTestUiNavItems();

	return (
		<nav
			aria-label="UI test navigation"
			className="flex flex-wrap items-center gap-2"
		>
			{navItems.map((item) => {
				const isActive =
					pathname === item.href ||
					(item.href !== "/test/ui" && pathname?.startsWith(`${item.href}/`));

				return (
					<Link
						className={cn(
							"rounded-full border px-3 py-1.5 text-sm transition-colors",
							isActive
								? "border-border bg-foreground text-background"
								: "border-border/70 bg-background text-muted-foreground hover:text-foreground"
						)}
						href={item.href}
						key={item.href}
					>
						{item.label}
					</Link>
				);
			})}
		</nav>
	);
}
