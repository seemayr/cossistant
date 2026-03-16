import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/layout";

export function FakeConversationHeader() {
	return (
		<PageHeader className="z-10 border-b bg-background pl-3.5 dark:bg-background-50">
			<div className="flex items-center gap-2">
				<div className="flex items-center gap-4">
					<Button
						onClick={() => {}}
						size="icon-small"
						type="button"
						variant="ghost"
					>
						<Icon name="arrow-left" />
					</Button>
					<div className="flex items-center gap-2">
						<Button
							disabled
							onClick={() => {}}
							size="icon-small"
							type="button"
							variant="outline"
						>
							<Icon className="rotate-90" name="arrow-left" />
						</Button>
						<Button
							disabled={false}
							onClick={() => {}}
							size="icon-small"
							type="button"
							variant="outline"
						>
							<Icon className="rotate-90" name="arrow-right" />
						</Button>
					</div>
					<div className="flex gap-0.5 text-primary/40 text-sm">
						<span className="text-primary/90">1</span>
						<span>/</span>
						<span>4</span>
					</div>
				</div>
			</div>
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-3 pr-0">
					<Button
						disabled={false}
						onClick={() => {}}
						size="icon-small"
						type="button"
						variant="ghost"
					>
						<Icon filledOnHover name="check" />
					</Button>
					<Button
						disabled={false}
						onClick={() => {}}
						size="icon-small"
						type="button"
						variant="ghost"
					>
						<Icon filledOnHover name="archive" />
					</Button>
				</div>
				<Button
					onClick={() => {}}
					size="icon-small"
					type="button"
					variant="ghost"
				>
					<Icon name="more" variant="filled" />
				</Button>
			</div>
		</PageHeader>
	);
}
