"use client";

import { useState, useCallback } from "react";
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
    id: "configure",
    title: "Configure",
    description: "Set import options and column mappings",
    icon: <Settings className="h-5 w-5" />,
  },
  {
    id: "preview",
    title: "Preview",
    description: "Review your data before importing",
    icon: <Eye className="h-5 w-5" />,
  },
  {
    id: "destination",
    title: "Destination",
    description: "Choose where to save your data",
    icon: <Database className="h-5 w-5" />,
  },
  {
    id: "confirm",
    title: "Confirm",
    description: "Review and start the import",
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
];

const FILE_TYPES = [
  {
    value: "csv",
    label: "CSV",
    description: "Comma-separated values",
    icon: <FileSpreadsheet className="h-8 w-8 text-green-600" />,
  },
  {
    value: "json",
    label: "JSON",
    description: "JavaScript Object Notation",
    icon: <FileJson className="h-8 w-8 text-yellow-600" />,
  },
  {
    value: "parquet",
    label: "Parquet",
    description: "Apache Parquet format",
    icon: <FileBox className="h-8 w-8 text-purple-600" />,
  },
  {
    value: "xlsx",
    label: "Excel",
    description: "Microsoft Excel spreadsheet",
    icon: <FileSpreadsheet className="h-8 w-8 text-green-700" />,
  },
  {
    value: "txt",
    label: "Text",
    description: "Plain text file",
    icon: <FileText className="h-8 w-8 text-gray-600" />,
  },
];

// Stub preview data
const STUB_PREVIEW_DATA = [
  { id: 1, name: "John Doe", email: "john@example.com", age: 28, city: "New York" },
  { id: 2, name: "Jane Smith", email: "jane@example.com", age: 34, city: "Los Angeles" },
  { id: 3, name: "Bob Johnson", email: "bob@example.com", age: 45, city: "Chicago" },
  { id: 4, name: "Alice Brown", email: "alice@example.com", age: 29, city: "Houston" },
  { id: 5, name: "Charlie Wilson", email: "charlie@example.com", age: 52, city: "Phoenix" },
];

const STUB_COLUMNS = ["id", "name", "email", "age", "city"];

export function ImportWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFileType, setSelectedFileType] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Configuration options
  const [hasHeader, setHasHeader] = useState(true);
  const [delimiter, setDelimiter] = useState(",");
  const [encoding, setEncoding] = useState("utf-8");

  // Destination options
  const [catalog, setCatalog] = useState("");
  const [schema, setSchema] = useState("");
  const [tableName, setTableName] = useState("");

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 0:
        return selectedFileType !== null;
      case 1:
        return selectedFile !== null;
      case 2:
        return true; // Configuration is optional
      case 3:
        return true; // Preview is informational
      case 4:
        return catalog && schema && tableName;
      case 5:
        return true;
      default:
        return false;
    }
  }, [currentStep, selectedFileType, selectedFile, catalog, schema, tableName]);

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleImport = () => {
    // Stub implementation - would trigger actual import
    console.log("Starting import...", {
      fileType: selectedFileType,
      file: selectedFile?.name,
      hasHeader,
      delimiter,
      encoding,
      destination: { catalog, schema, tableName },
    });
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

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {FILE_TYPES.map((type) => (
              <Card
                key={type.value}
                className={cn(
                  "cursor-pointer transition-all hover:border-emerald-500",
                  selectedFileType === type.value && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                )}
                onClick={() => setSelectedFileType(type.value)}
              >
                <CardContent className="flex flex-col items-center gap-3 p-6">
                  {type.icon}
                  <div className="text-center">
                    <p className="font-medium">{type.label}</p>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );

      case 1:
        return (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
              isDragging ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-muted-foreground/25",
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Remove
                </Button>
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
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
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
                <Label htmlFor="encoding">Encoding</Label>
                <Select value={encoding} onValueChange={setEncoding}>
                  <SelectTrigger id="encoding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utf-8">UTF-8</SelectItem>
                    <SelectItem value="utf-16">UTF-16</SelectItem>
                    <SelectItem value="ascii">ASCII</SelectItem>
                    <SelectItem value="iso-8859-1">ISO-8859-1</SelectItem>
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

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Column Configuration</CardTitle>
                <CardDescription>Configure data types for each column</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Column Name</TableHead>
                      <TableHead>Data Type</TableHead>
                      <TableHead>Nullable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {STUB_COLUMNS.map((column) => (
                      <TableRow key={column}>
                        <TableCell className="font-medium">{column}</TableCell>
                        <TableCell>
                          <Select defaultValue="string">
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="string">String</SelectItem>
                              <SelectItem value="integer">Integer</SelectItem>
                              <SelectItem value="double">Double</SelectItem>
                              <SelectItem value="boolean">Boolean</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                              <SelectItem value="timestamp">Timestamp</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Checkbox defaultChecked />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing first 5 rows of {selectedFile?.name || "your file"}
              </p>
              <p className="text-sm text-muted-foreground">
                Total rows: ~1,000
              </p>
            </div>
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {STUB_COLUMNS.map((column) => (
                      <TableHead key={column}>{column}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {STUB_PREVIEW_DATA.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.id}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.age}</TableCell>
                      <TableCell>{row.city}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="catalog">Catalog</Label>
                <Select value={catalog} onValueChange={setCatalog}>
                  <SelectTrigger id="catalog">
                    <SelectValue placeholder="Select catalog" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="firefly_catalog">firefly_catalog</SelectItem>
                    <SelectItem value="main">main</SelectItem>
                    <SelectItem value="hive_metastore">hive_metastore</SelectItem>
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
                    <SelectItem value="uploads">uploads</SelectItem>
                    <SelectItem value="default">default</SelectItem>
                    <SelectItem value="staging">staging</SelectItem>
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
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Full table path: </span>
                    <code className="text-emerald-600 font-mono">
                      {catalog}.{schema}.{tableName}
                    </code>
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">File Type</p>
                    <p className="font-medium">{selectedFileType?.toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">File Name</p>
                    <p className="font-medium">{selectedFile?.name || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Delimiter</p>
                    <p className="font-medium">{delimiter === "," ? "Comma" : delimiter}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Encoding</p>
                    <p className="font-medium">{encoding.toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Has Header</p>
                    <p className="font-medium">{hasHeader ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Columns</p>
                    <p className="font-medium">{STUB_COLUMNS.length}</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-muted-foreground text-sm">Destination</p>
                  <p className="font-mono text-emerald-600">
                    {catalog}.{schema}.{tableName}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Ready to import. Click &quot;Start Import&quot; to begin.
              </p>
            </div>
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
                {index < currentStep ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  index + 1
                )}
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
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {currentStep === WIZARD_STEPS.length - 1 ? (
          <Button onClick={handleImport} disabled={!canProceed()}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Start Import
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
