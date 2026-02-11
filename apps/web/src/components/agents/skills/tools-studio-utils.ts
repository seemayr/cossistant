import type {
	GetCapabilitiesStudioResponse,
	UpdateBehaviorSettingsRequest,
} from "@cossistant/types";

type BehaviorSettingKey = NonNullable<
	GetCapabilitiesStudioResponse["tools"][number]["behaviorSettingKey"]
>;

export function buildBehaviorSettingsPatch(
	key: BehaviorSettingKey,
	value: boolean
): UpdateBehaviorSettingsRequest["settings"] {
	switch (key) {
		case "canResolve":
			return { canResolve: value };
		case "canMarkSpam":
			return { canMarkSpam: value };
		case "canSetPriority":
			return { canSetPriority: value };
		case "canEscalate":
			return { canEscalate: value };
		case "autoGenerateTitle":
			return { autoGenerateTitle: value };
		case "autoAnalyzeSentiment":
			return { autoAnalyzeSentiment: value };
		default:
			return {};
	}
}

export function normalizeSkillFileName(input: string): string {
	const value = input.trim().toLowerCase().replace(/\s+/g, "-");
	if (!value) {
		return "";
	}
	return value.endsWith(".md") ? value : `${value}.md`;
}
