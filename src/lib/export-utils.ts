import Papa from "papaparse";
import * as XLSX from "xlsx";

interface Column {
  name: string;
  type_name: string;
  type_text: string;
  position: number;
}

/**
 * Exports query results to CSV format
 */
export function exportToCSV(
  columns: Column[],
  data: unknown[][],
  filename: string = "export"
): void {
  // Create header row
  const headers = columns.map((col) => col.name);

  // Convert data array to CSV format
  const csvData = [headers, ...data];

  // Generate CSV string
  const csv = Papa.unparse(csvData);

  // Create blob and download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${filename}.csv`);
}

/**
 * Exports query results to Excel format
 */
export function exportToExcel(
  columns: Column[],
  data: unknown[][],
  filename: string = "export"
): void {
  // Create header row
  const headers = columns.map((col) => col.name);

  // Create worksheet data (headers + data rows)
  const wsData = [headers, ...data];

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns
  const colWidths = columns.map((col, index) => {
    // Calculate max width based on header and data
    let maxWidth = col.name.length;
    data.forEach((row) => {
      const cellValue = row[index];
      const cellLength = cellValue ? String(cellValue).length : 0;
      maxWidth = Math.max(maxWidth, cellLength);
    });
    // Cap at 50 characters
    return { wch: Math.min(maxWidth + 2, 50) };
  });
  ws["!cols"] = colWidths;

  // Create workbook and add worksheet
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Query Results");

  // Generate Excel file and download
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Helper function to download a blob
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
