import { describe, expect, it } from "bun:test";
import { buildUniqueUploadIdentity } from "./avatar-upload-key";

describe("buildUniqueUploadIdentity", () => {
	it("generates unique file names for repeated uploads", () => {
		const file = new File(["hello"], "team-logo.png", { type: "image/png" });
		const first = buildUniqueUploadIdentity(file);
		const second = buildUniqueUploadIdentity(file);

		expect(first.fileName).not.toBe(second.fileName);
		expect(first.fileExtension).toBe("png");
		expect(second.fileExtension).toBe("png");
	});

	it("derives extension from mime type when filename has no extension", () => {
		const file = new File(["hello"], "workspace-logo", { type: "image/webp" });
		const identity = buildUniqueUploadIdentity(file);

		expect(identity.fileExtension).toBe("webp");
	});

	it("returns undefined extension for unknown types without filename extension", () => {
		const file = new File(["hello"], "workspace-logo", {
			type: "application/octet-stream",
		});
		const identity = buildUniqueUploadIdentity(file);

		expect(identity.fileExtension).toBeUndefined();
	});

	it("keeps file names under API limits", () => {
		const veryLongName = `${"a".repeat(200)}.png`;
		const file = new File(["hello"], veryLongName, { type: "image/png" });
		const identity = buildUniqueUploadIdentity(file);

		expect(identity.fileName.length).toBeLessThanOrEqual(128);
		expect(identity.fileName.length).toBeGreaterThan(0);
	});
});
