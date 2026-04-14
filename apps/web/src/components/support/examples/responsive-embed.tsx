import { Support } from "@cossistant/react";

export default function ExampleResponsiveEmbed() {
	return (
		<div className="h-[560px] overflow-hidden rounded-[24px] border">
			<Support
				mode="responsive"
				quickOptions={[
					"How do I embed support inline?",
					"Can I keep my own shell?",
					"What can I override with slots?",
				]}
				slotProps={{
					content: {
						className: "bg-background",
					},
				}}
			/>
		</div>
	);
}
