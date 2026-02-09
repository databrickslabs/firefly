import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { unstable_cache, revalidateTag } from 'next/cache';
import { nanoid, customAlphabet } from 'nanoid';
import { AUTHORING_TOOLS_CACHE_TAG } from './cache-tags';
import { db } from '@/db';
import { authoringTool, organization, user, userSpns } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import type { AuthoringToolType, AuthoringToolStatus } from '@/db/schema/authoring-tools';
import {
  getGlobalAdminToken,
  createApp,
  setAppPermissions,
  getApp,
} from '@/lib/databricks-apps-api';

export const dynamic = 'force-dynamic';

// GET - List all authoring tools for the current user
export async function GET() {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'No active organization' }, { status: 400 });
    }

    // Fetch tools from database
    const tools = await db
      .select({
        id: authoringTool.id,
        name: authoringTool.name,
        description: authoringTool.description,
        type: authoringTool.type,
        backingType: authoringTool.backingType,
        appId: authoringTool.appId,
        appName: authoringTool.appName,
        appUrl: authoringTool.appUrl,
        appStatus: authoringTool.appStatus,
        volumePath: authoringTool.volumePath,
        status: authoringTool.status,
        statusMessage: authoringTool.statusMessage,
        createdAt: authoringTool.createdAt,
        updatedAt: authoringTool.updatedAt,
        createdByUserId: authoringTool.createdByUserId,
        creatorName: user.name,
        creatorEmail: user.email,
      })
      .from(authoringTool)
      .innerJoin(user, eq(authoringTool.createdByUserId, user.id))
      .where(
        and(
          eq(authoringTool.organizationId, organizationId),
          eq(authoringTool.createdByUserId, session.user.id),
          isNull(authoringTool.deletedAt)
        )
      )
      .orderBy(authoringTool.updatedAt);

    // Sync status from Databricks for tools with apps
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);

    // Extend tools with deployment info
    const toolsWithDeployment = tools.map(tool => ({
      ...tool,
      hasActiveDeployment: false,
      deploymentStatus: null as string | null,
    }));

    if (org?.workspaceUrl) {
      const workspaceUrl = org.workspaceUrl.replace(/\/$/, '');
      const tokenResult = await getGlobalAdminToken(workspaceUrl);

      if (tokenResult.success) {
        const { accessToken } = tokenResult;

        // Update status for each tool with an app
        for (const tool of toolsWithDeployment) {
          if (tool.appName) {
            const appResult = await getApp(workspaceUrl, accessToken, tool.appName);
            if (appResult.success) {
              const app = appResult.data;
              const newAppStatus = app.compute_status?.state || app.app_status?.state || tool.appStatus;
              const newAppUrl = app.url || tool.appUrl;

              // Check for active deployment
              const hasActiveDeployment = !!app.active_deployment;
              const deploymentStatus = app.active_deployment?.status?.state || null;
              tool.hasActiveDeployment = hasActiveDeployment;
              tool.deploymentStatus = deploymentStatus;

              // Derive tool status from app status
              let newStatus = tool.status;
              if (newAppStatus === 'RUNNING' || newAppStatus === 'ACTIVE') {
                newStatus = 'RUNNING';
              } else if (newAppStatus === 'STOPPED' || newAppStatus === 'TERMINATED') {
                newStatus = 'STOPPED';
              } else if (newAppStatus === 'STARTING' || newAppStatus === 'PENDING') {
                newStatus = 'STARTING';
              }

              // Update if changed
              if (newAppStatus !== tool.appStatus || newAppUrl !== tool.appUrl || newStatus !== tool.status) {
                await db
                  .update(authoringTool)
                  .set({
                    appStatus: newAppStatus,
                    appUrl: newAppUrl,
                    status: newStatus as AuthoringToolStatus,
                    updatedAt: new Date(),
                  })
                  .where(eq(authoringTool.id, tool.id));

                // Update the tool object for response
                tool.appStatus = newAppStatus;
                tool.appUrl = newAppUrl;
                tool.status = newStatus as AuthoringToolStatus;
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ authoringTools: toolsWithDeployment });
  } catch (error) {
    console.error('Error fetching authoring tools:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new authoring tool
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'No active organization' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, type, volumePath } = body as {
      name: string;
      description?: string;
      type: AuthoringToolType;
      volumePath: string;
    };

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!type || !['MARIMO', 'CODE_SERVER'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be MARIMO or CODE_SERVER' },
        { status: 400 }
      );
    }

    if (!volumePath) {
      return NextResponse.json(
        { error: 'Backup folder is required' },
        { status: 400 }
      );
    }

    // Get the organization's workspace URL
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);

    if (!org?.workspaceUrl) {
      return NextResponse.json(
        { error: 'No workspace URL configured for this organization' },
        { status: 400 }
      );
    }

    // Get the user's SPN credentials (to set permissions)
    const userEmail = session.user.email;
    const [spnRecord] = await db
      .select()
      .from(userSpns)
      .where(eq(userSpns.email, userEmail))
      .limit(1);

    if (!spnRecord) {
      return NextResponse.json(
        { error: 'No SPN credentials found for your account' },
        { status: 400 }
      );
    }

    const workspaceUrl = org.workspaceUrl.replace(/\/$/, '');

    // Get global admin token
    const tokenResult = await getGlobalAdminToken(workspaceUrl);
    if (!tokenResult.success) {
      return NextResponse.json({ error: tokenResult.error }, { status: 500 });
    }

    const { accessToken } = tokenResult;

    // Generate a unique app name (lowercase, alphanumeric, hyphens only, 2-30 chars)
    const sanitizedName = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
    const appSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);
    const appName = `${sanitizedName}-${appSuffix()}`;

    // Create the authoring tool record first (with CREATING status)
    const toolId = nanoid();
    const now = new Date();

    await db.insert(authoringTool).values({
      id: toolId,
      organizationId,
      name,
      description: description || null,
      type,
      backingType: 'APP',
      volumePath,
      status: 'CREATING',
      createdByUserId: session.user.id,
      createdAt: now,
      updatedAt: now,
    });

    // Create the Databricks app with secret resource for SPN credentials
    const secretScopeName = process.env.FIREFLY_WORKSPACE_SPN_SECRET_SCOPE_NAME;
    if (!secretScopeName) {
      return NextResponse.json(
        { error: 'Secret scope name not configured' },
        { status: 500 }
      );
    }

    const appResult = await createApp(workspaceUrl, accessToken, {
      name: appName,
      description: `${type} authoring tool: ${name}`,
      no_compute: true,
      resources: [
        {
          name: 'firefly_spn_secret',
          description: 'SPN client secret for auth',
          secret: {
            scope: secretScopeName,
            key: spnRecord.clientId,
            permission: 'READ',
          },
        },
        {
          name: 'firefly_spn_pat',
          description: 'SPN PAT token for CLI auth',
          secret: {
            scope: secretScopeName,
            key: `${spnRecord.clientId}-pat`,
            permission: 'READ',
          },
        },
      ],
    });

    if (!appResult.success) {
      // Update the record with error status
      await db
        .update(authoringTool)
        .set({
          status: 'ERROR',
          statusMessage: appResult.error,
          updatedAt: new Date(),
        })
        .where(eq(authoringTool.id, toolId));

      revalidateTag(AUTHORING_TOOLS_CACHE_TAG);

      return NextResponse.json(
        { error: appResult.error, toolId },
        { status: 500 }
      );
    }

    const app = appResult.data;

    // Update the record with app details - app created but not started (STOPPED)
    await db
      .update(authoringTool)
      .set({
        appId: app.id,
        appName: app.name,
        appUrl: app.url || null,
        appStatus: app.app_status?.state || 'STOPPED',
        status: 'STOPPED', // App created but not running
        updatedAt: new Date(),
      })
      .where(eq(authoringTool.id, toolId));

    // Set permissions for the user's SPN to use the app
    const permResult = await setAppPermissions(workspaceUrl, accessToken, app.name, [
      {
        service_principal_name: spnRecord.clientId,
        permission_level: 'CAN_USE',
      },
    ]);

    if (!permResult.success) {
      // Log the error but don't fail - the app was created
      console.warn('Failed to set app permissions:', permResult.error);
    }

    revalidateTag(AUTHORING_TOOLS_CACHE_TAG);

    return NextResponse.json({
      success: true,
      authoringTool: {
        id: toolId,
        name,
        description,
        type,
        volumePath,
        appId: app.id,
        appName: app.name,
        appUrl: app.url,
        status: 'STOPPED',
      },
    });
  } catch (error) {
    console.error('Error creating authoring tool:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
