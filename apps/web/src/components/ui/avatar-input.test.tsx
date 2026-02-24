import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AvatarInput } from "./avatar-input";

describe("AvatarInput", () => {
	it("does not render avatar fallback when there is no preview image", () => {
		const html = renderToStaticMarkup(
			<AvatarInput onChange={() => {}} value={null} />
		);

		expect(html).not.toContain('data-slot="avatar-fallback"');
		expect(html).toContain("Preview");
	});

	it("renders image preview (and fallback container) when value exists", () => {
		const html = renderToStaticMarkup(
			<AvatarInput
				onChange={() => {}}
				value={{
					previewUrl: "https://cdn.example.com/logo.png",
					url: "https://cdn.example.com/logo.png",
					mimeType: "image/png",
					name: "logo.png",
				}}
			/>
		);

		expect(html).toContain("https://cdn.example.com/logo.png");
		expect(html).toContain('data-slot="avatar-fallback"');
	});
});
