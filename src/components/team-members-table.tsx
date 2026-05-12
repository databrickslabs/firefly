"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isCurrentUser?: boolean;
}

interface TeamMembersTableProps {
  members: TeamMember[];
  currentUserRole: string | null;
  onUserClick: (userId: string, userName: string | null) => void;
  onRoleChange: (userId: string, newRole: string) => void;
  isUpdatingRole: boolean;
  updatingUserId: string | undefined;
  accentColor?: "emerald" | "purple";
  readOnly?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function getRoleBadgeClass(role: string) {
  switch (role) {
    case "owner":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "admin":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
  }
}

export function TeamMembersTable({
  members,
  currentUserRole,
  onUserClick,
  onRoleChange,
  isUpdatingRole,
  updatingUserId,
  accentColor = "emerald",
  readOnly = false,
}: TeamMembersTableProps) {
  const colorClasses = {
    currentUserBg: accentColor === "emerald" ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-purple-50 dark:bg-purple-950/20",
    currentUserAvatar: accentColor === "emerald" ? "bg-emerald-600" : "bg-purple-600",
    spinner: accentColor === "emerald" ? "text-emerald-600" : "text-purple-600",
  };
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const isOwnerOrAdmin = currentUserRole === "owner" || currentUserRole === "admin";
  const totalPages = Math.ceil(members.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentMembers = members.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handlePageSizeChange = (newSize: string) => {
    const size = parseInt(newSize, 10);
    setPageSize(size);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">User</TableHead>
            <TableHead className="w-[150px]">Role</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {currentMembers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                No members found.
              </TableCell>
            </TableRow>
          ) : (
            currentMembers.map((member) => (
              <TableRow
                key={member.id}
                className={`${readOnly ? "" : "cursor-pointer"} ${member.isCurrentUser ? colorClasses.currentUserBg : ""}`}
                onClick={() => { if (!readOnly) onUserClick(member.id, member.name); }}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
                        member.isCurrentUser ? colorClasses.currentUserAvatar : "bg-slate-600"
                      }`}
                    >
                      {member.name?.charAt(0) || member.email?.charAt(0) || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {member.name || "Unknown"}
                        {member.isCurrentUser && (
                          <span className="ml-2 text-xs text-muted-foreground">(You)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {isOwnerOrAdmin && !readOnly && !member.isCurrentUser && member.role !== "owner" ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={member.role}
                          onValueChange={(newRole) => onRoleChange(member.id, newRole)}
                          disabled={isUpdatingRole}
                        >
                          <SelectTrigger className="w-24 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${getRoleBadgeClass(member.role)}`}
                      >
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </span>
                    )}
                    {isUpdatingRole && updatingUserId === member.id && (
                      <Spinner className={`w-4 h-4 ${colorClasses.spinner}`} />
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination Controls */}
      {members.length > 0 && (
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page:</span>
            <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-16 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {startIndex + 1}-{Math.min(endIndex, members.length)} of {members.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                Page {currentPage} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => goToPage(totalPages)}
                disabled={currentPage >= totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
