"use client";

export const COMPOSER_MIN_EDITOR_HEIGHT_PX = 44;
export const COMPOSER_MIN_EDITOR_HEIGHT_CLASS_NAME = "min-h-11";
export const COMPOSER_EDITOR_SURFACE_CLASS_NAME =
	"min-h-11 w-full p-3 text-sm leading-6";

export function getComposerEditorHeightPx(scrollHeight: number) {
	return Math.max(scrollHeight, COMPOSER_MIN_EDITOR_HEIGHT_PX);
}
