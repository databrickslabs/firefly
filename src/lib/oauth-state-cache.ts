/**
 * Database-based storage for OAuth state to organization mapping
 *
 * This stores the mapping between OAuth state and organization ID
 * in the database so it persists across serverless function invocations.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

interface StateMapping {
  organizationId: string;
  workspaceUrl: string;
}

/**
 * Store OAuth state mapping in database
 * Uses a simple key-value table or embeds in the state parameter itself
 *
 * For serverless, we'll encode the organization info directly in the state parameter
 * Format: base64(originalState + "|" + organizationId + "|" + workspaceUrl)
 */
export function encodeOAuthState(originalState: string, organizationId: string, workspaceUrl: string): string {
  const combined = `${originalState}|${organizationId}|${workspaceUrl}`;
  const encoded = Buffer.from(combined).toString("base64url");
  console.log("[OAuth State] Encoded state with org info:", organizationId);
  return encoded;
}

export function decodeOAuthState(encodedState: string): { originalState: string; organizationId: string; workspaceUrl: string } | null {
  try {
    const decoded = Buffer.from(encodedState, "base64url").toString("utf-8");
    const parts = decoded.split("|");

    if (parts.length < 3) {
      console.log("[OAuth State] Invalid state format");
      return null;
    }

    // The original state might contain "|" so we need to be careful
    // Format: originalState|orgId|workspaceUrl
    const workspaceUrl = parts[parts.length - 1];
    const organizationId = parts[parts.length - 2];
    const originalState = parts.slice(0, -2).join("|");

    console.log("[OAuth State] Decoded state:", { organizationId, workspaceUrl: workspaceUrl.substring(0, 30) + "..." });

    return {
      originalState,
      organizationId,
      workspaceUrl,
    };
  } catch (error) {
    console.error("[OAuth State] Failed to decode state:", error);
    return null;
  }
}
