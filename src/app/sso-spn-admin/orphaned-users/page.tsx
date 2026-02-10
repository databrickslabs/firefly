"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserX, Mail, Calendar, Users, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  useOrphanedUsers,
  useOrganizations,
  useBulkAddMembers,
} from "@/hooks/use-admin-api";

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
}

export default function OrphanedUsersPage() {
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("member");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(25);

  // Queries and Mutations
  const { data: users = [], isLoading, error } = useOrphanedUsers();
  const { data: organizations = [] } = useOrganizations();
  const bulkAdd = useBulkAddMembers();

  // Set default organization when data loads
  if (organizations.length > 0 && !selectedOrg) {
    setSelectedOrg(organizations[0].id);
  }

  const filteredData = useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(query) ||
        user.name?.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const toggleUserSelection = useMemo(
    () => (userId: string) => {
      const newSelected = new Set(selectedUsers);
      if (newSelected.has(userId)) {
        newSelected.delete(userId);
      } else {
        newSelected.add(userId);
      }
      setSelectedUsers(newSelected);
    },
    [selectedUsers]
  );

  const toggleSelectAll = useMemo(
    () => () => {
      if (selectedUsers.size === filteredData.length && filteredData.length > 0) {
        setSelectedUsers(new Set());
      } else {
        setSelectedUsers(new Set(filteredData.map((u) => u.id)));
      }
    },
    [selectedUsers, filteredData]
  );

  const handleAssignUsers = async () => {
    if (selectedUsers.size === 0) {
      alert("Please select at least one user");
      return;
    }

    if (!selectedOrg) {
      alert("Please select an organization");
      return;
    }

    await bulkAdd.mutateAsync({
      userIds: Array.from(selectedUsers),
      organizationId: selectedOrg,
      role: selectedRole,
    });

    setSelectedUsers(new Set());
  };

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <Checkbox
            checked={
              selectedUsers.size === filteredData.length &&
              filteredData.length > 0
            }
            onCheckedChange={toggleSelectAll}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedUsers.has(row.original.id)}
            onCheckedChange={() => toggleUserSelection(row.original.id)}
          />
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{row.original.email}</span>
          </div>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) =>
          row.original.name ? (
            <span className="text-muted-foreground">{row.original.name}</span>
          ) : (
            <span className="text-muted-foreground italic">-</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span className="text-sm">
              {new Date(row.original.createdAt).toLocaleDateString()}
            </span>
          </div>
        ),
      },
    ],
    [selectedUsers, filteredData.length, toggleUserSelection, toggleSelectAll]
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
          <p className="text-muted-foreground">Loading orphaned users...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-800 dark:text-red-200">
            {error instanceof Error
              ? error.message
              : "Failed to load orphaned users"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <UserX className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          Orphaned Users
        </h2>
        <p className="text-muted-foreground mt-1">
          Users without any organization membership ({users.length} total)
        </p>
      </div>

      {users.length > 0 && (
        <>
          {/* Bulk Assignment Section */}
          <div className="p-6 border rounded-xl bg-accent/20">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Assign Selected Users ({selectedUsers.size})
            </h3>
            <div className="flex gap-3">
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                      {org.slug && (
                        <span className="text-xs text-muted-foreground ml-1">
                          @{org.slug}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedRole} onValueChange={setSelectedRole}>
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
                onClick={handleAssignUsers}
                disabled={
                  selectedUsers.size === 0 || !selectedOrg || bulkAdd.isPending
                }
              >
                {bulkAdd.isPending
                  ? "Assigning..."
                  : `Assign ${selectedUsers.size} User${selectedUsers.size !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>

          {/* Search and Controls */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Rows per page:
              </span>
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

          {/* Users Table */}
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
                          ? "No users match your search"
                          : "No orphaned users found"}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {table.getState().pagination.pageIndex * pageSize + 1}{" "}
                to{" "}
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * pageSize,
                  filteredData.length
                )}{" "}
                of {filteredData.length} users
                {selectedUsers.size > 0 && (
                  <span className="ml-2 font-medium text-primary">
                    ({selectedUsers.size} selected)
                  </span>
                )}
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
        </>
      )}

      {users.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <UserX className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="font-medium text-lg">No orphaned users found</p>
          <p className="text-sm text-muted-foreground mt-1">
            All users are assigned to organizations
          </p>
        </div>
      )}
    </div>
  );
}
