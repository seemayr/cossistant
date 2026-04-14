import { describe, expect, it } from "bun:test";
import * as ReactSDK from "./index";

describe("public export surface", () => {
	it("does not leak private hook helpers from the package root", () => {
		expect("useClientQuery" in ReactSDK).toBe(false);
		expect("useDefaultMessages" in ReactSDK).toBe(false);
		expect("useGroupedMessages" in ReactSDK).toBe(false);
		expect("useMultimodalInput" in ReactSDK).toBe(false);
	});
});
