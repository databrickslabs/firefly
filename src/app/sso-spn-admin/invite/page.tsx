"use client";

import { UserAssignmentForm } from "@/components/admin/user-assignment-form";
import { UserPlus } from "lucide-react";

export default function InviteUsersPage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <UserPlus className="h-6 w-6" />
          Invite Users to Organizations
        </h2>
        <p className="text-muted-foreground mt-1">
          Send invitations to users to join organizations with specific roles
        </p>
      </div>

      <div className="max-w-2xl">
        <UserAssignmentForm />
      </div>
    </div>
  );
}
