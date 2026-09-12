import { agentJobEndpoint } from "@/lib/agent-api";
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await context.params;
  return agentJobEndpoint(request, id, action);
}
