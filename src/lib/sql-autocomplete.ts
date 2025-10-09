import type * as Monaco from "monaco-editor";

// SQL context types
export type SqlContext =
  | "SELECT"
  | "FROM"
  | "WHERE"
  | "JOIN"
  | "GROUP_BY"
  | "ORDER_BY"
  | "HAVING"
  | "TABLE_COLUMN"  // After table.
  | "UNKNOWN";

// Table alias mapping
export interface TableAlias {
  alias: string;
  fullTableName: string; // catalog.schema.table
}

// Column metadata
export interface ColumnMetadata {
  name: string;
  type: string;
  comment?: string;
  tableName: string;
}

/**
 * Detect the SQL context based on the text before the cursor
 */
export function detectSqlContext(textBeforeCursor: string): SqlContext {
  const text = textBeforeCursor.toUpperCase().trim();

  // Check if we're completing after a table/alias name (e.g., "users." or "u.")
  const tableColumnMatch = /(\w+)\.\s*\w*$/.exec(textBeforeCursor);
  if (tableColumnMatch) {
    return "TABLE_COLUMN";
  }

  // Find the most recent SQL clause keyword
  const selectPos = text.lastIndexOf("SELECT");
  const fromPos = text.lastIndexOf("FROM");
  const wherePos = text.lastIndexOf("WHERE");
  const joinPos = Math.max(
    text.lastIndexOf("JOIN"),
    text.lastIndexOf("LEFT JOIN"),
    text.lastIndexOf("RIGHT JOIN"),
    text.lastIndexOf("INNER JOIN")
  );
  const groupPos = text.lastIndexOf("GROUP BY");
  const orderPos = text.lastIndexOf("ORDER BY");
  const havingPos = text.lastIndexOf("HAVING");

  // Find which clause we're in by finding the most recent keyword
  const positions = [
    { pos: selectPos, context: "SELECT" as SqlContext },
    { pos: fromPos, context: "FROM" as SqlContext },
    { pos: wherePos, context: "WHERE" as SqlContext },
    { pos: joinPos, context: "JOIN" as SqlContext },
    { pos: groupPos, context: "GROUP_BY" as SqlContext },
    { pos: orderPos, context: "ORDER_BY" as SqlContext },
    { pos: havingPos, context: "HAVING" as SqlContext },
  ];

  const maxPos = positions.reduce((max, curr) =>
    curr.pos > max.pos ? curr : max
  , { pos: -1, context: "UNKNOWN" as SqlContext });

  return maxPos.context;
}

/**
 * Extract table aliases from the SQL query
 * Matches patterns like:
 * - FROM catalog.schema.table AS alias
 * - FROM catalog.schema.table alias
 * - JOIN catalog.schema.table AS alias
 */
export function extractTableAliases(query: string): TableAlias[] {
  const aliases: TableAlias[] = [];
  const upperQuery = query.toUpperCase();

  // Pattern: FROM/JOIN table AS alias or FROM/JOIN table alias
  const patterns = [
    /(?:FROM|JOIN)\s+([\w.]+)\s+AS\s+(\w+)/gi,
    /(?:FROM|JOIN)\s+([\w.]+)\s+(\w+)(?=\s|,|$|WHERE|JOIN|GROUP|ORDER|HAVING|LIMIT)/gi,
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(query)) !== null) {
      const fullTableName = match[1];
      const alias = match[2];

      // Don't add if alias is a SQL keyword
      const keywords = ["WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "GROUP", "ORDER", "HAVING", "LIMIT", "ON"];
      if (!keywords.includes(alias.toUpperCase())) {
        aliases.push({ alias, fullTableName });
      }
    }
  });

  return aliases;
}

/**
 * Extract table references from the query (for WHERE/SELECT contexts)
 */
export function extractTableReferences(query: string): string[] {
  const tables: Set<string> = new Set();

  // Match FROM table patterns
  const fromPattern = /FROM\s+([\w.]+)(?:\s+(?:AS\s+)?(\w+))?/gi;
  let match;

  while ((match = fromPattern.exec(query)) !== null) {
    tables.add(match[1]);
  }

  // Match JOIN table patterns
  const joinPattern = /JOIN\s+([\w.]+)(?:\s+(?:AS\s+)?(\w+))?/gi;
  while ((match = joinPattern.exec(query)) !== null) {
    tables.add(match[1]);
  }

  return Array.from(tables);
}

/**
 * Get the table name or alias before the dot in patterns like "users." or "u."
 */
export function getTableBeforeDot(textBeforeCursor: string): string | null {
  const match = /(\w+)\.\s*\w*$/.exec(textBeforeCursor);
  return match ? match[1] : null;
}

/**
 * Resolve an alias to its full table name
 */
export function resolveAlias(aliasOrTable: string, aliases: TableAlias[]): string {
  const found = aliases.find(a => a.alias === aliasOrTable);
  return found ? found.fullTableName : aliasOrTable;
}

