import { getAuthInstance } from "@/lib/auth-dynamic";
import { toNextJsHandler } from "better-auth/next-js";

// Create handlers that use the dynamic auth instance
export async function GET(request: Request) {
  const auth = await getAuthInstance();
  const handler = toNextJsHandler(auth);
  return handler.GET(request);
}

export async function POST(request: Request) {
  const auth = await getAuthInstance();
  const handler = toNextJsHandler(auth);
  return handler.POST(request);
}
