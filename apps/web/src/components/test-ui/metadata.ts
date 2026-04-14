import type { Metadata } from "next";
import { utilityNoindex } from "@/lib/metadata";
import {
	getTestUiPageDefinition,
	TEST_UI_INDEX_PAGE,
	type TestUiPageId,
} from "./registry";

export function createTestUiPageMetadata(
	pageId: TestUiPageId | "index"
): Metadata {
	const page =
		pageId === "index" ? TEST_UI_INDEX_PAGE : getTestUiPageDefinition(pageId);

	return utilityNoindex({
		title: page.title,
		description: page.description,
		path: page.href,
	});
}
