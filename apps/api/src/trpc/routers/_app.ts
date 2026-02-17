import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { createTRPCRouter } from "../init";
import { aiAgentRouter } from "./ai-agent";
import { contactRouter } from "./contact";
import { conversationRouter } from "./conversation";
import { knowledgeRouter } from "./knowledge";
import { linkSourceRouter } from "./link-source";
import { notificationRouter } from "./notification";
import { planRouter } from "./plan";
import { resendRouter } from "./resend";
import { teamRouter } from "./team";
import { uploadRouter } from "./upload";
import { userRouter } from "./user";
import { viewRouter } from "./view";
import { visitorRouter } from "./visitor";
import { websiteRouter } from "./website";

export const origamiTRPCRouter = createTRPCRouter({
	aiAgent: aiAgentRouter,
	resend: resendRouter,
	team: teamRouter,
	user: userRouter,
	website: websiteRouter,
	conversation: conversationRouter,
	view: viewRouter,
	visitor: visitorRouter,
	contact: contactRouter,
	upload: uploadRouter,
	plan: planRouter,
	notification: notificationRouter,
	knowledge: knowledgeRouter,
	linkSource: linkSourceRouter,
});

// export type definition of API
export type OrigamiTRPCRouter = typeof origamiTRPCRouter;
export type OrigamiTRPCRouterOutputs = inferRouterOutputs<OrigamiTRPCRouter>;
export type OrigamiTRPCRouterInputs = inferRouterInputs<OrigamiTRPCRouter>;

export type RouterInputs = inferRouterInputs<OrigamiTRPCRouter>;
export type RouterOutputs = inferRouterOutputs<OrigamiTRPCRouter>;
