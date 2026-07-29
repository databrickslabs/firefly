import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { isDatabaseAvailable } from '@chat-template/db';
import { getEndpointOboInfo } from '@chat-template/ai-sdk-providers';

export const configRouter: RouterType = Router();

/**
 * Extract OAuth scopes from a JWT token (without verification).
 * Databricks tokens use 'scope' (space-separated string) or 'scp' (array).
 */
function getScopesFromToken(token: string): string[] {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return [];
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    if (typeof payload.scope === 'string') return payload.scope.split(' ');
    if (Array.isArray(payload.scp)) return payload.scp as string[];
    return [];
  } catch {
    return [];
  }
}

function workspaceHostFromEnv(): string {
  const host = process.env.DATABRICKS_HOST?.trim();
  if (host) {
    return host.replace(/\/$/, '');
  }
  const mcpUrl = process.env.GENIE_MCP_URL?.trim();
  if (!mcpUrl) {
    return '';
  }
  try {
    return new URL(mcpUrl).origin;
  } catch {
    return '';
  }
}

/**
 * No attribution URL is exposed. The panel's audience is guest users with no
 * Databricks workspace access, so any workspace link is dead for them — and once
 * GENIE_MCP_MODE defaults to a space, a "Genie Agent" link names a backend that
 * never answered the question. The UI shows plain-text attribution instead.
 */
function genieConfigFromEnv() {
  const workspaceHost = workspaceHostFromEnv();
  const workspaceId = process.env.DATABRICKS_WORKSPACE_ID?.trim();
  if (!workspaceHost) {
    return null;
  }
  return {
    workspaceHost,
    workspaceId: workspaceId || undefined,
  };
}

/**
 * GET /api/config - Get application configuration
 * Returns feature flags and OBO status based on environment configuration.
 * If the user's OBO token is present, decodes it to check which required
 * scopes are missing — the banner only shows missing scopes.
 */
configRouter.get('/', async (req: Request, res: Response) => {
  const oboInfo = await getEndpointOboInfo();

  let missingScopes = oboInfo.endpointRequiredScopes;

  const userToken = req.headers['x-forwarded-access-token'] as string | undefined;
  if (userToken && oboInfo.isEndpointOboEnabled) {
    const tokenScopes = getScopesFromToken(userToken);
    missingScopes = oboInfo.endpointRequiredScopes.filter(required => {
      const parent = required.split('.')[0];
      return !tokenScopes.some(ts => ts === required || ts === parent);
    });
  }

  res.json({
    features: {
      chatHistory: isDatabaseAvailable(),
      feedback: !!process.env.MLFLOW_EXPERIMENT_ID,
    },
    obo: {
      missingScopes,
    },
    genie: genieConfigFromEnv(),
  });
});
