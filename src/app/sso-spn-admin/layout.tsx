import { SsoSpnAdminLayout } from "@/components/sso-spn-admin/sso-spn-admin-layout";
import { ReactNode } from "react";

export default function SsoSpnAdminLayoutWrapper({
  children,
}: {
  children: ReactNode;
}) {
  return <SsoSpnAdminLayout>{children}</SsoSpnAdminLayout>;
}
