"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Users,
  Search,
  Pencil,
  ExternalLink,
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  useOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
} from "@/hooks/use-admin-api";

interface Organization {
  id: string;
  name: string;
  slug: string | null;
  workspaceUrl: string | null;
  createdAt: Date;
  members?: Member[];
}

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

export default function OrganizationsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newOrgWorkspaceUrl, setNewOrgWorkspaceUrl] = useState("");
  const [editOrgName, setEditOrgName] = useState("");
  const [editOrgSlug, setEditOrgSlug] = useState("");
  const [editOrgWorkspaceUrl, setEditOrgWorkspaceUrl] = useState("");

  // Queries and Mutations
  const { data: organizations = [], isLoading, error } = useOrganizations();
  const createOrg = useCreateOrganization();
  const updateOrg = useUpdateOrganization();

  const columns = useMemo<ColumnDef<Organization>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Organization Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: "slug",
        header: "Slug",
        cell: ({ row }) =>
          row.original.slug ? (
            <span className="text-muted-foreground">@{row.original.slug}</span>
          ) : (
            <span className="text-muted-foreground italic">-</span>
          ),
      },
      {
        accessorKey: "workspaceUrl",
        header: "Workspace URL",
        cell: ({ row }) =>
          row.original.workspaceUrl ? (
            <a
              href={row.original.workspaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              {row.original.workspaceUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-muted-foreground italic">-</span>
          ),
      },
      {
        accessorKey: "members",
        header: "Members",
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{row.original.members?.length || 0}</span>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingOrg(row.original);
                setEditOrgName(row.original.name);
                setEditOrgSlug(row.original.slug || "");
                setEditOrgWorkspaceUrl(row.original.workspaceUrl || "");
                setShowEditDialog(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (row.original.slug) {
                  router.push(`/admin/organizations/${row.original.slug}`);
                }
              }}
              disabled={!row.original.slug}
            >
              <Users className="h-4 w-4 mr-2" />
              Manage Members
            </Button>
          </div>
        ),
      },
    ],
    [router]
  );

  const filteredData = useMemo(() => {
    if (!searchQuery) return organizations;
    const query = searchQuery.toLowerCase();
    return organizations.filter(
      (org) =>
        org.name.toLowerCase().includes(query) ||
        org.slug?.toLowerCase().includes(query) ||
        org.workspaceUrl?.toLowerCase().includes(query)
    );
  }, [organizations, searchQuery]);

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

  const handleCreateOrg = async () => {
    if (!newOrgName) return;

    await createOrg.mutateAsync({
      name: newOrgName,
      slug: newOrgSlug || undefined,
      workspaceUrl: newOrgWorkspaceUrl || undefined,
    });

    setNewOrgName("");
    setNewOrgSlug("");
    setNewOrgWorkspaceUrl("");
    setShowCreateDialog(false);
  };

  const handleUpdateOrg = async () => {
    if (!editingOrg || !editOrgName) return;

    await updateOrg.mutateAsync({
      organizationId: editingOrg.id,
      name: editOrgName,
      slug: editOrgSlug || undefined,
      workspaceUrl: editOrgWorkspaceUrl || undefined,
    });

    setEditingOrg(null);
    setEditOrgName("");
    setEditOrgSlug("");
    setEditOrgWorkspaceUrl("");
    setShowEditDialog(false);
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading organizations...</p>
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
              : "Failed to load organizations"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Organizations
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage organizations and their members
          </p>
        </div>

        {/* Create Organization Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Organization</DialogTitle>
              <DialogDescription>
                Add a new organization to manage users and workspaces
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">
                  Organization Name *
                </label>
                <Input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Slug (optional)</label>
                <Input
                  type="text"
                  value={newOrgSlug}
                  onChange={(e) => setNewOrgSlug(e.target.value)}
                  placeholder="acme-corp"
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  Workspace URL (optional)
                </label>
                <Input
                  type="url"
                  value={newOrgWorkspaceUrl}
                  onChange={(e) => setNewOrgWorkspaceUrl(e.target.value)}
                  placeholder="https://acme.databricks.com"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                disabled={createOrg.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateOrg}
                disabled={!newOrgName || createOrg.isPending}
              >
                {createOrg.isPending ? "Creating..." : "Create Organization"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Controls */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
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

      {/* Table */}
      {organizations.length > 0 ? (
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
                        ? "No organizations match your search"
                        : "No organizations found"}
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
              of {filteredData.length} organizations
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
          <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="font-medium text-lg">No organizations found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first organization to get started
          </p>
        </div>
      )}

      {/* Edit Organization Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update organization details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">
                Organization Name *
              </label>
              <Input
                type="text"
                value={editOrgName}
                onChange={(e) => setEditOrgName(e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Slug (optional)</label>
              <Input
                type="text"
                value={editOrgSlug}
                onChange={(e) => setEditOrgSlug(e.target.value)}
                placeholder="acme-corp"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Workspace URL (optional)
              </label>
              <Input
                type="url"
                value={editOrgWorkspaceUrl}
                onChange={(e) => setEditOrgWorkspaceUrl(e.target.value)}
                placeholder="https://acme.databricks.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={updateOrg.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateOrg}
              disabled={!editOrgName || updateOrg.isPending}
            >
              {updateOrg.isPending ? "Updating..." : "Update Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
