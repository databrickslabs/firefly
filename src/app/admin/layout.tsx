import { AdminLayout } from "@/components/admin/admin-layout";
import { ReactNode } from "react";

export default function AdminLayoutWrapper({
  children,
}: {
  children: ReactNode;
}) {
  return <AdminLayout>{children}</AdminLayout>;
}
