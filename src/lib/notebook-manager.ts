// Notebook cell types and utilities

export type CellType = "code" | "markdown" | "raw";

export type CellExecutionState = "idle" | "pending" | "running" | "succeeded" | "failed";

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
    const { resultType, data, fileName, summary } = result.results;

    if (resultType === "text" || resultType === "table") {
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
      source: cell.source,
      ...(cell.type === "code" && {
        outputs: cell.outputs || [],
        execution_count: cell.executionCount || null,
      }),
      metadata: {},
    })),
    metadata: notebook.metadata,
    nbformat: notebook.nbformat,
    nbformat_minor: notebook.nbformat_minor,
  };

  return JSON.stringify(cleaned, null, 2);
}
