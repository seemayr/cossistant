import { Hono } from "hono";

// Workflows
import waitlistWorkflow from "./waitlist";
import conversationsWorkflow from "./conversations";

const workflowsRouters = new Hono();

// Include all workflows below
workflowsRouters.route("/waitlist", waitlistWorkflow);
workflowsRouters.route("/conversations", conversationsWorkflow);

export { workflowsRouters };
