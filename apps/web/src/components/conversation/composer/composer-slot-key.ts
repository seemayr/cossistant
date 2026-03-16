import type React from "react";
import { isValidElement } from "react";

export function getComposerAnimatedSlotKey(
	slotKey: string,
	children?: React.ReactNode
) {
	if (!(isValidElement(children) && children.key != null)) {
		return slotKey;
	}

	return `${slotKey}:${String(children.key)}`;
}
