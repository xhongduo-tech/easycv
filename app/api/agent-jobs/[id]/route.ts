import { agentJobEndpoint } from "@/lib/agent-api";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return agentJobEndpoint(request, (await context.params).id);
}
