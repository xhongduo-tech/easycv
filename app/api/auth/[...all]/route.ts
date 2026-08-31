import { auth } from "@/lib/auth";
import { ensureDatabase } from "@/../db";

async function handle(request: Request) {
  await ensureDatabase();
  return auth.handler(request);
}

export { handle as GET, handle as POST };
