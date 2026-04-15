import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { AvailableAIAgent, AvailableHumanAgent } from "@cossistant/types";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupportTextResolvedFormatter } from "../text/locales/keys";

function createTextFormatter(): SupportTextResolvedFormatter {
	return ((key: string) => {
		switch (key) {
			case "common.fallbacks.supportTeam":
				return "Support team";
			default:
				throw new Error(`Unexpected text key: ${key}`);
		}
	}) as SupportTextResolvedFormatter;
}

const useSupportTextMock = mock(() => createTextFormatter());

mock.module("../text", () => ({
	useSupportText: useSupportTextMock,
}));

mock.module("./avatar", () => ({
	Avatar: ({ name, facehashName }: { name: string; facehashName?: string }) =>
		React.createElement("div", {
			"data-avatar-name": name,
			"data-facehash-name": facehashName ?? "",
		}),
}));

const avatarStackModulePromise = import("./avatar-stack");

describe("AvatarStack", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		useSupportTextMock.mockClear();
	});

	it("passes the human name to Facehash when present", async () => {
		const { AvatarStack } = await avatarStackModulePromise;
		const humanAgents = [
			{
				id: "human-1",
				name: "  Ada Lovelace  ",
				email: "ada@example.com",
				image: null,
				lastSeenAt: null,
			},
		] as AvailableHumanAgent[];

		const html = renderToStaticMarkup(
			React.createElement(AvatarStack, {
				humanAgents,
				aiAgents: [] as AvailableAIAgent[],
			})
		);

		expect(html).toContain('data-avatar-name="Ada Lovelace"');
		expect(html).toContain('data-facehash-name="Ada Lovelace"');
	});

	it("passes the human email to Facehash when the name is missing", async () => {
		const { AvatarStack } = await avatarStackModulePromise;
		const humanAgents = [
			{
				id: "human-1",
				name: "   ",
				email: "ada@example.com",
				image: null,
				lastSeenAt: null,
			},
		] as AvailableHumanAgent[];

		const html = renderToStaticMarkup(
			React.createElement(AvatarStack, {
				humanAgents,
				aiAgents: [] as AvailableAIAgent[],
			})
		);

		expect(html).toContain('data-avatar-name="Support team"');
		expect(html).toContain('data-facehash-name="ada@example.com"');
	});

	it("uses Support team as the Facehash input when name and email are missing", async () => {
		const { AvatarStack } = await avatarStackModulePromise;
		const humanAgents = [
			{
				id: "human-1",
				name: "   ",
				email: null,
				image: null,
				lastSeenAt: null,
			},
		] as AvailableHumanAgent[];

		const html = renderToStaticMarkup(
			React.createElement(AvatarStack, {
				humanAgents,
				aiAgents: [] as AvailableAIAgent[],
			})
		);

		expect(html).toContain('data-avatar-name="Support team"');
		expect(html).toContain('data-facehash-name="Support team"');
	});
});
