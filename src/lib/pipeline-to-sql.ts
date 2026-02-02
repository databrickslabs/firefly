/**
 * Pipeline to SQL Transformer
 *
 * Converts visual pipeline nodes and edges into ANSI SQL statements.
 * Generates CTEs (Common Table Expressions) for data flow and
 * produces final INSERT/CREATE TABLE statements for destinations.
 */

// ============================================================================
// Types
// ============================================================================

// Column mapping configuration for nodes
export interface ColumnMappingConfig {
  name: string;
  selected: boolean;
  alias?: string;
  side?: "a" | "b";
}

export interface PipelineNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data: {
    label: string;
    category: "source" | "transform" | "ai" | "destination";
    subtype: string;
    config: Record<string, unknown>;
    columnMapping?: ColumnMappingConfig[];
  };
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface JoinCondition {
  id: string;
  type: "equality" | "comparison" | "range";
  leftColumn: string;
  rightColumn: string;
  rightColumnEnd?: string;
  operator?: string;
}

export interface ConditionGroup {
  id: string;
  conditions: JoinCondition[];
}

export interface SQLGenerationResult {
  /** The generated SQL statement */
  sql: string;
  /** Non-fatal warnings during generation */
  warnings: string[];
  /** Fatal errors that prevented generation */
  errors: string[];
  /** Node IDs that couldn't be converted to SQL */
  unsupportedNodes: string[];
  /** Whether the result is valid and executable */
  isValid: boolean;
}

export interface GenerationOptions {
  /** Whether to format the SQL with indentation */
  format?: boolean;
  /** Whether to include comments explaining each CTE */
  includeComments?: boolean;
  /** Whether to use CREATE TABLE AS or INSERT INTO for destinations */
  destinationMode?: "create" | "insert" | "merge";
  /** Prefix for generated CTE names */
  ctePrefix?: string;
}

// Schedule types for materialized views
type ScheduleType = "none" | "trigger" | "scheduled";
type ScheduleUnit = "HOURS" | "DAYS" | "WEEKS";
type TriggerUnit = "MINUTES" | "HOURS";

interface MaterializedViewConfig {
  catalog?: string;
  schema?: string;
  table?: string;
  enableDeletionVectors?: boolean;
  enableRowTracking?: boolean;
  enableChangeDataFeed?: boolean;
  scheduleType?: ScheduleType;
  scheduleInterval?: number;
  scheduleUnit?: ScheduleUnit;
  triggerMinInterval?: number;
  triggerMinIntervalUnit?: TriggerUnit;
  pipelinesChannel?: "CURRENT" | "PREVIEW";
  customProperties?: string;
}

