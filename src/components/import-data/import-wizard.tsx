"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import {
  FileSpreadsheet,
  FileJson,
  FileBox,
  FileText,
  Upload,
  Settings,
  Eye,
  Database,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CompactWarehouseSelector } from "@/components/pipeline-studio/compact-warehouse-selector";
import { toast } from "sonner";
import { loadWarehouse } from "@/lib/warehouse-storage";
import { useSession } from "@/lib/auth-client";

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: "select-type",
    title: "Select File Type",
    description: "Choose the type of file you want to import",
    icon: <FileSpreadsheet className="h-5 w-5" />,
  },
  {
    id: "upload",
    title: "Upload File",
    description: "Select or drag and drop your file",
    icon: <Upload className="h-5 w-5" />,
  },
  {
    id: "warehouse",
    title: "Select Warehouse",
    description: "Choose a SQL warehouse to run queries",
    icon: <Database className="h-5 w-5" />,
  },
  {
    id: "preview",
    title: "Preview",
    description: "Review your data before importing",
    icon: <Eye className="h-5 w-5" />,
  },
  {
    id: "configure",
    title: "Configure & Destination",
    description: "Set import options and choose destination",
    icon: <Settings className="h-5 w-5" />,
  },
  {
    id: "confirm",
    title: "Confirm",
    description: "Review and execute the import",
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
];

const FILE_TYPES = [
  {
    value: "csv",
    label: "CSV",
    description: "Comma-separated values",
    icon: <FileSpreadsheet className="h-8 w-8 text-green-600" />,
    disabled: false,
  },
  {
    value: "json",
    label: "JSON",
    description: "JavaScript Object Notation",
    icon: <FileJson className="h-8 w-8 text-yellow-600" />,
    disabled: true,
  },
  {
    value: "parquet",
    label: "Parquet",
    description: "Apache Parquet format",
    icon: <FileBox className="h-8 w-8 text-purple-600" />,
    disabled: true,
  },
  {
    value: "xlsx",
    label: "Excel",
    description: "Microsoft Excel spreadsheet",
    icon: <FileSpreadsheet className="h-8 w-8 text-green-700" />,
    disabled: true,
  },
  {
    value: "txt",
    label: "Text",
    description: "Plain text file",
    icon: <FileText className="h-8 w-8 text-gray-600" />,
    disabled: true,
  },
];

interface StorageSettings {
  catalogName: string;
  schemaName: string;
}

interface SqlResult {
  columns: { name: string; type_name: string }[];
  rows: unknown[][];
  totalRows: number;
}

