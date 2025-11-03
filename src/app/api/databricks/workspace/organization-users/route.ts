import { NextRequest, NextResponse } from 'next/server';
import { getAuthInstance } from '@/lib/auth-dynamic';
import { headers } from 'next/headers';
import { unstable_cache } from 'next/cache';

export const ORG_USERS_CACHE_TAG = 'organization-users';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthInstance();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.session || !session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    const { db } = await import('@/db');
    const { user, member } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const getOrgUsers = unstable_cache(
      async () => {
        const orgUsers = await db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: member.role,
          })
          .from(member)
          .innerJoin(user, eq(member.userId, user.id))
          .where(eq(member.organizationId, organizationId));

        return orgUsers.filter((u) => u.id !== session.user.id);
      },
      [`org-users-${organizationId}`],
      {
        tags: [ORG_USERS_CACHE_TAG, `org-${organizationId}`],
        revalidate: false,
      }
    );

    const orgUsers = await getOrgUsers();
    return NextResponse.json({ users: orgUsers });
  } catch (error) {
    console.error('Error fetching organization users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
