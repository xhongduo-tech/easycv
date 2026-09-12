import { internalAgentEndpoint } from "@/lib/agent-api";
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await context.params;
  return internalAgentEndpoint(request, action, id);
}
