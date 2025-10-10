// Notebook cell types and utilities

export type CellType = "code" | "markdown" | "raw";

export type CellExecutionState = "idle" | "pending" | "running" | "cancelling" | "cancelled" | "succeeded" | "failed";

export interface NotebookCell {
  id: string;
  type: CellType;
  source: string;
  outputs?: CellOutput[];
  executionState?: CellExecutionState;
  executionCount?: number | null;
  executionTime?: number;
  error?: string;
}

export interface CellOutput {
  output_type: "stream" | "display_data" | "execute_result" | "error";
  name?: string; // for stream outputs (stdout/stderr)
  text?: string | string[]; // for stream/text outputs
  data?: {
    "text/plain"?: string | string[];
    "text/html"?: string | string[];
    "image/png"?: string;
    "image/jpeg"?: string;
    "application/json"?: unknown;
    "application/vnd.databricks.v1+table"?: {
      data: unknown[][];
      schema: {
        name: string;
        type: string;
        metadata?: string;
      }[];
      truncated?: boolean;
    };
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  ename?: string; // for error outputs
  evalue?: string;
  traceback?: string[];
}

export interface NotebookMetadata {
  kernelspec?: {
    display_name: string;
    language: string;
    name: string;
  };
  language_info?: {
    name: string;
    version?: string;
  };
}

export interface Notebook {
  cells: NotebookCell[];
  metadata: NotebookMetadata;
  nbformat: number;
  nbformat_minor: number;
}

export function createEmptyNotebook(): Notebook {
  return {
    cells: [createEmptyCell("code")],
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3",
      },
      language_info: {
        name: "python",
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

export function createEmptyCell(type: CellType = "code"): NotebookCell {
  return {
    id: generateCellId(),
    type,
    source: "",
    outputs: type === "code" ? [] : undefined,
    executionState: type === "code" ? "idle" : undefined,
    executionCount: type === "code" ? null : undefined,
  };
}

export function generateCellId(): string {
  return `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function insertCellAt(notebook: Notebook, index: number, type: CellType = "code"): Notebook {
  const newCells = [...notebook.cells];
  newCells.splice(index, 0, createEmptyCell(type));
  return { ...notebook, cells: newCells };
}

export function deleteCellAt(notebook: Notebook, index: number): Notebook {
  if (notebook.cells.length === 1) {
    // Don't delete the last cell, just clear it
    return {
      ...notebook,
      cells: [createEmptyCell(notebook.cells[0].type)],
    };
  }
  const newCells = notebook.cells.filter((_, i) => i !== index);
  return { ...notebook, cells: newCells };
}

export function updateCellAt(
  notebook: Notebook,
  index: number,
  updates: Partial<NotebookCell>
): Notebook {
  const newCells = [...notebook.cells];
  newCells[index] = { ...newCells[index], ...updates };
  return { ...notebook, cells: newCells };
}

export function moveCellUp(notebook: Notebook, index: number): Notebook {
  if (index === 0) return notebook;
  const newCells = [...notebook.cells];
  [newCells[index - 1], newCells[index]] = [newCells[index], newCells[index - 1]];
  return { ...notebook, cells: newCells };
}

export function moveCellDown(notebook: Notebook, index: number): Notebook {
  if (index === notebook.cells.length - 1) return notebook;
  const newCells = [...notebook.cells];
  [newCells[index], newCells[index + 1]] = [newCells[index + 1], newCells[index]];
  return { ...notebook, cells: newCells };
}

export function clearCellOutputs(notebook: Notebook, index: number): Notebook {
  return updateCellAt(notebook, index, {
    outputs: [],
    executionCount: null,
    executionTime: undefined,
    error: undefined,
  });
}

export function clearAllOutputs(notebook: Notebook): Notebook {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) => ({
      ...cell,
      outputs: cell.type === "code" ? [] : undefined,
      executionCount: cell.type === "code" ? null : undefined,
      executionTime: undefined,
      error: undefined,
    })),
  };
}

// Helper function to generate HTML table for Databricks compatibility
function generateTableHTML(
  data: unknown[][],
  schema: { name: string; type: string; metadata?: string }[]
): string {
  const escapeHtml = (text: unknown): string => {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const headerRow = schema.map((col) => `<th>${escapeHtml(col.name)}</th>`).join("");
  const bodyRows = data
    .map((row) => {
      const cells = row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<style scoped>
  .table-result-container {
    max-height: 300px;
    overflow: auto;
  }
  table, th, td {
    border: 1px solid black;
    border-collapse: collapse;
  }
  th, td {
    padding: 5px;
  }
  th {
    text-align: left;
  }
</style><div class='table-result-container'><table class='table-result'><thead style='background-color: white'><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

// Convert Databricks command result to notebook cell output
export function databricksResultToCellOutput(result: {
  status: string;
  results?: {
    resultType: string;
    data?: unknown;
    fileName?: string; // Databricks uses this field for image data
    summary?: string;
    cause?: string;
  };
}): CellOutput[] {
  const outputs: CellOutput[] = [];

  if (result.status === "Finished" && result.results) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = result.results as any;
    const { resultType, data, fileName, summary } = results;

    console.log("Processing result:", {
      resultType,
      dataType: typeof data,
      isObject: typeof data === "object" && data !== null,
    });

    // Handle table result - data and schema are direct properties of results
    if (resultType === "table" && Array.isArray(results.data) && Array.isArray(results.schema)) {
      console.log("Table detected with data and schema arrays");

      // Generate HTML table for Databricks compatibility
      const htmlTable = generateTableHTML(results.data, results.schema);

      outputs.push({
        output_type: "display_data",
        data: {
          "text/html": [htmlTable],
        },
        metadata: {
          "application/vnd.databricks.v1+output": {
            addedWidgets: {},
            aggData: [],
            aggError: "",
            aggOverflow: false,
            aggSchema: [],
            aggSeriesLimitReached: false,
            aggType: "",
            arguments: {},
            columnCustomDisplayInfos: {},
            data: results.data,
            datasetInfos: [],
            dbfsResultPath: null,
            isJsonSchema: results.isJsonSchema !== undefined ? results.isJsonSchema : true,
            metadata: {},
            overflow: results.truncated || false,
            plotOptions: {
              customPlotOptions: {},
              displayType: "table",
              pivotAggregation: null,
              pivotColumns: null,
              xColumns: null,
              yColumns: null,
            },
            removedWidgets: [],
            schema: results.schema,
            type: "table",
          },
        },
      });
    } else if (resultType === "table" && typeof data === "object" && data !== null) {
      // Fallback: check if data is nested inside the data property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tableData = data as any;

      console.log("Table data check:", {
        hasData: Array.isArray(tableData.data),
        hasSchema: Array.isArray(tableData.schema),
        dataKeys: Object.keys(tableData),
      });

      // Check if data is in the expected format (with data and schema arrays)
      if (Array.isArray(tableData.data) && Array.isArray(tableData.schema)) {
        // Generate HTML table for Databricks compatibility
        const htmlTable = generateTableHTML(tableData.data, tableData.schema);

        outputs.push({
          output_type: "display_data",
          data: {
            "text/html": [htmlTable],
          },
          metadata: {
            "application/vnd.databricks.v1+output": {
              addedWidgets: {},
              aggData: [],
              aggError: "",
              aggOverflow: false,
              aggSchema: [],
              aggSeriesLimitReached: false,
              aggType: "",
              arguments: {},
              columnCustomDisplayInfos: {},
              data: tableData.data,
              datasetInfos: [],
              dbfsResultPath: null,
              isJsonSchema: tableData.isJsonSchema !== undefined ? tableData.isJsonSchema : true,
              metadata: {},
              overflow: tableData.truncated || false,
              plotOptions: {
                customPlotOptions: {},
                displayType: "table",
                pivotAggregation: null,
                pivotColumns: null,
                xColumns: null,
                yColumns: null,
              },
              removedWidgets: [],
              schema: tableData.schema,
              type: "table",
            },
          },
        });
      } else {
        // Fallback to text if table structure is not as expected
        console.warn("Table data structure not as expected:", tableData);
        outputs.push({
          output_type: "execute_result",
          data: {
            "text/plain": JSON.stringify(data, null, 2),
          },
          execution_count: null,
        });
      }
    } else if (resultType === "text") {
      const textData = typeof data === "string" ? data : JSON.stringify(data, null, 2);

      // Check if the text data is actually HTML (e.g., Plotly charts)
      // Plotly and other interactive visualizations are often returned as HTML in text type
      if (typeof data === "string" && data.trim().startsWith("<html>")) {
        outputs.push({
          output_type: "display_data",
          data: {
            "text/html": data,
          },
          metadata: {},
        });
      } else {
        outputs.push({
          output_type: "execute_result",
          data: {
            "text/plain": textData,
          },
          execution_count: null,
        });
      }
    } else if (resultType === "image") {
      // Databricks returns image data in the fileName field as a data URI
      // Format: "data:image/png;base64,iVBORw0KG..."
      let base64Data = "";

      if (fileName && typeof fileName === "string") {
        // Extract base64 data from data URI
        const match = fileName.match(/data:image\/(png|jpeg|jpg);base64,(.+)/);
        if (match) {
          base64Data = match[2];
        }
      }

      outputs.push({
        output_type: "display_data",
        data: {
          "image/png": base64Data,
        },
        metadata: {},
      });
    } else if (resultType === "html") {
      const htmlData = typeof data === "string" ? data : JSON.stringify(data);

      // Check if HTML contains base64 image data
      // Databricks often embeds images in HTML as: <img src="data:image/png;base64,..."
      const base64ImageMatch = htmlData.match(/data:image\/(png|jpeg|jpg);base64,([^"']+)/);

      if (base64ImageMatch) {
        const [, imageType, base64Data] = base64ImageMatch;
        // Provide both HTML and image data for better compatibility
        outputs.push({
          output_type: "display_data",
          data: {
            "text/html": htmlData,
            [`image/${imageType === "jpg" ? "jpeg" : imageType}`]: base64Data,
          },
          metadata: {},
        });
      } else {
        outputs.push({
          output_type: "display_data",
          data: {
            "text/html": htmlData,
          },
          metadata: {},
        });
      }
    } else {
      // Default: treat as plain text
      outputs.push({
        output_type: "execute_result",
        data: {
          "text/plain": summary || JSON.stringify(data, null, 2),
        },
        execution_count: null,
      });
    }
  } else if (result.status === "Error" && result.results) {
    const { cause, summary } = result.results;
    outputs.push({
      output_type: "error",
      ename: "ExecutionError",
      evalue: summary || cause || "Unknown error",
      traceback: [cause || summary || "Unknown error"],
    });
  }

  return outputs;
}

// Parse notebook file from JSON
export function parseNotebookFile(jsonContent: string): Notebook {
  const parsed = JSON.parse(jsonContent);

  // Ensure cells have IDs and convert from Jupyter format
  const cells = (parsed.cells || []).map((cell: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cellData = cell as any;
    // Jupyter format uses cell_type, source can be array or string
    const cellType = (cellData.cell_type || cellData.type || "code") as CellType;
    const source = Array.isArray(cellData.source) ? cellData.source.join("") : (cellData.source || "");

    return {
      id: cellData.id || generateCellId(),
      type: cellType,
      source,
      outputs: cellType === "code" ? (cellData.outputs || []) : undefined,
      executionState: cellType === "code" ? ("idle" as CellExecutionState) : undefined,
      executionCount: cellType === "code" ? (cellData.execution_count ?? null) : undefined,
    };
  });

  return {
    cells,
    metadata: parsed.metadata || {},
    nbformat: parsed.nbformat || 4,
    nbformat_minor: parsed.nbformat_minor || 5,
  };
}

// Convert notebook to JSON format for saving
export function notebookToJson(notebook: Notebook): string {
  const cleaned = {
    cells: notebook.cells.map(cell => ({
      cell_type: cell.type,
      execution_count: cell.type === "code" ? (cell.executionCount ?? 0) : undefined,
      metadata: cell.type === "code" ? {
        "application/vnd.databricks.v1+cell": {
          cellMetadata: {
            byteLimit: 2048000,
            rowLimit: 10000,
          },
          inputWidgets: {},
          nuid: generateCellId().replace("cell-", ""),
          showTitle: false,
          tableResultSettingsMap: {},
          title: "",
        },
      } : {},
      outputs: cell.type === "code" ? (cell.outputs || []) : undefined,
      source: cell.source,
    })),
    metadata: notebook.metadata,
    nbformat: notebook.nbformat,
    nbformat_minor: notebook.nbformat_minor,
  };

  return JSON.stringify(cleaned, null, 2);
}
