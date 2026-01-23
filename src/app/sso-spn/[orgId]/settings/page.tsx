"use client";

import { useParams } from "next/navigation";
import { OrganizationSettingsPanel } from "@/components/organization-settings-panel";

export default function OrganizationOverviewPage() {
  const params = useParams();
  const orgId = params.orgId as string;

  return (
    <OrganizationSettingsPanel
      orgId={orgId}
      accentColor="emerald"
    />
  );
}
