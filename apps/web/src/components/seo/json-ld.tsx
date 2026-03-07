type JsonLdValue = Record<string, unknown>;

function isJsonLdValue(value: unknown): value is JsonLdValue {
	return typeof value === "object" && value !== null;
}

export function JsonLdScripts({
	data,
	idPrefix = "jsonld",
}: {
	data: JsonLdValue | JsonLdValue[] | null | undefined;
	idPrefix?: string;
}) {
	const items = (Array.isArray(data) ? data : [data]).filter(isJsonLdValue);

	if (items.length === 0) {
		return null;
	}

	return (
		<>
			{items.map((item, index) => (
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is serialized from trusted server-side objects.
					dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
					id={`${idPrefix}-${index}`}
					key={`${idPrefix}-${index}`}
					type="application/ld+json"
				/>
			))}
		</>
	);
}