// Firefly metadata to track which pipeline/org/user created the MV
export interface FireflyMetadata {
  pipelineId?: string | null;
  orgId?: string | null;
  userId?: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sanitize an identifier for SQL (basic escaping)
 */
function sanitizeIdentifier(name: string): string {
  // Remove or replace dangerous characters
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Generate a valid CTE name from a node label and ID
 * Includes the node ID to ensure uniqueness when multiple nodes have the same label
 */
function generateCteName(label: string, nodeId: string, prefix: string = "cte"): string {
  const sanitizedLabel = sanitizeIdentifier(label.toLowerCase().replace(/\s+/g, "_"));
  const sanitizedId = sanitizeIdentifier(nodeId);
  return `${prefix}_${sanitizedLabel}_${sanitizedId}`;
}

/**
 * Format a three-part table name with backtick quoting
 */
function formatTableName(
  catalog?: string,
  schema?: string,
  table?: string
): string {
  const parts = [catalog, schema, table].filter(Boolean);
  return parts.map((part) => `\`${part}\``).join(".");
}

/**
 * Indent SQL lines
 */
function indent(sql: string, spaces: number = 2): string {
  const indentStr = " ".repeat(spaces);
  return sql
    .split("\n")
    .map((line) => (line.trim() ? indentStr + line : line))
    .join("\n");
}

/**
 * Generate column list from node column mapping
 * Returns "*" if no specific columns are selected or all columns are selected without aliases
 * Otherwise returns a comma-separated list of columns with optional aliases
 */
function generateColumnListFromNode(node?: PipelineNode, tableAlias?: string): string {
  const columnMapping = node?.data?.columnMapping;

  // If no column mapping, return *
  if (!columnMapping || columnMapping.length === 0) {
    return tableAlias ? `${tableAlias}.*` : "*";
  }

  // Get selected columns
  const selectedColumns = columnMapping.filter((col) => col.selected);

  // If no columns selected, return * (shouldn't happen normally but handle it)
  if (selectedColumns.length === 0) {
    return tableAlias ? `${tableAlias}.*` : "*";
  }

  // Check if all columns are selected without aliases (equivalent to *)
  const allSelected = columnMapping.every((col) => col.selected);
  const noAliases = columnMapping.every((col) => !col.alias);
  if (allSelected && noAliases) {
    return tableAlias ? `${tableAlias}.*` : "*";
  }

  // Generate column list with aliases
  return selectedColumns
    .map((col) => {
      const colName = tableAlias ? `${tableAlias}.${col.name}` : col.name;
      if (col.alias) {
        return `${colName} AS \`${col.alias}\``;
      }
      return colName;
    })
    .join(", ");
}

/**
 * Check if node has specific column selections (not SELECT *)
 */
function hasNodeColumnSelections(node?: PipelineNode): boolean {
  const columnMapping = node?.data?.columnMapping;
  if (!columnMapping || columnMapping.length === 0) {
    return false;
  }

  // Has selections if any column is deselected or has an alias
  const hasDeselected = columnMapping.some((col) => !col.selected);
  const hasAliases = columnMapping.some((col) => col.alias);

  return hasDeselected || hasAliases;
}

/**
 * Generate TBLPROPERTIES clause for materialized view
 */
function generateTblProperties(
  config: MaterializedViewConfig,
  fireflyMetadata?: FireflyMetadata
): string | null {
  const properties: string[] = [];

  // Delta table properties (checked by default, so only add if explicitly enabled)
  if (config.enableDeletionVectors !== false) {
    properties.push("'delta.enableDeletionVectors' = 'true'");
  }
  if (config.enableRowTracking !== false) {
    properties.push("'delta.enableRowTracking' = 'true'");
  }
  if (config.enableChangeDataFeed !== false) {
    properties.push("'delta.enableChangeDataFeed' = 'true'");
  }

  // Pipeline channel
  if (config.pipelinesChannel && config.pipelinesChannel !== "CURRENT") {
    properties.push(`'pipelines.channel' = '${config.pipelinesChannel}'`);
  }

  // Firefly metadata properties
  if (fireflyMetadata?.pipelineId) {
    properties.push(`'fireflyPipelineId' = '${fireflyMetadata.pipelineId}'`);
  }
  if (fireflyMetadata?.orgId) {
    properties.push(`'fireflyOrgId' = '${fireflyMetadata.orgId}'`);
  }
  if (fireflyMetadata?.userId) {
    properties.push(`'fireflyUserId' = '${fireflyMetadata.userId}'`);
  }

  // Custom properties
  if (config.customProperties?.trim()) {
    properties.push(config.customProperties.trim());
  }

  if (properties.length === 0) {
    return null;
  }

  return `TBLPROPERTIES (\n  ${properties.join(",\n  ")}\n)`;
}

/**
 * Generate schedule clause for materialized view
 */
function generateScheduleClause(config: MaterializedViewConfig): string | null {
  if (!config.scheduleType || config.scheduleType === "none") {
    return null;
  }

  if (config.scheduleType === "trigger") {
    let clause = "TRIGGER ON UPDATE";
    if (config.triggerMinInterval && config.triggerMinIntervalUnit) {
      clause += ` AT MOST EVERY INTERVAL '${config.triggerMinInterval}' ${config.triggerMinIntervalUnit === "MINUTES" ? "MINUTE" : "HOUR"}`;
    }
    return clause;
  }

  if (config.scheduleType === "scheduled") {
    const interval = config.scheduleInterval || 1;
    const unit = config.scheduleUnit || "DAYS";
    // Use singular form for 1, plural for others
    const unitStr = interval === 1 ? unit.slice(0, -1) : unit;
    return `SCHEDULE EVERY ${interval} ${unitStr}`;
  }

  return null;
}

/**
 * Generate CREATE MATERIALIZED VIEW statement
 * CTEs go after the AS keyword, before the final SELECT
 */
export function generateMaterializedViewSQL(
  viewName: string,
  selectQuery: string,
  config: MaterializedViewConfig,
  options: { includeComments?: boolean; cteClause?: string; fireflyMetadata?: FireflyMetadata } = {}
): string {
  const parts: string[] = [];

  if (options.includeComments) {
    parts.push(`-- Materialized View: ${viewName}`);
  }

  parts.push(`CREATE OR REPLACE MATERIALIZED VIEW ${viewName}`);

  // Add schedule clause
  const scheduleClause = generateScheduleClause(config);
  if (scheduleClause) {
    parts.push(scheduleClause);
  }

  // Add TBLPROPERTIES (includes firefly metadata if provided)
  const tblProperties = generateTblProperties(config, options.fireflyMetadata);
  if (tblProperties) {
    parts.push(tblProperties);
  }

  // Add the AS clause - CTEs go inside AS, before the final SELECT
  if (options.cteClause) {
    parts.push(`AS\n${options.cteClause}\n${selectQuery}`);
  } else {
    parts.push(`AS\n${selectQuery}`);
  }

  return parts.join("\n");
}

/**
 * Generate CREATE VIEW statement
 * CTEs go after the AS keyword, before the final SELECT
 */
export function generateViewSQL(
  viewName: string,
  selectQuery: string,
  options: { includeComments?: boolean; cteClause?: string } = {}
): string {
  const parts: string[] = [];

  if (options.includeComments) {
    parts.push(`-- View: ${viewName}`);
  }

  // CTEs go inside AS, before the final SELECT
  if (options.cteClause) {
    parts.push(`CREATE OR REPLACE VIEW ${viewName} AS\n${options.cteClause}\n${selectQuery}`);
  } else {
    parts.push(`CREATE OR REPLACE VIEW ${viewName} AS\n${selectQuery}`);
  }

  return parts.join("\n");
}

// ============================================================================
// Graph Operations
// ============================================================================

interface NodeGraph {
  nodes: Map<string, PipelineNode>;
  edges: PipelineEdge[];
  edgeMap: Map<string, PipelineEdge>; // edge id -> edge
  incomingEdges: Map<string, PipelineEdge[]>;
  outgoingEdges: Map<string, PipelineEdge[]>;
}

/**
 * Build a graph structure from nodes and edges
 */
function buildGraph(nodes: PipelineNode[], edges: PipelineEdge[]): NodeGraph {
  const nodeMap = new Map<string, PipelineNode>();
  const edgeMap = new Map<string, PipelineEdge>();
  const incomingEdges = new Map<string, PipelineEdge[]>();
  const outgoingEdges = new Map<string, PipelineEdge[]>();

  // Index nodes
  for (const node of nodes) {
    nodeMap.set(node.id, node);
    incomingEdges.set(node.id, []);
    outgoingEdges.set(node.id, []);
  }

  // Index edges
  for (const edge of edges) {
    edgeMap.set(edge.id, edge);
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      incomingEdges.get(edge.target)?.push(edge);
      outgoingEdges.get(edge.source)?.push(edge);
    }
  }

  return { nodes: nodeMap, edges, edgeMap, incomingEdges, outgoingEdges };
}

/**
 * Topologically sort nodes for proper dependency order
 */
function topologicalSort(graph: NodeGraph): PipelineNode[] {
  const sorted: PipelineNode[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(nodeId: string): boolean {
    if (visited.has(nodeId)) return true;
    if (visiting.has(nodeId)) return false; // Cycle detected

    visiting.add(nodeId);

    const incoming = graph.incomingEdges.get(nodeId) || [];
    for (const edge of incoming) {
      if (!visit(edge.source)) return false;
    }

    visiting.delete(nodeId);
    visited.add(nodeId);

    const node = graph.nodes.get(nodeId);
    if (node) sorted.push(node);

    return true;
  }

  for (const nodeId of graph.nodes.keys()) {
    if (!visit(nodeId)) {
      throw new Error("Cycle detected in pipeline graph");
    }
  }

  return sorted;
}

/**
 * Get upstream node IDs for a given node, including the edge
 */
function getUpstreamNodes(
  nodeId: string,
  graph: NodeGraph
): { nodeId: string; handle?: string | null; edge: PipelineEdge }[] {
  const incoming = graph.incomingEdges.get(nodeId) || [];
  return incoming.map((edge) => ({
    nodeId: edge.source,
    handle: edge.targetHandle,
    edge,
  }));
}

// ============================================================================
// SQL Generators for Each Node Type
// ============================================================================

interface GeneratedCTE {
  name: string;
  sql: string;
  comment?: string;
}

/**
 * Generate SQL for a source table node
 */
function generateSourceTableSQL(
  node: PipelineNode,
  cteName: string
): GeneratedCTE {
  const config = node.data.config;
  const tableName = formatTableName(
    config.catalog as string,
    config.schema as string,
    config.table as string
  );

  const readMode = config.readMode as string;
  const comment = `Source: ${tableName}${readMode === "streaming" ? " (streaming)" : ""}`;

  // Apply column mapping if the source node has one
  const columns = generateColumnListFromNode(node);

  return {
    name: cteName,
    sql: `SELECT ${columns} FROM ${tableName}`,
    comment,
  };
}

/**
 * Generate SQL for a source volume node
 */
function generateSourceVolumeSQL(
  node: PipelineNode,
  cteName: string
): GeneratedCTE {
  const config = node.data.config;
  const volumePath = formatTableName(
    config.catalog as string,
    config.schema as string,
    config.volume as string
  );
  const filePath = config.path as string;
  const format = (config.format as string) || "parquet";

  // Use read_files function (Databricks-specific, but commonly supported)
  const fullPath = `${volumePath}${filePath}`;
  const comment = `Volume source: ${fullPath} (${format})`;

  // Apply column mapping if the source node has one
  const columns = generateColumnListFromNode(node);

  // If there's column mapping, wrap the read_files in a subquery
  if (hasNodeColumnSelections(node)) {
    return {
      name: cteName,
      sql: `SELECT ${columns} FROM read_files('${fullPath}', format => '${format}')`,
      comment,
    };
  }

  return {
    name: cteName,
    sql: `SELECT * FROM read_files('${fullPath}', format => '${format}')`,
    comment,
  };
}

/**
 * Generate SQL for a source stream node
 */
function generateSourceStreamSQL(
  node: PipelineNode,
  cteName: string
): GeneratedCTE {
  const config = node.data.config;
  const source = config.source as string;
  const topic = config.topic as string;

  const comment = `Stream source: ${source}/${topic}`;

  // Apply column mapping if the source node has one
  const columns = generateColumnListFromNode(node);

  // Streaming sources typically need special handling
  // This generates a placeholder that would work with streaming tables
  return {
    name: cteName,
    sql: `SELECT ${columns} FROM STREAM('${source}', '${topic}')`,
    comment,
  };
}

/**
 * Generate SQL for a SQL transform node
 * Note: SQL transforms use custom SQL, so column selections apply as a wrapper
 * The user's SQL is used as-is, with placeholder replacements
 */
function generateSQLTransformSQL(
  node: PipelineNode,
  cteName: string,
  upstreamCteNames: string[]
): GeneratedCTE {
  const config = node.data.config;
  let sql = (config.sql as string) || "SELECT *";

  // Replace common placeholder references with actual CTE names
  // If there's only one upstream, replace generic references
  if (upstreamCteNames.length === 1) {
    const upstream = upstreamCteNames[0];
    // Replace common patterns like source_table, input, upstream
    sql = sql.replace(/\b(source_table|input|upstream|source)\b/gi, upstream);
  }

  // If node has column mapping, wrap the SQL to apply column selection
  if (hasNodeColumnSelections(node)) {
    const columns = generateColumnListFromNode(node);
    sql = `SELECT ${columns} FROM (${sql}) AS _inner`;
  }

  return {
    name: cteName,
    sql,
    comment: `SQL Transform: ${node.data.label}`,
  };
}

/**
 * Generate SQL for a filter transform node
 */
function generateFilterTransformSQL(
  node: PipelineNode,
  cteName: string,
  upstreamCteNames: string[]
): GeneratedCTE {
  const config = node.data.config;
  const condition = (config.condition as string) || "1=1";
  const upstream = upstreamCteNames[0] || "source";

  // Generate column list from node column mapping
  const columns = generateColumnListFromNode(node);

  return {
    name: cteName,
    sql: `SELECT ${columns} FROM ${upstream} WHERE ${condition}`,
    comment: `Filter: ${condition}`,
  };
}

/**
 * Generate SQL for a join transform node
 * Uses table aliases (a, b) to avoid ambiguous column references
 * Column mapping is on the join node itself (not on input edges)
 */
function generateJoinTransformSQL(
  node: PipelineNode,
  cteName: string,
  upstreamCteNames: string[],
  upstreamInfo: { nodeId: string; handle?: string | null; edge: PipelineEdge }[]
): GeneratedCTE {
  const config = node.data.config;
  const joinType = ((config.joinType as string) || "inner").toUpperCase();
  const conditionGroups = config.conditionGroups as ConditionGroup[] | undefined;

  // Determine left and right tables based on handles or order
  let leftTable = upstreamCteNames[0] || "left_source";
  let rightTable = upstreamCteNames[1] || "right_source";

  // If handles are specified, use them to determine order
  for (let i = 0; i < upstreamInfo.length; i++) {
    if (upstreamInfo[i].handle === "input-a") {
      leftTable = upstreamCteNames[i];
    } else if (upstreamInfo[i].handle === "input-b") {
      rightTable = upstreamCteNames[i];
    }
  }

  // Use short aliases for readability
  const leftAlias = "a";
  const rightAlias = "b";

  // Helper to prefix column with alias if not already prefixed
  const prefixColumn = (col: string, alias: string): string => {
    // If column already has a prefix (contains '.'), use it as-is
    if (col.includes(".")) return col;
    return `${alias}.${col}`;
  };

  // Build join condition with proper table prefixes
  let joinCondition = "1=1";
  if (conditionGroups && conditionGroups.length > 0) {
    const groupConditions = conditionGroups.map((group) => {
      const conditions = group.conditions
        .filter((c) => c.leftColumn && c.rightColumn)
        .map((cond) => {
          // Left column comes from left table (alias 'a')
          // Right column comes from right table (alias 'b')
          const left = prefixColumn(cond.leftColumn, leftAlias);
          const right = prefixColumn(cond.rightColumn, rightAlias);

          switch (cond.type) {
            case "equality":
              return `${left} = ${right}`;
            case "comparison":
              return `${left} ${cond.operator || "="} ${right}`;
            case "range": {
              const rightEnd = cond.rightColumnEnd
                ? prefixColumn(cond.rightColumnEnd, rightAlias)
                : right;
              return `${left} BETWEEN ${right} AND ${rightEnd}`;
            }
            default:
              return `${left} = ${right}`;
          }
        });
      return conditions.length > 0 ? `(${conditions.join(" AND ")})` : "1=1";
    });
    joinCondition = groupConditions.join(" OR ");
  }

  // Map join types to SQL syntax
  const joinTypeMap: Record<string, string> = {
    INNER: "INNER JOIN",
    LEFT: "LEFT JOIN",
    RIGHT: "RIGHT JOIN",
    FULL: "FULL OUTER JOIN",
    CROSS: "CROSS JOIN",
    LEFT_SEMI: "LEFT SEMI JOIN",
    LEFT_ANTI: "LEFT ANTI JOIN",
  };

  const sqlJoinType = joinTypeMap[joinType] || "INNER JOIN";

  // Generate column list from node column mapping
  // Column names are prefixed with a. or b. to indicate source
  let columnList = "*";
  if (hasNodeColumnSelections(node)) {
    const columnMapping = node.data.columnMapping!;
    const selectedCols = columnMapping.filter((c) => c.selected);

    if (selectedCols.length > 0) {
      columnList = selectedCols
        .map((col) => {
          // Column name already has a. or b. prefix from the mapping
          if (col.alias) {
            return `${col.name} AS \`${col.alias}\``;
          }
          return col.name;
        })
        .join(", ");
    }
  }

  return {
    name: cteName,
    sql: `SELECT ${columnList} FROM ${leftTable} ${leftAlias} ${sqlJoinType} ${rightTable} ${rightAlias} ON ${joinCondition}`,
    comment: `Join: ${leftTable} (${leftAlias}) ${sqlJoinType} ${rightTable} (${rightAlias})`,
  };
}

/**
 * Generate SQL for a Python transform node (limited support)
 */
function generatePythonTransformSQL(
  node: PipelineNode,
  cteName: string,
  upstreamCteNames: string[]
): GeneratedCTE {
  const upstream = upstreamCteNames[0] || "source";

  // Generate column list from node column mapping
  const columns = generateColumnListFromNode(node);

  // Python transforms can't be directly converted to SQL
  // Generate a passthrough with a comment
  return {
    name: cteName,
    sql: `SELECT ${columns} FROM ${upstream}`,
    comment: `Python Transform: ${node.data.label} (passthrough - code execution not supported in SQL)`,
  };
}

/**
 * Generate SQL for an AI inference node (limited support)
 */
function generateAIInferenceSQL(
  node: PipelineNode,
  cteName: string,
  upstreamCteNames: string[]
): GeneratedCTE {
  const config = node.data.config;
  const upstream = upstreamCteNames[0] || "source";
  const modelEndpoint = config.modelEndpoint as string;
  const inputColumn = config.inputColumn as string;
  const outputColumn = config.outputColumn as string;

  // Generate column list from node column mapping
  const columns = generateColumnListFromNode(node);
  const baseColumns = columns === "*" ? "*" : columns;

  // AI inference requires UDF - generate a placeholder
  return {
    name: cteName,
    sql: `SELECT ${baseColumns}, ai_query('${modelEndpoint}', ${inputColumn}) AS ${outputColumn} FROM ${upstream}`,
    comment: `AI Inference: ${modelEndpoint} on ${inputColumn}`,
  };
}

/**
 * Generate SQL for an AI parse node (limited support)
 */
function generateAIParseSQL(
  node: PipelineNode,
  cteName: string,
  upstreamCteNames: string[]
): GeneratedCTE {
  const config = node.data.config;
  const upstream = upstreamCteNames[0] || "source";
  const parseType = config.parseType as string;
  const inputColumn = config.inputColumn as string;
  const outputColumn = config.outputColumn as string;

  // Generate column list from node column mapping
  const columns = generateColumnListFromNode(node);
  const baseColumns = columns === "*" ? "*" : columns;

  return {
    name: cteName,
    sql: `SELECT ${baseColumns}, ai_extract('${parseType}', ${inputColumn}) AS ${outputColumn} FROM ${upstream}`,
    comment: `AI Parse (${parseType}): ${inputColumn} -> ${outputColumn}`,
  };
}

/**
 * Generate SQL for a destination node (materialized view or view) when used as a source input
 * This allows MV/views to be used as inputs to downstream transforms
 */
function generateDestinationAsSourceSQL(
  node: PipelineNode,
  cteName: string
): GeneratedCTE | null {
  const config = node.data.config;
  const subtype = node.data.subtype;

  // Only handle materialized-view and view
  if (subtype !== "materialized-view" && subtype !== "view") {
    return null;
  }

  const catalog = config.catalog as string | undefined;
  const schema = config.schema as string | undefined;
  const table = config.table as string | undefined;

  if (!catalog || !schema || !table) {
    return null;
  }

  const tableName = formatTableName(catalog, schema, table);
  const columns = generateColumnListFromNode(node);
  const comment = subtype === "materialized-view"
    ? `Materialized View source: ${tableName}`
    : `View source: ${tableName}`;

  return {
    name: cteName,
    sql: `SELECT ${columns} FROM ${tableName}`,
    comment,
  };
}

// ============================================================================
// Main Transformer
// ============================================================================

/**
 * Transform pipeline nodes and edges into SQL
 */
export function pipelineToSQL(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  options: GenerationOptions = {}
): SQLGenerationResult {
  const {
    format = true,
    includeComments = true,
    destinationMode = "create",
    ctePrefix = "cte",
  } = options;

  const result: SQLGenerationResult = {
    sql: "",
    warnings: [],
    errors: [],
    unsupportedNodes: [],
    isValid: true,
  };

  // Validate inputs
  if (!nodes || nodes.length === 0) {
    result.errors.push("No nodes provided");
    result.isValid = false;
    return result;
  }

  try {
    // Build graph and sort nodes
    const graph = buildGraph(nodes, edges);
    const sortedNodes = topologicalSort(graph);

    // Track CTE names for each node
    const nodeToCte = new Map<string, string>();
    const ctes: GeneratedCTE[] = [];
    const destinations: PipelineNode[] = [];

    // Generate CTEs for each node
    for (const node of sortedNodes) {
      const { category, subtype } = node.data;

      // Skip destination nodes - handle them separately
      if (category === "destination") {
        destinations.push(node);
        continue;
      }

      // Generate CTE name (includes node ID for uniqueness)
      const cteName = generateCteName(node.data.label, node.id, ctePrefix);
      nodeToCte.set(node.id, cteName);

      // Get upstream CTE names and info
      const upstreamInfo = getUpstreamNodes(node.id, graph);
      const upstreamCteNames = upstreamInfo
        .map((u) => nodeToCte.get(u.nodeId))
        .filter(Boolean) as string[];

      // Generate SQL based on node type
      let cte: GeneratedCTE | null = null;

      switch (category) {
        case "source":
          switch (subtype) {
            case "table":
              cte = generateSourceTableSQL(node, cteName);
              break;
            case "volume":
              cte = generateSourceVolumeSQL(node, cteName);
              break;
            case "stream":
              cte = generateSourceStreamSQL(node, cteName);
              result.warnings.push(
                `Stream source "${node.data.label}" uses non-standard SQL syntax`
              );
              break;
            default:
              result.unsupportedNodes.push(node.id);
              result.warnings.push(
                `Unsupported source type: ${subtype}`
              );
          }
          break;

        case "transform":
          switch (subtype) {
            case "sql":
              cte = generateSQLTransformSQL(node, cteName, upstreamCteNames);
              break;
            case "filter":
              cte = generateFilterTransformSQL(node, cteName, upstreamCteNames);
              break;
            case "join":
              cte = generateJoinTransformSQL(
                node,
                cteName,
                upstreamCteNames,
                upstreamInfo
              );
              break;
            case "python":
              cte = generatePythonTransformSQL(node, cteName, upstreamCteNames);
              result.warnings.push(
                `Python transform "${node.data.label}" converted to passthrough - code not executable in SQL`
              );
              result.unsupportedNodes.push(node.id);
              break;
            default:
              result.unsupportedNodes.push(node.id);
              result.warnings.push(
                `Unsupported transform type: ${subtype}`
              );
          }
          break;

        case "ai":
          switch (subtype) {
            case "inference":
              cte = generateAIInferenceSQL(node, cteName, upstreamCteNames);
              result.warnings.push(
                `AI inference "${node.data.label}" uses ai_query() function - ensure it's available`
              );
              break;
            case "ai-parse":
              cte = generateAIParseSQL(node, cteName, upstreamCteNames);
              result.warnings.push(
                `AI parse "${node.data.label}" uses ai_extract() function - ensure it's available`
              );
              break;
            default:
              result.unsupportedNodes.push(node.id);
              result.warnings.push(`Unsupported AI type: ${subtype}`);
          }
          break;

        default:
          result.unsupportedNodes.push(node.id);
          result.warnings.push(`Unknown node category: ${category}`);
      }

      if (cte) {
        ctes.push(cte);
      }
    }

    // Build the final SQL
    const sqlParts: string[] = [];

    // Build CTE clause (used differently based on destination type)
    let cteClause = "";
    if (ctes.length > 0) {
      const cteParts = ctes.map((cte) => {
        let cteSql = "";
        if (includeComments && cte.comment) {
          cteSql += `-- ${cte.comment}\n`;
        }
        cteSql += `${cte.name} AS (\n${indent(cte.sql)}\n)`;
        return cteSql;
      });

      cteClause = "WITH " + cteParts.join(",\n\n");
    }

    // Handle destinations
    if (destinations.length === 0) {
      // No destination - just select from the last CTE
      if (ctes.length > 0) {
        if (cteClause) {
          sqlParts.push(cteClause);
        }
        const lastCte = ctes[ctes.length - 1];
        sqlParts.push(`SELECT * FROM ${lastCte.name}`);
      }
    } else {
      // Check if all destinations are views/materialized views
      // If so, CTEs go inside each view definition
      // If mixed or other types, CTEs go before
      const hasNonViewDestinations = destinations.some(
        (d) => d.data.subtype !== "materialized-view" && d.data.subtype !== "view"
      );

      // For non-view destinations, add CTEs first
      if (hasNonViewDestinations && cteClause) {
        sqlParts.push(cteClause);
      }

      // Generate destination statements
      for (const dest of destinations) {
        const config = dest.data.config;
        const tableName = formatTableName(
          config.catalog as string,
          config.schema as string,
          config.table as string
        );

        // Find upstream CTE
        const upstreamInfo = getUpstreamNodes(dest.id, graph);
        const upstreamCte = upstreamInfo
          .map((u) => nodeToCte.get(u.nodeId))
          .filter(Boolean)[0];

        if (!upstreamCte) {
          result.warnings.push(
            `Destination "${dest.data.label}" has no upstream connection`
          );
          continue;
        }

        // Generate column list from destination node's column mapping
        const columns = generateColumnListFromNode(dest);
        const selectQuery = `SELECT ${columns} FROM ${upstreamCte}`;

        const { subtype } = dest.data;

        // Handle materialized view destination - CTEs go inside AS clause
        if (subtype === "materialized-view") {
          const mvConfig = config as MaterializedViewConfig;
          sqlParts.push(
            generateMaterializedViewSQL(tableName, selectQuery, mvConfig, {
              includeComments,
              cteClause: cteClause || undefined,
            })
          );
          continue;
        }

        // Handle view destination - CTEs go inside AS clause
        if (subtype === "view") {
          sqlParts.push(
            generateViewSQL(tableName, selectQuery, {
              includeComments,
              cteClause: cteClause || undefined,
            })
          );
          continue;
        }

        // Handle streaming table and other destinations (legacy behavior)
        if (includeComments) {
          sqlParts.push(`-- Destination: ${tableName}`);
        }

        switch (destinationMode) {
          case "create":
            sqlParts.push(
              `CREATE OR REPLACE TABLE ${tableName} AS\n${selectQuery}`
            );
            break;
          case "insert":
            sqlParts.push(
              `INSERT INTO ${tableName}\n${selectQuery}`
            );
            break;
          case "merge":
            // Merge requires special handling with keys
            const writeMode = config.writeMode as string;
            if (writeMode === "merge") {
              sqlParts.push(
                `-- MERGE requires manual key specification\nMERGE INTO ${tableName} AS target\nUSING ${upstreamCte} AS source\nON /* specify join keys */\nWHEN MATCHED THEN UPDATE SET *\nWHEN NOT MATCHED THEN INSERT *`
              );
            } else {
              sqlParts.push(
                `INSERT INTO ${tableName}\n${selectQuery}`
              );
            }
            break;
        }
      }
    }

    // Combine all parts
    result.sql = format
      ? sqlParts.join("\n\n") + ";"
      : sqlParts.join(" ").replace(/\s+/g, " ") + ";";

  } catch (error) {
    result.errors.push(
      error instanceof Error ? error.message : "Unknown error during SQL generation"
    );
    result.isValid = false;
  }

  // Mark as invalid if there are errors
  if (result.errors.length > 0) {
    result.isValid = false;
  }

  return result;
}

/**
 * Validate a pipeline and return any issues
 */
export function validatePipeline(
  nodes: PipelineNode[],
  edges: PipelineEdge[]
): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for at least one source
  const sources = nodes.filter((n) => n.data.category === "source");
  if (sources.length === 0) {
    issues.push("Pipeline must have at least one source node");
  }

  // Check for at least one destination
  const destinations = nodes.filter((n) => n.data.category === "destination");
  if (destinations.length === 0) {
    issues.push("Pipeline should have at least one destination node");
  }

  // Check for disconnected nodes
  const connectedNodes = new Set<string>();
  for (const edge of edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }

  for (const node of nodes) {
    if (!connectedNodes.has(node.id) && nodes.length > 1) {
      issues.push(`Node "${node.data.label}" is not connected to the pipeline`);
    }
  }

  // Check for cycles
  try {
    const graph = buildGraph(nodes, edges);
    topologicalSort(graph);
  } catch {
    issues.push("Pipeline contains a cycle - this is not allowed");
  }

  // Check join nodes have two inputs
  const joinNodes = nodes.filter(
    (n) => n.data.category === "transform" && n.data.subtype === "join"
  );
  for (const join of joinNodes) {
    const incoming = edges.filter((e) => e.target === join.id);
    if (incoming.length < 2) {
      issues.push(
        `Join node "${join.data.label}" requires exactly 2 input connections (has ${incoming.length})`
      );
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Generate a preview of the SQL without executing
 */
export function generateSQLPreview(
  nodes: PipelineNode[],
  edges: PipelineEdge[]
): string {
  const result = pipelineToSQL(nodes, edges, {
    format: true,
    includeComments: true,
    destinationMode: "create",
  });

  if (!result.isValid) {
    return `-- Errors:\n${result.errors.map((e) => `-- ${e}`).join("\n")}\n\n${result.sql}`;
  }

  if (result.warnings.length > 0) {
    return `-- Warnings:\n${result.warnings.map((w) => `-- ${w}`).join("\n")}\n\n${result.sql}`;
  }

  return result.sql;
}

// ============================================================================
// Sample SQL Generation
// ============================================================================

/**
 * Check if a node is a destination that can be used as a source (materialized view or view)
 */
function isDestinationAsSource(node: PipelineNode): boolean {
  return (
    node.data.category === "destination" &&
    (node.data.subtype === "materialized-view" || node.data.subtype === "view")
  );
}

/**
 * Get all upstream node IDs for a given node (including the node itself)
 * Uses BFS to traverse the graph backwards
 * Stops at materialized views/views when they're used as inputs (treats them as terminal sources)
 */
function getUpstreamNodeIds(
  targetNodeId: string,
  graph: NodeGraph
): Set<string> {
  const visited = new Set<string>();
  const queue = [targetNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = graph.nodes.get(nodeId);

    // If this is a destination node (MV/view) that's not the target, treat it as a terminal source
    // Don't traverse further upstream - we'll SELECT from the MV/view directly
    if (node && nodeId !== targetNodeId && isDestinationAsSource(node)) {
      continue;
    }

    const incoming = graph.incomingEdges.get(nodeId) || [];
    for (const edge of incoming) {
      if (!visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }

  return visited;
}

export interface SampleSQLResult {
  /** The generated SQL statement with LIMIT */
  sql: string;
  /** Nodes involved in the sample */
  nodeIds: string[];
  /** Non-fatal warnings during generation */
  warnings: string[];
  /** Fatal errors that prevented generation */
  errors: string[];
  /** Whether the result is valid and executable */
  isValid: boolean;
  /** Nodes with validation issues that block sampling */
  invalidNodes: { nodeId: string; label: string; issues: string[] }[];
}

/**
 * Validate a node for sampling - checks if all required fields are filled
 */
function validateNodeForSampling(node: PipelineNode): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  const { category, subtype, config } = node.data;

  // Check required fields based on node type
  switch (`${category}-${subtype}`) {
    case "source-table":
      if (!config.catalog) issues.push("Missing catalog");
      if (!config.schema) issues.push("Missing schema");
      if (!config.table) issues.push("Missing table");
      break;
    case "source-volume":
      if (!config.catalog) issues.push("Missing catalog");
      if (!config.schema) issues.push("Missing schema");
      if (!config.volume) issues.push("Missing volume");
      if (!config.path) issues.push("Missing file path");
      break;
    case "source-stream":
      if (!config.source) issues.push("Missing stream source");
      if (!config.topic) issues.push("Missing topic");
      break;
    case "transform-sql":
      if (!config.sql || (typeof config.sql === "string" && !config.sql.trim())) {
        issues.push("Missing SQL expression");
      }
      break;
    case "transform-filter":
      if (!config.condition || (typeof config.condition === "string" && !config.condition.trim())) {
        issues.push("Missing filter condition");
      }
      break;
    case "transform-join":
      const conditionGroups = config.conditionGroups as ConditionGroup[] | undefined;
      if (!conditionGroups || conditionGroups.length === 0) {
        issues.push("Missing join conditions");
      } else {
        const hasValidCondition = conditionGroups.some((group) =>
          group.conditions?.some(
            (cond) => cond.leftColumn?.trim() && cond.rightColumn?.trim()
          )
        );
        if (!hasValidCondition) {
          issues.push("Join conditions are incomplete");
        }
      }
      break;
    case "ai-inference":
      if (!config.modelEndpoint) issues.push("Missing model endpoint");
      if (!config.inputColumn) issues.push("Missing input column");
      if (!config.outputColumn) issues.push("Missing output column");
      break;
    case "ai-ai-parse":
      if (!config.inputColumn) issues.push("Missing input column");
      if (!config.outputColumn) issues.push("Missing output column");
      if (!config.parseType) issues.push("Missing parse type");
      break;
    // Destination nodes used as sources need catalog/schema/table configured
    case "destination-materialized-view":
    case "destination-view":
      if (!config.catalog) issues.push("Missing catalog");
      if (!config.schema) issues.push("Missing schema");
      if (!config.table) issues.push("Missing table/view name");
      break;
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Generate SQL for sampling data up to a specific node
 * Returns a SELECT statement with LIMIT for previewing data
 */
export function generateSampleSQL(
  targetNodeId: string,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  limit: number = 10
): SampleSQLResult {
  const result: SampleSQLResult = {
    sql: "",
    nodeIds: [],
    warnings: [],
    errors: [],
    isValid: true,
    invalidNodes: [],
  };

  // Validate inputs
  if (!nodes || nodes.length === 0) {
    result.errors.push("No nodes provided");
    result.isValid = false;
    return result;
  }

  // Find the target node
  const targetNode = nodes.find((n) => n.id === targetNodeId);
  if (!targetNode) {
    result.errors.push("Target node not found");
    result.isValid = false;
    return result;
  }

  // Special handling for materialized views and views - just SELECT directly from them
  if (
    targetNode.data.category === "destination" &&
    (targetNode.data.subtype === "materialized-view" || targetNode.data.subtype === "view")
  ) {
    const config = targetNode.data.config;
    const catalog = config.catalog as string | undefined;
    const schema = config.schema as string | undefined;
    const table = config.table as string | undefined;

    if (!catalog || !schema || !table) {
      result.errors.push("Materialized view/view must have catalog, schema, and name configured");
      result.isValid = false;
      return result;
    }

    const tableName = formatTableName(catalog, schema, table);
    // Apply column mapping if the destination has one
    const columns = generateColumnListFromNode(targetNode);
    result.sql = `SELECT ${columns} FROM ${tableName} LIMIT ${limit}`;
    result.nodeIds = [targetNodeId];
    return result;
  }

  // Build graph
  const graph = buildGraph(nodes, edges);

  // Check if target node exists
  if (!graph.nodes.has(targetNodeId)) {
    result.errors.push("Target node not found");
    result.isValid = false;
    return result;
  }

  // Get all upstream nodes including the target
  const upstreamNodeIds = getUpstreamNodeIds(targetNodeId, graph);
  result.nodeIds = Array.from(upstreamNodeIds);

  // Filter nodes to only include upstream ones
  const relevantNodes = nodes.filter((n) => upstreamNodeIds.has(n.id));

  // Validate all relevant nodes
  for (const node of relevantNodes) {
    // Skip the target node if it's a destination (handled separately above)
    // But validate destination nodes that are used as sources (not the target)
    if (node.data.category === "destination" && node.id === targetNodeId) {
      continue;
    }

    const validation = validateNodeForSampling(node);
    if (!validation.isValid) {
      result.invalidNodes.push({
        nodeId: node.id,
        label: node.data.label,
        issues: validation.issues,
      });
    }
  }

  // If any nodes are invalid, return error
  if (result.invalidNodes.length > 0) {
    result.errors.push(
      `Cannot sample: ${result.invalidNodes.length} node(s) have missing required fields`
    );
    result.isValid = false;
    return result;
  }

  // Check join nodes have proper inputs
  const joinNodes = relevantNodes.filter(
    (n) => n.data.category === "transform" && n.data.subtype === "join"
  );
  for (const join of joinNodes) {
    const incoming = edges.filter(
      (e) => e.target === join.id && upstreamNodeIds.has(e.source)
    );
    if (incoming.length < 2) {
      result.errors.push(
        `Join node "${join.data.label}" requires 2 inputs (has ${incoming.length})`
      );
      result.isValid = false;
    }
  }

  if (!result.isValid) {
    return result;
  }

  try {
    // Sort nodes topologically
    const sortedNodes = topologicalSort(graph).filter((n) =>
      upstreamNodeIds.has(n.id)
    );

    // Track CTE names for each node
    const nodeToCte = new Map<string, string>();
    const ctes: GeneratedCTE[] = [];
    const ctePrefix = "cte";

    // Generate CTEs for each relevant node
    for (const node of sortedNodes) {
      const { category, subtype } = node.data;

      // Generate CTE name (includes node ID for uniqueness)
      const cteName = generateCteName(node.data.label, node.id, ctePrefix);
      nodeToCte.set(node.id, cteName);

      // Get upstream CTE names
      const upstreamInfo = getUpstreamNodes(node.id, graph);
      const upstreamCteNames = upstreamInfo
        .map((u) => nodeToCte.get(u.nodeId))
        .filter(Boolean) as string[];

      // Generate SQL based on node type
      let cte: GeneratedCTE | null = null;

      switch (category) {
        case "source":
          switch (subtype) {
            case "table":
              cte = generateSourceTableSQL(node, cteName);
              break;
            case "volume":
              cte = generateSourceVolumeSQL(node, cteName);
              break;
            case "stream":
              cte = generateSourceStreamSQL(node, cteName);
              result.warnings.push(
                `Stream source "${node.data.label}" may not work with sample queries`
              );
              break;
          }
          break;

        case "transform":
          switch (subtype) {
            case "sql":
              cte = generateSQLTransformSQL(node, cteName, upstreamCteNames);
              break;
            case "filter":
              cte = generateFilterTransformSQL(node, cteName, upstreamCteNames);
              break;
            case "join":
              cte = generateJoinTransformSQL(
                node,
                cteName,
                upstreamCteNames,
                upstreamInfo
              );
              break;
            case "python":
              cte = generatePythonTransformSQL(node, cteName, upstreamCteNames);
              result.warnings.push(
                `Python transform "${node.data.label}" converted to passthrough for sampling`
              );
              break;
          }
          break;

        case "ai":
          switch (subtype) {
            case "inference":
              cte = generateAIInferenceSQL(node, cteName, upstreamCteNames);
              result.warnings.push(
                `AI inference "${node.data.label}" uses ai_query() - may not work in all environments`
              );
              break;
            case "ai-parse":
              cte = generateAIParseSQL(node, cteName, upstreamCteNames);
              result.warnings.push(
                `AI parse "${node.data.label}" uses ai_extract() - may not work in all environments`
              );
              break;
          }
          break;

        case "destination":
          // Handle destination nodes (MV/view) that are used as sources for downstream nodes
          if (isDestinationAsSource(node)) {
            cte = generateDestinationAsSourceSQL(node, cteName);
          }
          break;
      }

      if (cte) {
        ctes.push(cte);
      }
    }

    // Build the final SQL with LIMIT
    const sqlParts: string[] = [];

    // Add CTEs
    if (ctes.length > 0) {
      const cteParts = ctes.map((cte) => {
        return `${cte.name} AS (\n${indent(cte.sql)}\n)`;
      });

      sqlParts.push("WITH " + cteParts.join(",\n\n"));
    }

    // Select from the target node's CTE with optional LIMIT
    // The column mapping is already applied within the CTE, so SELECT * will return the correct columns
    // But we explicitly use SELECT * here since the CTE output already has the mapped columns
    const targetCteName = nodeToCte.get(targetNodeId);
    if (targetCteName) {
      // For source nodes, we use SELECT * since they don't have column mapping
      // For transform/AI nodes, the CTE already has the column mapping applied in its SELECT
      // When limit is 0, don't add LIMIT clause (used for preview/display purposes)
      const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
      sqlParts.push(`SELECT * FROM ${targetCteName}${limitClause}`);
    } else {
      result.errors.push("Could not generate CTE for target node");
      result.isValid = false;
      return result;
    }

    result.sql = sqlParts.join("\n\n");
  } catch (error) {
    result.errors.push(
      error instanceof Error ? error.message : "Unknown error during SQL generation"
    );
    result.isValid = false;
  }

  return result;
}

/**
 * Generate CREATE MATERIALIZED VIEW / CREATE VIEW SQL for a destination node
 * Uses the same upstream traversal logic as generateSampleSQL (stops at upstream MVs/views)
 * This is used for "Selected SQL" display when a destination node is selected
 */
export function generateDestinationSQL(
  targetNodeId: string,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  fireflyMetadata?: FireflyMetadata
): SampleSQLResult {
  const result: SampleSQLResult = {
    sql: "",
    nodeIds: [],
    warnings: [],
    errors: [],
    isValid: true,
    invalidNodes: [],
  };

  // Validate inputs
  if (!nodes || nodes.length === 0) {
    result.errors.push("No nodes provided");
    result.isValid = false;
    return result;
  }

  // Find the target node
  const targetNode = nodes.find((n) => n.id === targetNodeId);
  if (!targetNode) {
    result.errors.push("Target node not found");
    result.isValid = false;
    return result;
  }

  // This function only handles destination nodes (MV/view)
  if (targetNode.data.category !== "destination") {
    result.errors.push("Target node must be a destination");
    result.isValid = false;
    return result;
  }

  const isViewType =
    targetNode.data.subtype === "materialized-view" ||
    targetNode.data.subtype === "view";

  if (!isViewType) {
    result.errors.push("Only materialized views and views are supported");
    result.isValid = false;
    return result;
  }

  // Get destination config
  const config = targetNode.data.config;
  const catalog = config.catalog as string | undefined;
  const schema = config.schema as string | undefined;
  const table = config.table as string | undefined;

  if (!catalog || !schema || !table) {
    result.errors.push("Destination must have catalog, schema, and name configured");
    result.isValid = false;
    return result;
  }

  const tableName = formatTableName(catalog, schema, table);

  // Build graph
  const graph = buildGraph(nodes, edges);

  // Get all upstream nodes (stopping at other MVs/views)
  const upstreamNodeIds = getUpstreamNodeIds(targetNodeId, graph);
  result.nodeIds = Array.from(upstreamNodeIds);

  // Filter nodes to only include upstream ones (excluding the target destination)
  const relevantNodes = nodes.filter(
    (n) => upstreamNodeIds.has(n.id) && n.id !== targetNodeId
  );

  // Validate all relevant nodes
  for (const node of relevantNodes) {
    const validation = validateNodeForSampling(node);
    if (!validation.isValid) {
      result.invalidNodes.push({
        nodeId: node.id,
        label: node.data.label,
        issues: validation.issues,
      });
    }
  }

  // If any nodes are invalid, return error
  if (result.invalidNodes.length > 0) {
    result.errors.push(
      `Cannot generate SQL: ${result.invalidNodes.length} node(s) have missing required fields`
    );
    result.isValid = false;
    return result;
  }

  // Check join nodes have proper inputs
  const joinNodes = relevantNodes.filter(
    (n) => n.data.category === "transform" && n.data.subtype === "join"
  );
  for (const join of joinNodes) {
    const incoming = edges.filter(
      (e) => e.target === join.id && upstreamNodeIds.has(e.source)
    );
    if (incoming.length < 2) {
      result.errors.push(
        `Join node "${join.data.label}" requires 2 inputs (has ${incoming.length})`
      );
      result.isValid = false;
    }
  }

  if (!result.isValid) {
    return result;
  }

  try {
    // Sort nodes topologically (excluding the target destination)
    const sortedNodes = topologicalSort(graph).filter(
      (n) => upstreamNodeIds.has(n.id) && n.id !== targetNodeId
    );

    // Track CTE names for each node
    const nodeToCte = new Map<string, string>();
    const ctes: GeneratedCTE[] = [];
    const ctePrefix = "cte";

    // Generate CTEs for each relevant node
    for (const node of sortedNodes) {
      const { category, subtype } = node.data;

      // Generate CTE name (includes node ID for uniqueness)
      const cteName = generateCteName(node.data.label, node.id, ctePrefix);
      nodeToCte.set(node.id, cteName);

      // Get upstream CTE names
      const upstreamInfo = getUpstreamNodes(node.id, graph);
      const upstreamCteNames = upstreamInfo
        .map((u) => nodeToCte.get(u.nodeId))
        .filter(Boolean) as string[];

      // Generate SQL based on node type
      let cte: GeneratedCTE | null = null;

      switch (category) {
        case "source":
          switch (subtype) {
            case "table":
              cte = generateSourceTableSQL(node, cteName);
              break;
            case "volume":
              cte = generateSourceVolumeSQL(node, cteName);
              break;
            case "stream":
              cte = generateSourceStreamSQL(node, cteName);
              result.warnings.push(
                `Stream source "${node.data.label}" uses non-standard SQL syntax`
              );
              break;
          }
          break;

        case "transform":
          switch (subtype) {
            case "sql":
              cte = generateSQLTransformSQL(node, cteName, upstreamCteNames);
              break;
            case "filter":
              cte = generateFilterTransformSQL(node, cteName, upstreamCteNames);
              break;
            case "join":
              cte = generateJoinTransformSQL(
                node,
                cteName,
                upstreamCteNames,
                upstreamInfo
              );
              break;
            case "python":
              cte = generatePythonTransformSQL(node, cteName, upstreamCteNames);
              result.warnings.push(
                `Python transform "${node.data.label}" converted to passthrough`
              );
              break;
          }
          break;

        case "ai":
          switch (subtype) {
            case "inference":
              cte = generateAIInferenceSQL(node, cteName, upstreamCteNames);
              result.warnings.push(
                `AI inference "${node.data.label}" uses ai_query() function`
              );
              break;
            case "ai-parse":
              cte = generateAIParseSQL(node, cteName, upstreamCteNames);
              result.warnings.push(
                `AI parse "${node.data.label}" uses ai_extract() function`
              );
              break;
          }
          break;

        case "destination":
          // Handle upstream destination nodes (MV/view) as sources
          if (isDestinationAsSource(node)) {
            cte = generateDestinationAsSourceSQL(node, cteName);
          }
          break;
      }

      if (cte) {
        ctes.push(cte);
      }
    }

    // Find the upstream CTE for the destination
    const destUpstreamInfo = getUpstreamNodes(targetNodeId, graph);
    const upstreamCteName = destUpstreamInfo
      .map((u) => nodeToCte.get(u.nodeId))
      .filter(Boolean)[0];

    if (!upstreamCteName && relevantNodes.length > 0) {
      result.errors.push("Could not find upstream CTE for destination");
      result.isValid = false;
      return result;
    }

    // Generate column list from destination node's column mapping
    const columns = generateColumnListFromNode(targetNode);
    const selectQuery = upstreamCteName
      ? `SELECT ${columns} FROM ${upstreamCteName}`
      : `SELECT ${columns}`;

    // Build CTE clause
    let cteClause: string | undefined;
    if (ctes.length > 0) {
      const cteParts = ctes.map((cte) => {
        let cteSql = "";
        if (cte.comment) {
          cteSql += `-- ${cte.comment}\n`;
        }
        cteSql += `${cte.name} AS (\n${indent(cte.sql)}\n)`;
        return cteSql;
      });
      cteClause = "WITH " + cteParts.join(",\n\n");
    }

    // Generate the CREATE statement
    if (targetNode.data.subtype === "materialized-view") {
      const mvConfig = config as MaterializedViewConfig;
      result.sql = generateMaterializedViewSQL(tableName, selectQuery, mvConfig, {
        includeComments: true,
        cteClause,
        fireflyMetadata,
      });
    } else {
      result.sql = generateViewSQL(tableName, selectQuery, {
        includeComments: true,
        cteClause,
      });
    }
  } catch (error) {
    result.errors.push(
      error instanceof Error ? error.message : "Unknown error during SQL generation"
    );
    result.isValid = false;
  }

  return result;
}
