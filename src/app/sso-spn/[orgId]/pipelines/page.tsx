"use client";

import { PipelinesListView } from "@/components/pipelines";
import { useActiveOrganizationId } from "@/providers/user-store-provider";

export default function PipelinesPage() {
  const orgId = useActiveOrganizationId();
  const basePath = `/sso-spn/${orgId}`;

  return <PipelinesListView basePath={basePath} />;
}
