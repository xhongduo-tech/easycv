import { internalAgentEndpoint } from "@/lib/agent-api";
export async function POST(request: Request) { return internalAgentEndpoint(request, "claim"); }
