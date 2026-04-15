import { ComponentSource } from "@/components/component-source";
import { cn } from "@/lib/utils";
import { Index } from "@/registry/__index__";
import { DocsComponentPreviewTabs } from "./component-preview-tabs";

const DOCS_COMPONENT_OVERRIDES: Record<string, string> = {
	support: "support-doc",
};

export function resolveDocsPreviewName(name: string) {
	const overrideName = DOCS_COMPONENT_OVERRIDES[name];
	return overrideName && Index[overrideName] ? overrideName : name;
}

export function ComponentPreview({
	name,
	className,
	align = "center",
	sizeClasses,
	withOrnament: _withOrnament,
}: React.ComponentProps<"div"> & {
	name: string;
	align?: "center" | "start" | "end";
	withOrnament?: boolean;
	sizeClasses?: string;
}) {
	const resolvedName = resolveDocsPreviewName(name);
	const Component =
		Index[resolvedName]?.demoComponent || Index[resolvedName]?.component;

	if (!Component) {
		return (
			<p className="text-muted-foreground text-sm">
				Component{" "}
				<code className="relative bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
					{name}
				</code>{" "}
				not found in registry.
			</p>
		);
	}

	return (
		<DocsComponentPreviewTabs
			align={align}
			className={cn("w-full", className)}
			component={<Component />}
			sizeClasses={sizeClasses}
			source={<ComponentSource name={resolvedName} />}
		/>
	);
}
