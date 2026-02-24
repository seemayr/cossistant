import { Hono } from "hono";
import messageWorkflow from "./message";

const workflowsRouters = new Hono();

// Include all workflows below
workflowsRouters.route("/message", messageWorkflow);

export { workflowsRouters };
