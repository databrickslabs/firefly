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

export interface PipelineNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data: {
    label: string;
    category: "source" | "transform" | "ai" | "destination";
    subtype: string;
    config: Record<string, unknown>;
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

// ============================================================================
// Graph Operations
// ============================================================================

interface NodeGraph {
  nodes: Map<string, PipelineNode>;
  edges: PipelineEdge[];
  incomingEdges: Map<string, PipelineEdge[]>;
  outgoingEdges: Map<string, PipelineEdge[]>;
}

/**
 * Build a graph structure from nodes and edges
 */
function buildGraph(nodes: PipelineNode[], edges: PipelineEdge[]): NodeGraph {
  const nodeMap = new Map<string, PipelineNode>();
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
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      incomingEdges.get(edge.target)?.push(edge);
      outgoingEdges.get(edge.source)?.push(edge);
    }
  }

  return { nodes: nodeMap, edges, incomingEdges, outgoingEdges };
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
 * Get upstream node IDs for a given node
 */
function getUpstreamNodes(
  nodeId: string,
  graph: NodeGraph
): { nodeId: string; handle?: string | null }[] {
  const incoming = graph.incomingEdges.get(nodeId) || [];
  return incoming.map((edge) => ({
    nodeId: edge.source,
    handle: edge.targetHandle,
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

  return {
    name: cteName,
    sql: `SELECT * FROM ${tableName}`,
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

  // Streaming sources typically need special handling
  // This generates a placeholder that would work with streaming tables
  return {
    name: cteName,
    sql: `SELECT * FROM STREAM('${source}', '${topic}')`,
    comment,
  };
}

/**
 * Generate SQL for a SQL transform node
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

  return {
    name: cteName,
    sql: `SELECT * FROM ${upstream} WHERE ${condition}`,
    comment: `Filter: ${condition}`,
  };
}

/**
 * Generate SQL for a join transform node
 * Uses table aliases (a, b) to avoid ambiguous column references
 */
function generateJoinTransformSQL(
  node: PipelineNode,
  cteName: string,
  upstreamCteNames: string[],
  upstreamHandles: { nodeId: string; handle?: string | null }[]
): GeneratedCTE {
  const config = node.data.config;
  const joinType = ((config.joinType as string) || "inner").toUpperCase();
  const conditionGroups = config.conditionGroups as ConditionGroup[] | undefined;

  // Determine left and right tables based on handles or order
  let leftTable = upstreamCteNames[0] || "left_source";
  let rightTable = upstreamCteNames[1] || "right_source";

  // If handles are specified, use them to determine order
  for (let i = 0; i < upstreamHandles.length; i++) {
    if (upstreamHandles[i].handle === "input-a") {
      leftTable = upstreamCteNames[i];
    } else if (upstreamHandles[i].handle === "input-b") {
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

  return {
    name: cteName,
    sql: `SELECT * FROM ${leftTable} ${leftAlias} ${sqlJoinType} ${rightTable} ${rightAlias} ON ${joinCondition}`,
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

  // Python transforms can't be directly converted to SQL
  // Generate a passthrough with a comment
  return {
    name: cteName,
    sql: `SELECT * FROM ${upstream}`,
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

  // AI inference requires UDF - generate a placeholder
  return {
    name: cteName,
    sql: `SELECT *, ai_query('${modelEndpoint}', ${inputColumn}) AS ${outputColumn} FROM ${upstream}`,
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

  return {
    name: cteName,
    sql: `SELECT *, ai_extract('${parseType}', ${inputColumn}) AS ${outputColumn} FROM ${upstream}`,
    comment: `AI Parse (${parseType}): ${inputColumn} -> ${outputColumn}`,
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

    // Add CTEs
    if (ctes.length > 0) {
      const cteParts = ctes.map((cte) => {
        let cteSql = "";
        if (includeComments && cte.comment) {
          cteSql += `-- ${cte.comment}\n`;
        }
        cteSql += `${cte.name} AS (\n${indent(cte.sql)}\n)`;
        return cteSql;
      });

      sqlParts.push("WITH " + cteParts.join(",\n\n"));
    }

    // Handle destinations
    if (destinations.length === 0) {
      // No destination - just select from the last CTE
      if (ctes.length > 0) {
        const lastCte = ctes[ctes.length - 1];
        sqlParts.push(`SELECT * FROM ${lastCte.name}`);
      }
    } else {
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

        if (includeComments) {
          sqlParts.push(`-- Destination: ${tableName}`);
        }

        switch (destinationMode) {
          case "create":
            sqlParts.push(
              `CREATE OR REPLACE TABLE ${tableName} AS\nSELECT * FROM ${upstreamCte}`
            );
            break;
          case "insert":
            sqlParts.push(
              `INSERT INTO ${tableName}\nSELECT * FROM ${upstreamCte}`
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
                `INSERT INTO ${tableName}\nSELECT * FROM ${upstreamCte}`
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
 * Get all upstream node IDs for a given node (including the node itself)
 * Uses BFS to traverse the graph backwards
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
    // Skip destination nodes - they shouldn't be in the sample path
    if (node.data.category === "destination") continue;

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

      // Skip destination nodes
      if (category === "destination") continue;

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

    // Select from the target node's CTE with LIMIT
    const targetCteName = nodeToCte.get(targetNodeId);
    if (targetCteName) {
      sqlParts.push(`SELECT * FROM ${targetCteName} LIMIT ${limit}`);
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
