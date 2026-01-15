"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, FolderTree, HardDrive, Lock } from "lucide-react";

export default function StorageSettingsPage() {
  return (
    <div className="p-8">
      <div className="max-w-4xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Storage</h1>
          <p className="text-muted-foreground">
            Manage Unity Catalog and storage configuration for your organization.
          </p>
        </div>

        {/* Unity Catalog */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-emerald-600" />
              Unity Catalog
            </CardTitle>
            <CardDescription>
              Unified governance for all data assets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FolderTree className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Catalog Configuration</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Configure metastores, catalogs, and schemas. Set up data lineage tracking and access controls.
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </div>
          </CardContent>
        </Card>

        {/* External Locations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-emerald-600" />
              External Locations
            </CardTitle>
            <CardDescription>
              Cloud storage paths for external data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <HardDrive className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">External Storage Management</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Register S3 buckets, ADLS containers, and GCS buckets for use with Unity Catalog.
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </div>
          </CardContent>
        </Card>

        {/* Volumes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-600" />
              Volumes
            </CardTitle>
            <CardDescription>
              Managed and external volumes for non-tabular data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Database className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Volume Configuration</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Create and manage volumes for storing files, images, ML models, and other non-tabular data.
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </div>
          </CardContent>
        </Card>

        {/* Storage Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-emerald-600" />
              Storage Credentials
            </CardTitle>
            <CardDescription>
              Credentials for accessing cloud storage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Credential Management</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Configure IAM roles, service principals, and other credentials for secure cloud storage access.
              </p>
              <p className="text-xs text-muted-foreground mt-4">Coming soon</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
