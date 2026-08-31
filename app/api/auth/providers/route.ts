import { NextResponse } from "next/server";
import { getAuthCapabilities } from "@/lib/auth-notifications";

export async function GET() {
  return NextResponse.json(getAuthCapabilities(), {
    headers: { "cache-control": "private, max-age=60" },
  });
}
