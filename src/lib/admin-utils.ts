/**
 * Admin utility functions for access control and validation
 */

/**
 * Check if a user email has admin access (@databricks.com domain)
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith("@databricks.com");
}

/**
 * Validate and normalize a Databricks workspace URL
 * - Must be a valid URL
 * - Must use HTTPS protocol
 * - Removes trailing slashes
 * - Should match pattern: https://[subdomain].cloud.databricks.com
 */
export function validateWorkspaceUrl(url: string): {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
} {
  if (!url || url.trim() === "") {
    return {
      isValid: false,
      error: "Workspace URL is required",
    };
  }

  try {
    // Remove trailing slashes
    const trimmedUrl = url.trim().replace(/\/+$/, "");

    // Parse the URL
    const parsedUrl = new URL(trimmedUrl);

    // Check protocol
    if (parsedUrl.protocol !== "https:") {
      return {
        isValid: false,
        error: "Workspace URL must use HTTPS protocol",
      };
    }

    // Check if it's a Databricks domain
    if (!parsedUrl.hostname.includes("databricks.com")) {
      return {
        isValid: false,
        error: "Workspace URL must be a Databricks domain (*.databricks.com)",
      };
    }

    return {
      isValid: true,
      normalizedUrl: trimmedUrl,
    };
  } catch {
    return {
      isValid: false,
      error: "Invalid URL format",
    };
  }
}

/**
 * Normalize a workspace URL by removing trailing slashes
 */
export function normalizeWorkspaceUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Generate a slug from an organization name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}
