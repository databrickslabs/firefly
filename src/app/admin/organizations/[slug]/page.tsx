"use client";

import { useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Building2,
  Users,
  Trash2,
  Shield,
  UserPlus,
  Search,
  ChevronLeft,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import { UserSearch } from "@/components/admin/user-search";
import {
  useOrganizations,
  useAddMember,
  useRemoveMember,
  useUpdateMemberRole,
} from "@/hooks/use-admin-api";

interface Member {
  id: string;
  userId: string;
  role: string;
  createdAt: Date;
  user?: {
    email: string;
    name: string | null;
  };
}

export default function OrganizationMembersPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [selectedRoleForAdd, setSelectedRoleForAdd] = useState("member");
  const [memberToRemove, setMemberToRemove] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Queries and Mutations
  const { data: organizations = [], isLoading, error } = useOrganizations();
  const addMember = useAddMember();
  const removeMember = useRemoveMember();
  const updateRole = useUpdateMemberRole();

  // Find the organization by slug and memoize members
  const organization = organizations.find((org) => org.slug === slug);
  const members = useMemo(
    () => organization?.members || [],
    [organization?.members]
  );

  const handleAddUser = (userId: string) => {
    if (!organization) return;
    addMember.mutate({
      organizationId: organization.id,
      userId,
      role: selectedRoleForAdd,
    });
  };

  const handleRemoveUser = () => {
    if (!memberToRemove) return;
    removeMember.mutate({ memberId: memberToRemove.id });
    setMemberToRemove(null);
  };

  const handleChangeRole = useMemo(
    () => (memberId: string, newRole: string) => {
      updateRole.mutate({ memberId, role: newRole });
    },
    [updateRole]
  );

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case "owner":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "admin":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "member":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const filteredData = useMemo(() => {
    if (!searchQuery) return members;
    const query = searchQuery.toLowerCase();
    return members.filter(
      (member) =>
        member.user?.email.toLowerCase().includes(query) ||
        member.user?.name?.toLowerCase().includes(query) ||
        member.role.toLowerCase().includes(query)
    );
  }, [members, searchQuery]);

  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      {
        accessorKey: "user.email",
        header: "Email",
        cell: ({ row }) => (
          <div className="font-medium">
            {row.original.user?.email || row.original.userId}
          </div>
        ),
      },
      {
        accessorKey: "user.name",
        header: "Name",
        cell: ({ row }) =>
          row.original.user?.name ? (
            <span className="text-muted-foreground">
              {row.original.user.name}
            </span>
          ) : (
            <span className="text-muted-foreground italic">-</span>
          ),
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 w-fit ${getRoleBadgeColor(row.original.role)}`}
          >
            <Shield className="h-3 w-3" />
            {row.original.role}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Added",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Select
              value={row.original.role}
              onValueChange={(newRole) =>
                handleChangeRole(row.original.id, newRole)
              }
              disabled={updateRole.isPending}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setMemberToRemove({
                  id: row.original.id,
                  name: row.original.user?.email || row.original.userId,
                })
              }
              disabled={removeMember.isPending}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [updateRole.isPending, removeMember.isPending, handleChangeRole]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: { pageSize: 25 },
    },
  });

  // Update page size when changed
  useMemo(() => {
    table.setPageSize(pageSize);
  }, [pageSize, table]);

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading organization...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-800 dark:text-red-200">
            {error instanceof Error ? error.message : "Failed to load organization"}
          </p>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="p-8">
        <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-400 dark:border-yellow-800 rounded-md">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Organization not found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Breadcrumb and Header */}
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => router.push("/admin/organizations")}
          className="px-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Organizations
        </Button>

        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            {organization.name}
          </h2>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
            {organization.slug && <span>@{organization.slug}</span>}
            {organization.workspaceUrl && (
              <span className="font-mono">{organization.workspaceUrl}</span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {members.length} members
            </span>
          </div>
        </div>
      </div>

      {/* Add User Section */}
      <div className="p-6 border rounded-xl bg-accent/20">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Add User to Organization
        </h3>
        <div className="flex gap-3">
          <div className="flex-1 max-w-md">
            <UserSearch
              onSelect={handleAddUser}
              placeholder="Search and add users..."
              selectedUsers={members.map((m) => m.userId)}
            />
          </div>
          <Select
            value={selectedRoleForAdd}
            onValueChange={setSelectedRoleForAdd}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search and Controls */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => setPageSize(Number(value))}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="75">75</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Members Table */}
      {members.length > 0 ? (
        <div className="border rounded-lg bg-white dark:bg-slate-900">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    <div className="text-muted-foreground">
                      {searchQuery
                        ? "No members match your search"
                        : "No members found"}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-4 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {table.getState().pagination.pageIndex * pageSize + 1} to{" "}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * pageSize,
                filteredData.length
              )}{" "}
              of {filteredData.length} members
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <div className="text-sm">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="font-medium text-lg">No members yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add users to this organization using the form above
          </p>
        </div>
      )}

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold">{memberToRemove?.name}</span> from
              this organization? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMember.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              disabled={removeMember.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {removeMember.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
