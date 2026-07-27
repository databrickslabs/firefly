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
 * The attribution target must match whatever actually answered the question.
 * With GENIE_MCP_MODE=space the agent is scoped to one Genie space, so linking to
 * Genie One would send the user somewhere that never saw their question.
 */
function genieTargetFromEnv(workspaceHost: string, workspaceId?: string): string {
  const spaceMode = process.env.GENIE_MCP_MODE?.trim().toLowerCase() === 'space';
  const spaceId = process.env.GENIE_SPACE_ID?.trim();
  const explicit = process.env.GENIE_ONE_URL?.trim();
  const suffix = workspaceId ? `?o=${workspaceId}` : '';

  // The client labels the link from its path, so /genie/rooms/ is what tells the
  // UI to stop calling this "Genie One".
  if (spaceMode && spaceId) {
    // GENIE_ONE_URL stays an escape hatch, but it cannot name a space it does not
    // know about, so an explicit space id wins here.
    return workspaceHost ? `${workspaceHost}/genie/rooms/${spaceId}${suffix}` : '';
  }
  if (explicit) {
    return explicit;
  }
  if (!workspaceHost) {
    return '';
  }
  return `${workspaceHost}/one${suffix}`;
}

function genieConfigFromEnv() {
  const workspaceHost = workspaceHostFromEnv();
  const workspaceId = process.env.DATABRICKS_WORKSPACE_ID?.trim();
  const genieOneUrl = genieTargetFromEnv(workspaceHost, workspaceId);
  if (!genieOneUrl && !workspaceHost) {
    return null;
  }
  return {
    workspaceHost,
    workspaceId: workspaceId || undefined,
    genieOneUrl: genieOneUrl || undefined,
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
