import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { AUTHORING_TOOLS_CACHE_TAG } from '../cache-tags';
import { db } from '@/db';
import { authoringTool, organization, userSpns, organizationWarehouses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  getGlobalAdminToken,
  deleteApp,
  getApp,
  startApp,
  stopApp,
  createDeployment,
  getDeployment,
} from '@/lib/databricks-apps-api';
import { ensureBuiltinAppInWorkspace } from '@/lib/databricks-workspace-api';

// Source code paths for different tool types (must be directories, not files)
const TOOL_SOURCE_PATHS = {
  MARIMO: '/Workspace/firefly-apps/marimo-notebooks',
  CODE_SERVER: '/Workspace/firefly-apps/code-editor',
} as const;

export const dynamic = 'force-dynamic';

// GET - Get a single authoring tool
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const [tool] = await db
      .select()
      .from(authoringTool)
      .where(
        and(
          eq(authoringTool.id, id),
          eq(authoringTool.organizationId, organizationId),
          eq(authoringTool.createdByUserId, session.user.id)
        )
      )
      .limit(1);

    if (!tool) {
      return NextResponse.json({ error: 'Authoring tool not found' }, { status: 404 });
    }

    // If there's an app, fetch the latest status from Databricks
    if (tool.appName) {
      const [org] = await db
        .select()
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1);

      if (org?.workspaceUrl) {
        const workspaceUrl = org.workspaceUrl.replace(/\/$/, '');
        const tokenResult = await getGlobalAdminToken(workspaceUrl);

        if (tokenResult.success) {
          const appResult = await getApp(workspaceUrl, tokenResult.accessToken, tool.appName);

          if (appResult.success) {
            const app = appResult.data;
            // Update local status if changed
            const newStatus = app.compute_status?.state || app.app_status?.state || tool.appStatus;

            if (newStatus !== tool.appStatus) {
              await db
                .update(authoringTool)
                .set({
                  appStatus: newStatus,
                  appUrl: app.url || tool.appUrl,
                  updatedAt: new Date(),
                })
                .where(eq(authoringTool.id, id));

              tool.appStatus = newStatus;
              tool.appUrl = app.url || tool.appUrl;
            }
          }
        }
      }
    }

    return NextResponse.json({ authoringTool: tool });
  } catch (error) {
    console.error('Error fetching authoring tool:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Actions on an authoring tool (start, stop, refresh)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
    const { action, type: newType, volumePath: newVolumePath } = body as {
      action: 'start' | 'stop' | 'refresh' | 'setup' | 'redeploy';
      type?: 'MARIMO' | 'CODE_SERVER';
      volumePath?: string;
    };

    if (!action || !['start', 'stop', 'refresh', 'setup', 'redeploy'].includes(action)) {
      return NextResponse.json(
        { error: 'Action must be start, stop, refresh, setup, or redeploy' },
        { status: 400 }
      );
    }

    // Get the authoring tool
    const [tool] = await db
      .select()
      .from(authoringTool)
      .where(
        and(
          eq(authoringTool.id, id),
          eq(authoringTool.organizationId, organizationId),
          eq(authoringTool.createdByUserId, session.user.id)
        )
      )
      .limit(1);

    if (!tool) {
      return NextResponse.json({ error: 'Authoring tool not found' }, { status: 404 });
    }

    if (!tool.appName) {
      return NextResponse.json({ error: 'No app associated with this tool' }, { status: 400 });
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

    const workspaceUrl = org.workspaceUrl.replace(/\/$/, '');
    const tokenResult = await getGlobalAdminToken(workspaceUrl);

    if (!tokenResult.success) {
      return NextResponse.json({ error: tokenResult.error }, { status: 500 });
    }

    const { accessToken } = tokenResult;

    if (action === 'start') {
      const result = await startApp(workspaceUrl, accessToken, tool.appName);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      // Set status to STARTING - will be updated to RUNNING by sync when app is ready
      const appStatus = result.data.compute_status?.state || 'STARTING';
      const newStatus = appStatus === 'RUNNING' || appStatus === 'ACTIVE' ? 'RUNNING' : 'STARTING';

      await db
        .update(authoringTool)
        .set({
          status: newStatus,
          appStatus: appStatus,
          appUrl: result.data.url || tool.appUrl,
          updatedAt: new Date(),
        })
        .where(eq(authoringTool.id, id));

      revalidateTag(AUTHORING_TOOLS_CACHE_TAG);
      return NextResponse.json({ success: true, status: newStatus });
    }

    if (action === 'stop') {
      const result = await stopApp(workspaceUrl, accessToken, tool.appName);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      await db
        .update(authoringTool)
        .set({
          status: 'STOPPED',
          appStatus: 'STOPPED',
          updatedAt: new Date(),
        })
        .where(eq(authoringTool.id, id));

      revalidateTag(AUTHORING_TOOLS_CACHE_TAG);
      return NextResponse.json({ success: true, status: 'STOPPED' });
    }

    if (action === 'refresh') {
      const result = await getApp(workspaceUrl, accessToken, tool.appName);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      const app = result.data;
      const newStatus = app.compute_status?.state || app.app_status?.state || 'UNKNOWN';

      await db
        .update(authoringTool)
        .set({
          appStatus: newStatus,
          appUrl: app.url || tool.appUrl,
          updatedAt: new Date(),
        })
        .where(eq(authoringTool.id, id));

      revalidateTag(AUTHORING_TOOLS_CACHE_TAG);
      return NextResponse.json({ success: true, app });
    }

    if (action === 'setup') {
      // Store the validated appName (we already checked it's not null above)
      const appName = tool.appName;

      // Get the user's SPN credentials
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

      // Validate tool has required fields
      if (!tool.volumePath) {
        return NextResponse.json(
          { error: 'Backup folder is required before setup' },
          { status: 400 }
        );
      }

      const volumePath = tool.volumePath;

      // Get the source code path for the tool type
      const sourceCodePath = TOOL_SOURCE_PATHS[tool.type as keyof typeof TOOL_SOURCE_PATHS];
      if (!sourceCodePath) {
        return NextResponse.json(
          { error: `Unknown tool type: ${tool.type}` },
          { status: 400 }
        );
      }

      console.log('Creating deployment for app:', appName, 'with source:', sourceCodePath);

      // Ensure the builtin app source code is synced to workspace
      const syncResult = await ensureBuiltinAppInWorkspace(
        workspaceUrl,
        accessToken,
        tool.type as 'MARIMO' | 'CODE_SERVER'
      );
      if (!syncResult.success) {
        console.error('Failed to sync builtin app to workspace:', syncResult.error);
        return NextResponse.json(
          { error: `Failed to sync app source code: ${syncResult.error}` },
          { status: 500 }
        );
      }
      console.log('Workspace sync result:', syncResult.data);

      // Get the default warehouse for HTTP path
      const [defaultWarehouse] = await db
        .select()
        .from(organizationWarehouses)
        .where(
          and(
            eq(organizationWarehouses.organizationId, organizationId),
            eq(organizationWarehouses.isDefault, true)
          )
        )
        .limit(1);

      // Create the deployment with environment variables
      const deployResult = await createDeployment(workspaceUrl, accessToken, appName, {
        source_code_path: sourceCodePath,
        mode: 'SNAPSHOT',
        env_vars: [
          {
            name: 'BACKUP_VOLUME_PATH',
            value: volumePath,
          },
          {
            name: 'FIREFLY_DATABRICKS_CLIENT_ID',
            value: spnRecord.clientId,
          },
          {
            name: 'FIREFLY_DATABRICKS_CLIENT_SECRET',
            value_from: 'firefly_spn_secret',
          },
          {
            name: 'FIREFLY_DATABRICKS_TOKEN',
            value_from: 'firefly_spn_pat',
          },
          ...(defaultWarehouse ? [{
            name: 'DATABRICKS_HTTP_PATH',
            value: `/sql/1.0/warehouses/${defaultWarehouse.warehouseId}`,
          }] : []),
        ],
      });

      if (!deployResult.success) {
        console.error('Deployment creation failed:', deployResult.error);
        return NextResponse.json({ error: deployResult.error }, { status: 500 });
      }

      const deployment = deployResult.data;
      console.log('Deployment created:', deployment.deployment_id);

      // Poll for deployment completion (max 60 seconds)
      const maxWaitTime = 60000; // 60 seconds
      const pollInterval = 2000; // 2 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const statusResult = await getDeployment(
          workspaceUrl,
          accessToken,
          appName,
          deployment.deployment_id
        );

        if (!statusResult.success) {
          console.error('Error checking deployment status:', statusResult.error);
          break;
        }

        const deploymentStatus = statusResult.data.status?.state;

        if (deploymentStatus === 'SUCCEEDED') {
          // Deployment succeeded - refresh app status
          const appResult = await getApp(workspaceUrl, accessToken, appName);
          if (appResult.success) {
            const app = appResult.data;
            const appStatus = app.compute_status?.state || app.app_status?.state || 'RUNNING';

            await db
              .update(authoringTool)
              .set({
                appStatus: appStatus,
                appUrl: app.url || tool.appUrl,
                updatedAt: new Date(),
              })
              .where(eq(authoringTool.id, id));
          }

          revalidateTag(AUTHORING_TOOLS_CACHE_TAG);
          return NextResponse.json({
            success: true,
            deployment: statusResult.data,
            message: 'Deployment completed successfully',
          });
        }

        if (deploymentStatus === 'FAILED') {
          return NextResponse.json(
            {
              error: `Deployment failed: ${statusResult.data.status?.message || 'Unknown error'}`,
            },
            { status: 500 }
          );
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      // Timeout - return current status
      revalidateTag(AUTHORING_TOOLS_CACHE_TAG);
      return NextResponse.json({
        success: true,
        deployment,
        message: 'Deployment started but not yet complete. Check status in a moment.',
      });
    }

    if (action === 'redeploy') {
      // Redeploy allows changing type and/or volume path while the app is running
      // This creates a new snapshot deployment with the updated settings

      // Store the validated appName (we already checked it's not null above)
      const appName = tool.appName;

      // Get the user's SPN credentials
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

      // Use new values if provided, otherwise use existing
      const finalType = newType || tool.type;
      const finalVolumePath = newVolumePath !== undefined ? newVolumePath : tool.volumePath;

      if (!finalVolumePath) {
        return NextResponse.json(
          { error: 'Backup folder is required for deployment' },
          { status: 400 }
        );
      }

      // Validate type if provided
      if (newType && !['MARIMO', 'CODE_SERVER'].includes(newType)) {
        return NextResponse.json(
          { error: 'Type must be MARIMO or CODE_SERVER' },
          { status: 400 }
        );
      }

      // Get the source code path for the tool type
      const sourceCodePath = TOOL_SOURCE_PATHS[finalType as keyof typeof TOOL_SOURCE_PATHS];
      if (!sourceCodePath) {
        return NextResponse.json(
          { error: `Unknown tool type: ${finalType}` },
          { status: 400 }
        );
      }

      // Update tool in database first
      await db
        .update(authoringTool)
        .set({
          type: finalType,
          volumePath: finalVolumePath,
          updatedAt: new Date(),
        })
        .where(eq(authoringTool.id, id));

      console.log('Creating redeploy for app:', appName, 'with source:', sourceCodePath, 'type:', finalType);

      // Ensure the builtin app source code is synced to workspace
      const syncResult = await ensureBuiltinAppInWorkspace(
        workspaceUrl,
        accessToken,
        finalType as 'MARIMO' | 'CODE_SERVER'
      );
      if (!syncResult.success) {
        console.error('Failed to sync builtin app to workspace:', syncResult.error);
        return NextResponse.json(
          { error: `Failed to sync app source code: ${syncResult.error}` },
          { status: 500 }
        );
      }
      console.log('Workspace sync result:', syncResult.data);

      // Get the default warehouse for HTTP path
      const [defaultWarehouse] = await db
        .select()
        .from(organizationWarehouses)
        .where(
          and(
            eq(organizationWarehouses.organizationId, organizationId),
            eq(organizationWarehouses.isDefault, true)
          )
        )
        .limit(1);

      // Create the new deployment with environment variables
      const deployResult = await createDeployment(workspaceUrl, accessToken, appName, {
        source_code_path: sourceCodePath,
        mode: 'SNAPSHOT',
        env_vars: [
          {
            name: 'BACKUP_VOLUME_PATH',
            value: finalVolumePath,
          },
          {
            name: 'FIREFLY_DATABRICKS_CLIENT_SECRET',
            value_from: 'firefly_spn_secret',
          },
          {
            name: 'FIREFLY_DATABRICKS_CLIENT_ID',
            value: spnRecord.clientId,
          },
          {
            name: 'FIREFLY_DATABRICKS_TOKEN',
            value_from: 'firefly_spn_pat',
          },
          ...(defaultWarehouse ? [{
            name: 'DATABRICKS_HTTP_PATH',
            value: `/sql/1.0/warehouses/${defaultWarehouse.warehouseId}`,
          }] : []),
        ],
      });

      if (!deployResult.success) {
        console.error('Redeploy failed:', deployResult.error);
        return NextResponse.json({ error: deployResult.error }, { status: 500 });
      }

      const deployment = deployResult.data;
      console.log('Redeployment created:', deployment.deployment_id);

      // Poll for deployment completion (max 60 seconds)
      const maxWaitTime = 60000; // 60 seconds
      const pollInterval = 2000; // 2 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const statusResult = await getDeployment(
          workspaceUrl,
          accessToken,
          appName,
          deployment.deployment_id
        );

        if (!statusResult.success) {
          console.error('Error checking deployment status:', statusResult.error);
          break;
        }

        const deploymentStatus = statusResult.data.status?.state;

        if (deploymentStatus === 'SUCCEEDED') {
          // Deployment succeeded - refresh app status
          const appResult = await getApp(workspaceUrl, accessToken, appName);
          if (appResult.success) {
            const app = appResult.data;
            const appStatus = app.compute_status?.state || app.app_status?.state || 'RUNNING';

            await db
              .update(authoringTool)
              .set({
                appStatus: appStatus,
                appUrl: app.url || tool.appUrl,
                updatedAt: new Date(),
              })
              .where(eq(authoringTool.id, id));
          }

          revalidateTag(AUTHORING_TOOLS_CACHE_TAG);
          return NextResponse.json({
            success: true,
            deployment: statusResult.data,
            message: 'Redeployment completed successfully',
          });
        }

        if (deploymentStatus === 'FAILED') {
          return NextResponse.json(
            {
              error: `Redeployment failed: ${statusResult.data.status?.message || 'Unknown error'}`,
            },
            { status: 500 }
          );
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      // Timeout - return current status
      revalidateTag(AUTHORING_TOOLS_CACHE_TAG);
      return NextResponse.json({
        success: true,
        deployment,
        message: 'Redeployment started but not yet complete. Check status in a moment.',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error performing action on authoring tool:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update authoring tool settings (only when stopped)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
    const { type, volumePath } = body as {
      type?: 'MARIMO' | 'CODE_SERVER';
      volumePath?: string | null;
    };

    // Get the authoring tool
    const [tool] = await db
      .select()
      .from(authoringTool)
      .where(
        and(
          eq(authoringTool.id, id),
          eq(authoringTool.organizationId, organizationId),
          eq(authoringTool.createdByUserId, session.user.id)
        )
      )
      .limit(1);

    if (!tool) {
      return NextResponse.json({ error: 'Authoring tool not found' }, { status: 404 });
    }

    // Only allow editing when stopped
    if (tool.status !== 'STOPPED') {
      return NextResponse.json(
        { error: 'Can only edit settings when the environment is stopped' },
        { status: 400 }
      );
    }

    // Validate type if provided
    if (type && !['MARIMO', 'CODE_SERVER'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be MARIMO or CODE_SERVER' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (type !== undefined) {
      updateData.type = type;
    }

    if (volumePath !== undefined) {
      updateData.volumePath = volumePath;
    }

    // Update the tool
    await db
      .update(authoringTool)
      .set(updateData)
      .where(eq(authoringTool.id, id));

    revalidateTag(AUTHORING_TOOLS_CACHE_TAG);

    return NextResponse.json({
      success: true,
      authoringTool: {
        ...tool,
        ...updateData,
      },
    });
  } catch (error) {
    console.error('Error updating authoring tool:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete an authoring tool (soft delete + delete Databricks app)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Get the authoring tool
    const [tool] = await db
      .select()
      .from(authoringTool)
      .where(
        and(
          eq(authoringTool.id, id),
          eq(authoringTool.organizationId, organizationId),
          eq(authoringTool.createdByUserId, session.user.id)
        )
      )
      .limit(1);

    if (!tool) {
      return NextResponse.json({ error: 'Authoring tool not found' }, { status: 404 });
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

    const workspaceUrl = org.workspaceUrl.replace(/\/$/, '');

    // If there's an app, try to delete it
    if (tool.appName) {
      const tokenResult = await getGlobalAdminToken(workspaceUrl);
      if (tokenResult.success) {
        const deleteResult = await deleteApp(workspaceUrl, tokenResult.accessToken, tool.appName);
        if (!deleteResult.success) {
          console.warn('Failed to delete Databricks app:', deleteResult.error);
          // Continue with soft delete even if app deletion fails
        }
      }
    }

    // Soft delete the authoring tool
    await db
      .update(authoringTool)
      .set({
        deletedAt: new Date(),
        status: 'DELETING',
        updatedAt: new Date(),
      })
      .where(eq(authoringTool.id, id));

    revalidateTag(AUTHORING_TOOLS_CACHE_TAG);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting authoring tool:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
