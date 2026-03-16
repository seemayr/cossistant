import { cn } from "@/lib/utils";

export const FakeCentralContainer = ({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) => (
	<div className="fake-central-container flex min-h-0 w-full flex-1 px-2 pb-2">
		<section
			className={cn(
				"flex h-full max-h-full min-h-0 flex-1 overflow-clip rounded border bg-background dark:bg-background-50",
				className
			)}
		>
			{children}
		</section>
	</div>
);
