// Types for Import Data feature

export interface Volume {
  name: string;
  fullName: string;
  type: "MANAGED" | "EXTERNAL";
  owner: string;
  createdAt: Date;
  storageLocation?: string;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: Date;
  type?: string; // file extension
}

export type ViewMode = "icon" | "list";

export interface ImportWizardState {
  currentStep: number;
  fileType: string | null;
  selectedFile: File | null;
  columnConfig: Record<string, string>;
  destination: {
    catalog: string;
    schema: string;
    table: string;
  };
}

// Stub data for development
export const STUB_VOLUMES: Volume[] = [
  {
    name: "sri_tikkireddy_databricks_com",
    fullName: "firefly_catalog.uploads.sri_tikkireddy_databricks_com",
    type: "MANAGED",
    owner: "sri.tikkireddy@databricks.com",
    createdAt: new Date("2024-01-15"),
  },
  {
    name: "firefly_databricks_com",
    fullName: "firefly_catalog.uploads.firefly_databricks_com",
    type: "MANAGED",
    owner: "firefly@databricks.com",
    createdAt: new Date("2024-01-10"),
  },
  {
    name: "shared_uploads",
    fullName: "firefly_catalog.uploads.shared_uploads",
    type: "EXTERNAL",
    owner: "admin@databricks.com",
    createdAt: new Date("2024-01-05"),
    storageLocation: "s3://databricks-bucket/shared",
  },
  {
    name: "team_data",
    fullName: "firefly_catalog.uploads.team_data",
    type: "MANAGED",
    owner: "admin@databricks.com",
    createdAt: new Date("2024-02-01"),
  },
];

export const STUB_FILES: Record<string, FileItem[]> = {
  // Root of sri_tikkireddy_databricks_com volume
  "sri_tikkireddy_databricks_com": [
    {
      name: "sales_data",
      path: "sri_tikkireddy_databricks_com/sales_data",
      isDirectory: true,
      modifiedAt: new Date("2024-03-15"),
    },
    {
      name: "reports",
      path: "sri_tikkireddy_databricks_com/reports",
      isDirectory: true,
      modifiedAt: new Date("2024-03-10"),
    },
    {
      name: "customers.csv",
      path: "sri_tikkireddy_databricks_com/customers.csv",
      isDirectory: false,
      size: 1024000,
      modifiedAt: new Date("2024-03-18"),
      type: "csv",
    },
    {
      name: "config.json",
      path: "sri_tikkireddy_databricks_com/config.json",
      isDirectory: false,
      size: 2048,
      modifiedAt: new Date("2024-03-12"),
      type: "json",
    },
  ],
  // sales_data folder
  "sri_tikkireddy_databricks_com/sales_data": [
    {
      name: "q1_2024.csv",
      path: "sri_tikkireddy_databricks_com/sales_data/q1_2024.csv",
      isDirectory: false,
      size: 5120000,
      modifiedAt: new Date("2024-03-20"),
      type: "csv",
    },
    {
      name: "q2_2024.csv",
      path: "sri_tikkireddy_databricks_com/sales_data/q2_2024.csv",
      isDirectory: false,
      size: 4800000,
      modifiedAt: new Date("2024-03-21"),
      type: "csv",
    },
    {
      name: "analysis.parquet",
      path: "sri_tikkireddy_databricks_com/sales_data/analysis.parquet",
      isDirectory: false,
      size: 10240000,
      modifiedAt: new Date("2024-03-22"),
      type: "parquet",
    },
  ],
  // reports folder
  "sri_tikkireddy_databricks_com/reports": [
    {
      name: "monthly_summary.pdf",
      path: "sri_tikkireddy_databricks_com/reports/monthly_summary.pdf",
      isDirectory: false,
      size: 2048000,
      modifiedAt: new Date("2024-03-19"),
      type: "pdf",
    },
  ],
  // firefly_databricks_com volume
  "firefly_databricks_com": [
    {
      name: "uploads",
      path: "firefly_databricks_com/uploads",
      isDirectory: true,
      modifiedAt: new Date("2024-03-01"),
    },
    {
      name: "metadata.json",
      path: "firefly_databricks_com/metadata.json",
      isDirectory: false,
      size: 1024,
      modifiedAt: new Date("2024-03-05"),
      type: "json",
    },
  ],
  // shared_uploads volume
  "shared_uploads": [
    {
      name: "datasets",
      path: "shared_uploads/datasets",
      isDirectory: true,
      modifiedAt: new Date("2024-02-28"),
    },
    {
      name: "templates",
      path: "shared_uploads/templates",
      isDirectory: true,
      modifiedAt: new Date("2024-02-25"),
    },
  ],
  // team_data volume
  "team_data": [
    {
      name: "project_alpha",
      path: "team_data/project_alpha",
      isDirectory: true,
      modifiedAt: new Date("2024-03-10"),
    },
    {
      name: "shared_resources.xlsx",
      path: "team_data/shared_resources.xlsx",
      isDirectory: false,
      size: 512000,
      modifiedAt: new Date("2024-03-15"),
      type: "xlsx",
    },
  ],
};

// Supported file types for import
export const SUPPORTED_FILE_TYPES = [
  { value: "csv", label: "CSV", extension: ".csv", icon: "FileSpreadsheet" },
  { value: "json", label: "JSON", extension: ".json", icon: "FileJson" },
  { value: "parquet", label: "Parquet", extension: ".parquet", icon: "FileBox" },
  { value: "xlsx", label: "Excel", extension: ".xlsx", icon: "FileSpreadsheet" },
  { value: "txt", label: "Text", extension: ".txt", icon: "FileText" },
];

// Helper to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Helper to get file icon based on type
export function getFileIcon(type?: string): string {
  switch (type) {
    case "csv":
    case "xlsx":
      return "FileSpreadsheet";
    case "json":
      return "FileJson";
    case "parquet":
      return "FileBox";
    case "pdf":
      return "FileText";
    default:
      return "File";
  }
}