// Convert email to volume name (same logic as backend)
// Note: "@" is allowed in volume names
function emailToVolumeName(email: string): string {
  return email
    .replace(/\./g, "_")
    .replace(/\s/g, "_")
    .replace(/\//g, "_");
}

// Generate a simple hash from file content
function generateFileHash(content: ArrayBuffer): string {
  const bytes = new Uint8Array(content);
  let hash = 0;
  for (let i = 0; i < Math.min(bytes.length, 1000); i++) {
    hash = ((hash << 5) - hash + bytes[i]) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// Format date for path
function getDatePath(): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const time = now.toTimeString().split(" ")[0].replace(/:/g, "-"); // HH-MM-SS
  return `${date}/${time}`;
}

export function ImportWizard() {
  const router = useRouter();
  const params = useParams();
  const orgId = params.orgId as string;

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFileType, setSelectedFileType] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [fullVolumePath, setFullVolumePath] = useState<string | null>(null);

  // Configuration options
  const [hasHeader, setHasHeader] = useState(true);
  const [delimiter, setDelimiter] = useState(",");
  const [mode, setMode] = useState<"FAILFAST" | "PERMISSIVE" | "DROPMALFORMED">("FAILFAST");

  // Destination options
  const [catalog, setCatalog] = useState("");
  const [schema, setSchema] = useState("");
  const [tableName, setTableName] = useState("");

  // Column mapping state
  interface ColumnMapping {
    originalName: string;
    renamedName: string;
    enabled: boolean;
  }
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  // SQL result state
  const [previewData, setPreviewData] = useState<SqlResult | null>(null);
  const [isExecutingPreview, setIsExecutingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  // Copy state
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load warehouse from storage on mount
  useEffect(() => {
    const stored = loadWarehouse();
    if (stored) {
      setWarehouseId(stored.warehouseId);
    }
  }, []);

  // Initialize column mappings when preview data is loaded
  useEffect(() => {
    if (previewData?.columns) {
      setColumnMappings(
        previewData.columns.map((col) => {
          // Keep original name as-is, remove quotes and trim spaces from renamed name
          const cleanName = col.name.replace(/"/g, "").trim();
          return {
            originalName: col.name,
            renamedName: cleanName,
            enabled: true,
          };
        })
      );
    }
  }, [previewData]);

  // Fetch storage settings
  const { data: storageSettings } = useQuery<StorageSettings>({
    queryKey: ["storage-settings"],
    queryFn: async () => {
      const response = await fetch("/api/sso-spn/storage-settings/verify-group");
      if (!response.ok) {
        throw new Error("Failed to fetch storage settings");
      }
      const data = await response.json();
      return {
        catalogName: data.data?.storageSettings?.organizationEditableCatalog || "",
        schemaName: "uploads",
      };
    },
  });

  // Get user session for email
  const { data: session } = useSession();

  const userEmail = session?.user?.email || "";
  const userVolumeName = userEmail ? emailToVolumeName(userEmail) : "";

  // Fetch catalogs
  const { data: catalogsData } = useQuery({
    queryKey: ["catalogs"],
    queryFn: async () => {
      const response = await fetch("/api/databricks/unity-catalog/catalogs");
      if (!response.ok) {
        throw new Error("Failed to fetch catalogs");
      }
      const data = await response.json();
      return data.catalogs || [];
    },
  });

  // Fetch schemas based on selected catalog
  const { data: schemasData } = useQuery({
    queryKey: ["schemas", catalog],
    queryFn: async () => {
      const response = await fetch(`/api/databricks/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalog)}`);
      if (!response.ok) {
        throw new Error("Failed to fetch schemas");
      }
      const data = await response.json();
      return data.schemas || [];
    },
    enabled: !!catalog,
  });

  const catalogs = catalogsData || [];
  const schemas = schemasData || [];

  // Upload file mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const content = await file.arrayBuffer();
      const hash = generateFileHash(content);
      const datePath = getDatePath();
      const uploadPath = `${userVolumeName}/${datePath}/${hash}`;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", uploadPath);

      const response = await fetch("/api/sso-spn/files/file", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload file");
      }

      const result = await response.json();
      return {
        ...result,
        uploadPath,
        fullPath: `/Volumes/${storageSettings?.catalogName}/${storageSettings?.schemaName}/${uploadPath}/${file.name}`,
      };
    },
    onSuccess: (data) => {
      setUploadedFilePath(data.file.path);
      setFullVolumePath(data.fullPath);
      toast.success(`Uploaded "${selectedFile?.name}" successfully`);
      // Auto-advance to next step after successful upload
      setCurrentStep((prev) => prev + 1);
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  // Execute SQL for preview
  const executePreviewQuery = useCallback(async () => {
    if (!warehouseId || !fullVolumePath) return;

    setIsExecutingPreview(true);
    setPreviewError(null);
    setPreviewData(null);

    const delimiterValue = delimiter === "\\t" ? "\\t" : delimiter;
    const sql = `SELECT * FROM read_files(
  '${fullVolumePath}',
  format => 'csv',
  header => ${hasHeader},
  delimiter => '${delimiterValue}',
  mode => '${mode}'
) LIMIT 100`;

    try {
      // Execute the statement
      const executeResponse = await fetch("/api/databricks/sql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_id: warehouseId,
          statement: sql,
          wait_timeout: "30s",
          on_wait_timeout: "CONTINUE",
        }),
      });

      if (!executeResponse.ok) {
        const error = await executeResponse.json();
        throw new Error(error.error || "Failed to execute query");
      }

      let result = await executeResponse.json();

      // Poll for completion if needed
      while (result.status?.state === "PENDING" || result.status?.state === "RUNNING") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const statusResponse = await fetch(`/api/databricks/sql/status/${result.statement_id}`);
        if (!statusResponse.ok) {
          throw new Error("Failed to check query status");
        }
        result = await statusResponse.json();
      }

      if (result.status?.state === "FAILED") {
        throw new Error("Query execution failed");
      }

      if (result.status?.state === "SUCCEEDED") {
        const columns = result.manifest?.schema?.columns || [];
        const rows = result.result?.data_array || [];
        setPreviewData({
          columns: columns.map((c: { name: string; type_name: string }) => ({
            name: c.name,
            type_name: c.type_name,
          })),
          rows,
          totalRows: result.manifest?.total_row_count || rows.length,
        });
      }
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Failed to preview data");
    } finally {
      setIsExecutingPreview(false);
    }
  }, [warehouseId, fullVolumePath, hasHeader, delimiter, mode]);

  // Generate the final CREATE TABLE SQL
  const generateCreateTableSQL = useCallback(() => {
    if (!fullVolumePath || !catalog || !schema || !tableName) return "";

    const delimiterValue = delimiter === "\\t" ? "\\t" : delimiter;

    // Build column selection based on mappings
    const enabledColumns = columnMappings.filter((col) => col.enabled);
    let selectClause: string;

    if (enabledColumns.length === 0 || enabledColumns.length === columnMappings.length &&
        enabledColumns.every((col) => col.originalName === col.renamedName)) {
      // All columns selected with no renames - use SELECT *
      selectClause = "*";
    } else {
      // Build individual column selections with aliases
      selectClause = enabledColumns
        .map((col) => {
          if (col.originalName === col.renamedName) {
            return `\`${col.originalName}\``;
          }
          return `\`${col.originalName}\` AS \`${col.renamedName}\``;
        })
        .join(",\n  ");
    }

    return `CREATE OR REPLACE TABLE \`${catalog}\`.\`${schema}\`.\`${tableName}\` AS
SELECT ${selectClause}
FROM read_files(
  '${fullVolumePath}',
  format => 'csv',
  header => ${hasHeader},
  delimiter => '${delimiterValue}',
  mode => '${mode}'
)`;
  }, [fullVolumePath, catalog, schema, tableName, hasHeader, delimiter, mode, columnMappings]);

  // Execute the CREATE TABLE statement
  const executeImport = useCallback(async () => {
    if (!warehouseId) return;

    setIsImporting(true);
    setImportError(null);
    setImportSuccess(false);

    const sql = generateCreateTableSQL();

    try {
      const executeResponse = await fetch("/api/databricks/sql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_id: warehouseId,
          statement: sql,
          wait_timeout: "50s",
          on_wait_timeout: "CONTINUE",
        }),
      });

      if (!executeResponse.ok) {
        const error = await executeResponse.json();
        throw new Error(error.error || "Failed to execute import");
      }

      let result = await executeResponse.json();

      // Poll for completion if needed
      while (result.status?.state === "PENDING" || result.status?.state === "RUNNING") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusResponse = await fetch(`/api/databricks/sql/status/${result.statement_id}`);
        if (!statusResponse.ok) {
          throw new Error("Failed to check import status");
        }
        result = await statusResponse.json();
      }

      if (result.status?.state === "FAILED") {
        throw new Error("Import failed");
      }

      if (result.status?.state === "SUCCEEDED") {
        setImportSuccess(true);
        toast.success(`Table ${catalog}.${schema}.${tableName} created successfully!`);
        // Navigate to catalog page after short delay
        setTimeout(() => {
          router.push(`/sso-spn/${orgId}/catalog`);
        }, 1500);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to import data");
      toast.error(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsImporting(false);
    }
  }, [warehouseId, generateCreateTableSQL, catalog, schema, tableName, router, orgId]);

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 0: // Select file type
        return selectedFileType !== null;
      case 1: // Upload file - allow if file is selected (will auto-upload on Next)
        return selectedFile !== null && !uploadMutation.isPending;
      case 2: // Select warehouse
        return warehouseId !== null;
      case 3: // Preview
        return previewData !== null;
      case 4: // Configure & Destination
        return catalog && schema && tableName && columnMappings.some((c) => c.enabled);
      case 5: // Confirm
        return true;
      default:
        return false;
    }
  }, [currentStep, selectedFileType, selectedFile, uploadMutation.isPending, warehouseId, previewData, catalog, schema, tableName, columnMappings]);

  const handleNext = useCallback(async () => {
    if (currentStep >= WIZARD_STEPS.length - 1) return;

    // Step 1 -> 2: Auto-upload if file selected but not uploaded
    if (currentStep === 1 && selectedFile && !uploadedFilePath && storageSettings && userVolumeName) {
      uploadMutation.mutate(selectedFile);
      return; // Will advance to next step on upload success
    }

    // Step 2 -> 3: Auto-run preview when entering preview step
    if (currentStep === 2 && warehouseId && fullVolumePath) {
      setCurrentStep(currentStep + 1);
      // Auto-execute preview after a short delay to allow state to update
      setTimeout(() => {
        executePreviewQuery();
      }, 100);
      return;
    }

    setCurrentStep(currentStep + 1);
  }, [currentStep, selectedFile, uploadedFilePath, storageSettings, userVolumeName, uploadMutation, warehouseId, fullVolumePath, executePreviewQuery]);

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const copyToClipboard = useCallback(() => {
    const sql = generateCreateTableSQL();
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generateCreateTableSQL]);

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Select file type
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {FILE_TYPES.map((type) => (
              <Card
                key={type.value}
                className={cn(
                  "transition-all relative",
                  type.disabled
                    ? "opacity-60 cursor-not-allowed"
                    : "cursor-pointer hover:border-emerald-500",
                  selectedFileType === type.value &&
                    !type.disabled &&
                    "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                )}
                onClick={() => !type.disabled && setSelectedFileType(type.value)}
              >
                <CardContent className="flex flex-col items-center gap-3 p-6">
                  <div className={cn(type.disabled && "opacity-50")}>{type.icon}</div>
                  <div className="text-center">
                    <p className={cn("font-medium", type.disabled && "text-muted-foreground")}>
                      {type.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </div>
                  {type.disabled && (
                    <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                      Coming Soon
                    </span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        );

      case 1: // Upload file
        return (
          <div className="space-y-4">
            {userVolumeName && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p className="text-muted-foreground">
                  Files will be uploaded to:{" "}
                  <code className="text-emerald-600 font-mono">
                    /Volumes/{storageSettings?.catalogName}/{storageSettings?.schemaName}/
                    {userVolumeName}/...
                  </code>
                </p>
              </div>
            )}

            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
                isDragging
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                  : "border-muted-foreground/25",
                selectedFile && "border-emerald-500"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
            >
              {selectedFile ? (
                <div className="flex flex-col items-center gap-4">
                  <FileSpreadsheet className="h-16 w-16 text-emerald-600" />
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  {uploadedFilePath ? (
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                      <span>Uploaded successfully</span>
                    </div>
                  ) : uploadMutation.isPending ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Uploading...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedFile(null)}>
                        <X className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Click Next to upload and continue
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <Upload className="h-12 w-12 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Drag and drop your file here</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                  </div>
                  <label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                      accept={`.${selectedFileType}`}
                    />
                    <Button variant="outline" asChild>
                      <span>Browse Files</span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </div>
        );

      case 2: // Select warehouse
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SQL Warehouse</CardTitle>
                <CardDescription>
                  Select a SQL warehouse to run preview queries and create the table.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <CompactWarehouseSelector
                    className="min-w-[250px]"
                    onWarehouseChange={setWarehouseId}
                  />
                  {warehouseId && (
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm">Warehouse selected</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {fullVolumePath && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <p className="text-sm">
                    <span className="text-muted-foreground">File path: </span>
                    <code className="text-emerald-600 font-mono text-xs break-all">
                      {fullVolumePath}
                    </code>
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 3: // Preview
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Data Preview</p>
                <p className="text-xs text-muted-foreground">
                  Showing first 100 rows from {selectedFile?.name}
                </p>
              </div>
              {previewData && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={executePreviewQuery}
                  disabled={isExecutingPreview || !warehouseId}
                >
                  {isExecutingPreview ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </>
                  )}
                </Button>
              )}
            </div>

            {previewError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <p className="text-sm text-red-700 dark:text-red-400">{previewError}</p>
              </div>
            )}

            {previewData ? (
              <div className="border rounded-lg overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {previewData.columns.map((column, idx) => (
                        <TableHead key={idx} className="whitespace-nowrap">
                          <div>
                            <span>{column.name}</span>
                            <span className="block text-[10px] text-muted-foreground font-normal">
                              {column.type_name}
                            </span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.rows.map((row, rowIdx) => (
                      <TableRow key={rowIdx}>
                        {row.map((cell, cellIdx) => (
                          <TableCell key={cellIdx} className="whitespace-nowrap">
                            {cell === null ? (
                              <span className="text-muted-foreground italic">null</span>
                            ) : (
                              String(cell)
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : isExecutingPreview ? (
              <div className="flex flex-col items-center justify-center py-12 border rounded-lg bg-muted/30">
                <Loader2 className="h-12 w-12 text-muted-foreground/50 mb-4 animate-spin" />
                <p className="text-muted-foreground">Loading preview...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 border rounded-lg bg-muted/30">
                <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  Failed to load preview. Check your warehouse connection.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={executePreviewQuery}
                  disabled={!warehouseId}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            )}

            {previewData && (
              <p className="text-xs text-muted-foreground">
                Total rows: {previewData.totalRows.toLocaleString()}
              </p>
            )}
          </div>
        );

      case 4: // Configure & Destination
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">CSV Settings</CardTitle>
                <CardDescription>Adjust how the CSV file is parsed</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="delimiter">Delimiter</Label>
                    <Select value={delimiter} onValueChange={setDelimiter}>
                      <SelectTrigger id="delimiter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value=",">Comma (,)</SelectItem>
                        <SelectItem value=";">Semicolon (;)</SelectItem>
                        <SelectItem value="\t">Tab</SelectItem>
                        <SelectItem value="|">Pipe (|)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mode">Parse Mode</Label>
                    <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                      <SelectTrigger id="mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FAILFAST">Fail Fast (strict)</SelectItem>
                        <SelectItem value="PERMISSIVE">Permissive (lenient)</SelectItem>
                        <SelectItem value="DROPMALFORMED">Drop Malformed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasHeader"
                    checked={hasHeader}
                    onCheckedChange={(checked) => setHasHeader(checked === true)}
                  />
                  <Label htmlFor="hasHeader">First row contains column headers</Label>
                </div>
              </CardContent>
            </Card>

            {columnMappings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Column Mapping</CardTitle>
                  <CardDescription>Rename or exclude columns from import</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Include</TableHead>
                          <TableHead>Original Name</TableHead>
                          <TableHead>New Name</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {columnMappings.map((col, index) => (
                          <TableRow key={col.originalName} className={!col.enabled ? "opacity-50" : ""}>
                            <TableCell>
                              <Checkbox
                                checked={col.enabled}
                                onCheckedChange={(checked) => {
                                  setColumnMappings((prev) =>
                                    prev.map((c, i) =>
                                      i === index ? { ...c, enabled: checked === true } : c
                                    )
                                  );
                                }}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {col.originalName}
                            </TableCell>
                            <TableCell>
                              <Input
                                value={col.renamedName}
                                onChange={(e) => {
                                  setColumnMappings((prev) =>
                                    prev.map((c, i) =>
                                      i === index ? { ...c, renamedName: e.target.value } : c
                                    )
                                  );
                                }}
                                disabled={!col.enabled}
                                className="h-8 font-mono text-sm"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {columnMappings.filter((c) => c.enabled).length === 0 && (
                    <p className="text-sm text-destructive mt-2">
                      At least one column must be included
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Destination Table</CardTitle>
                <CardDescription>Choose where to save your data</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="catalog">Catalog</Label>
                    <Select value={catalog} onValueChange={setCatalog}>
                      <SelectTrigger id="catalog">
                        <SelectValue placeholder="Select catalog" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogs.map((cat: { name: string }) => (
                          <SelectItem key={cat.name} value={cat.name}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="schema">Schema</Label>
                    <Select value={schema} onValueChange={setSchema} disabled={!catalog}>
                      <SelectTrigger id="schema">
                        <SelectValue placeholder="Select schema" />
                      </SelectTrigger>
                      <SelectContent>
                        {schemas.map((sch: { name: string }) => (
                          <SelectItem key={sch.name} value={sch.name}>
                            {sch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tableName">Table Name</Label>
                    <Input
                      id="tableName"
                      placeholder="Enter table name"
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                    />
                  </div>
                </div>

                {catalog && schema && tableName && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Full table path: </span>
                      <code className="text-emerald-600 font-mono">
                        {catalog}.{schema}.{tableName}
                      </code>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {previewData && (
              <Button
                variant="outline"
                size="sm"
                onClick={executePreviewQuery}
                disabled={isExecutingPreview}
              >
                {isExecutingPreview ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                Re-run Preview with New Settings
              </Button>
            )}
          </div>
        );

      case 5: // Confirm
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Source File</p>
                    <p className="font-medium">{selectedFile?.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">File Type</p>
                    <p className="font-medium">{selectedFileType?.toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Delimiter</p>
                    <p className="font-medium">
                      {delimiter === "," ? "Comma" : delimiter === ";" ? "Semicolon" : delimiter === "\t" ? "Tab" : delimiter}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Has Header</p>
                    <p className="font-medium">{hasHeader ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Parse Mode</p>
                    <p className="font-medium">{mode}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Columns</p>
                    <p className="font-medium">{previewData?.columns.length || "-"}</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-muted-foreground text-sm">Destination Table</p>
                  <p className="font-mono text-emerald-600">
                    {catalog}.{schema}.{tableName}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">SQL Statement</CardTitle>
                <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-auto text-sm font-mono">
                  {generateCreateTableSQL()}
                </pre>
              </CardContent>
            </Card>

            {importError && (
              <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <p className="text-sm text-red-700 dark:text-red-400">{importError}</p>
              </div>
            )}

            {importSuccess && (
              <div className="flex items-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Table created successfully! You can now query{" "}
                  <code className="font-mono">
                    {catalog}.{schema}.{tableName}
                  </code>
                </p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Progress Steps */}
      <div className="flex items-center justify-between px-6 py-4 border-b overflow-x-auto">
        {WIZARD_STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                index === currentStep
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100"
                  : index < currentStep
                    ? "text-emerald-600"
                    : "text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium",
                  index === currentStep
                    ? "bg-emerald-600 text-white"
                    : index < currentStep
                      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50"
                      : "bg-muted"
                )}
              >
                {index < currentStep ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium">{step.title}</p>
              </div>
            </div>
            {index < WIZARD_STEPS.length - 1 && (
              <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">{WIZARD_STEPS[currentStep].title}</h2>
          <p className="text-muted-foreground">{WIZARD_STEPS[currentStep].description}</p>
        </div>
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 py-4 border-t">
        <Button variant="outline" onClick={handleBack} disabled={currentStep === 0}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {currentStep === WIZARD_STEPS.length - 1 ? (
          <Button
            onClick={executeImport}
            disabled={!canProceed() || isImporting || importSuccess}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Table...
              </>
            ) : importSuccess ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Table Created
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Create Table
              </>
            )}
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={!canProceed()}>
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