/**
 * Create Monaco completion items for SQL keywords
 */
export function createKeywordCompletions(
  monaco: typeof Monaco,
  range: Monaco.IRange
): Monaco.languages.CompletionItem[] {
  const keywords = [
    "SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN",
    "INNER JOIN", "OUTER JOIN", "FULL JOIN", "CROSS JOIN",
    "ON", "AND", "OR", "NOT", "IN", "BETWEEN", "LIKE", "IS NULL",
    "IS NOT NULL", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
    "DISTINCT", "AS", "ASC", "DESC", "UNION", "UNION ALL",
    "INTERSECT", "EXCEPT", "WITH", "CASE", "WHEN", "THEN", "ELSE", "END",
    "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "TABLE", "VIEW", "INDEX",
  ];

  return keywords.map(keyword => ({
    label: keyword,
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: keyword,
    range,
    sortText: "9" + keyword, // Keywords have lower priority
  }));
}

/**
 * Create Monaco completion items for SQL functions
 */
export function createFunctionCompletions(
  monaco: typeof Monaco,
  range: Monaco.IRange
): Monaco.languages.CompletionItem[] {
  const functions = [
    { name: "COUNT", snippet: "COUNT(${1:*})" },
    { name: "SUM", snippet: "SUM(${1:column})" },
    { name: "AVG", snippet: "AVG(${1:column})" },
    { name: "MIN", snippet: "MIN(${1:column})" },
    { name: "MAX", snippet: "MAX(${1:column})" },
    { name: "CAST", snippet: "CAST(${1:column} AS ${2:type})" },
    { name: "COALESCE", snippet: "COALESCE(${1:column}, ${2:default})" },
    { name: "CONCAT", snippet: "CONCAT(${1:str1}, ${2:str2})" },
    { name: "SUBSTRING", snippet: "SUBSTRING(${1:column}, ${2:start}, ${3:length})" },
    { name: "UPPER", snippet: "UPPER(${1:column})" },
    { name: "LOWER", snippet: "LOWER(${1:column})" },
    { name: "TRIM", snippet: "TRIM(${1:column})" },
    { name: "DATE_TRUNC", snippet: "DATE_TRUNC('${1:day}', ${2:column})" },
    { name: "CURRENT_DATE", snippet: "CURRENT_DATE()" },
    { name: "CURRENT_TIMESTAMP", snippet: "CURRENT_TIMESTAMP()" },
  ];

  return functions.map(func => ({
    label: func.name,
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: func.snippet,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    detail: "SQL Function",
    sortText: "8" + func.name, // Functions have medium priority
  }));
}

/**
 * Create Monaco completion items for catalogs
 */
export function createCatalogCompletions(
  monaco: typeof Monaco,
  catalogs: string[],
  range: Monaco.IRange
): Monaco.languages.CompletionItem[] {
  return catalogs.map(catalog => ({
    label: catalog,
    kind: monaco.languages.CompletionItemKind.Module,
    insertText: catalog,
    range,
    detail: "Catalog",
    sortText: "3" + catalog, // Catalogs have high priority
  }));
}

/**
 * Create Monaco completion items for schemas
 */
export function createSchemaCompletions(
  monaco: typeof Monaco,
  schemas: string[],
  catalogName: string,
  range: Monaco.IRange
): Monaco.languages.CompletionItem[] {
  return schemas.map(schema => ({
    label: schema,
    kind: monaco.languages.CompletionItemKind.Module,
    insertText: schema,
    range,
    detail: `Schema in ${catalogName}`,
    sortText: "2" + schema, // Schemas have very high priority
  }));
}

/**
 * Create Monaco completion items for tables
 */
export function createTableCompletions(
  monaco: typeof Monaco,
  tables: string[],
  fullPath: string,
  range: Monaco.IRange,
  includeFullPath: boolean = false
): Monaco.languages.CompletionItem[] {
  return tables.map(table => ({
    label: table,
    kind: monaco.languages.CompletionItemKind.Class,
    insertText: includeFullPath ? `${fullPath}.${table}` : table,
    range,
    detail: `Table in ${fullPath}`,
    sortText: "1" + table, // Tables have highest priority in FROM context
  }));
}

/**
 * Create Monaco completion items for columns
 */
export function createColumnCompletions(
  monaco: typeof Monaco,
  columns: Array<{ name: string; type: string; comment?: string }>,
  tableName: string,
  range: Monaco.IRange
): Monaco.languages.CompletionItem[] {
  return columns.map(column => ({
    label: column.name,
    kind: monaco.languages.CompletionItemKind.Field,
    insertText: column.name,
    range,
    detail: column.type,
    documentation: column.comment
      ? { value: `**${tableName}**\n\n${column.comment}\n\nType: \`${column.type}\`` }
      : { value: `**${tableName}**\n\nType: \`${column.type}\`` },
    sortText: "0" + column.name, // Columns have top priority in SELECT/WHERE context
  }));
}
