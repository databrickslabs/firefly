import type { NodeCategory, NodeSubtype, PipelineNodeData } from "@/stores/pipeline-store";

/**
 * Field requirement definition
 */
export interface FieldRequirement {
  /** The path to the field in the config object (e.g., "catalog", "conditionGroups[0].conditions[0].leftColumn") */
  path: string;
  /** Human-readable label for the field */
  label: string;
  /** Optional custom validation function */
  validate?: (value: unknown, config: Record<string, unknown>) => boolean;
}

/**
 * Validation result for a single field
 */
export interface FieldValidationResult {
  path: string;
  label: string;
  isValid: boolean;
}

/**
 * Complete validation result for a node
 */
export interface NodeValidationResult {
  isValid: boolean;
  missingFields: FieldValidationResult[];
  totalRequired: number;
  filledRequired: number;
}

/**
 * Required fields for each node type
 */
const nodeRequiredFields: Record<string, FieldRequirement[]> = {
  // Sources
  "source-table": [
    { path: "catalog", label: "Catalog" },
    { path: "schema", label: "Schema" },
    { path: "table", label: "Table" },
  ],
  "source-volume": [
    { path: "catalog", label: "Catalog" },
    { path: "schema", label: "Schema" },
    { path: "volume", label: "Volume" },
    { path: "path", label: "File Path" },
  ],
  "source-stream": [
    { path: "source", label: "Stream Source" },
    { path: "topic", label: "Topic/Path" },
  ],
  // Transforms
  "transform-sql": [
    { path: "sql", label: "SQL Expression" },
  ],
  "transform-python": [
    { path: "python", label: "Python Code" },
  ],
  "transform-join": [
    {
      path: "conditionGroups",
      label: "Join Conditions",
      validate: (value) => {
        if (!Array.isArray(value) || value.length === 0) return false;
        // Check that at least one condition has both columns filled
        return value.some((group: { conditions?: Array<{ leftColumn?: string; rightColumn?: string }> }) =>
          group.conditions?.some(
            (cond) => cond.leftColumn?.trim() && cond.rightColumn?.trim()
          )
        );
      },
    },
  ],
  "transform-filter": [
    { path: "condition", label: "Filter Condition" },
  ],
  // AI/ML
  "ai-inference": [
    { path: "modelEndpoint", label: "Model Endpoint" },
    { path: "inputColumn", label: "Input Column" },
    { path: "outputColumn", label: "Output Column" },
  ],
  "ai-ai-parse": [
    { path: "inputColumn", label: "Input Column" },
    { path: "outputColumn", label: "Output Column" },
    { path: "parseType", label: "Parse Type" },
  ],
  // Destinations
  "destination-delta": [
    { path: "catalog", label: "Catalog" },
    { path: "schema", label: "Schema" },
    { path: "table", label: "Table" },
  ],
  "destination-streaming": [
    { path: "catalog", label: "Catalog" },
    { path: "schema", label: "Schema" },
    { path: "table", label: "Table" },
  ],
};

/**
 * Get the value at a path in an object
 * Supports dot notation (e.g., "a.b.c") and array indices (e.g., "a[0].b")
 */
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Check if a value is considered "filled" (not empty)
 */
function isValueFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * Get required fields for a node type
 */
export function getRequiredFields(
  category: NodeCategory,
  subtype: NodeSubtype
): FieldRequirement[] {
  const key = `${category}-${subtype}`;
  return nodeRequiredFields[key] || [];
}

/**
 * Validate a node's configuration against its required fields
 */
export function validateNode(data: PipelineNodeData): NodeValidationResult {
  const { category, subtype, config } = data;
  const requiredFields = getRequiredFields(category, subtype);

  const missingFields: FieldValidationResult[] = [];
  let filledRequired = 0;

  for (const field of requiredFields) {
    const value = getValueAtPath(config, field.path);
    let isValid: boolean;

    if (field.validate) {
      isValid = field.validate(value, config);
    } else {
      isValid = isValueFilled(value);
    }

    if (isValid) {
      filledRequired++;
    } else {
      missingFields.push({
        path: field.path,
        label: field.label,
        isValid: false,
      });
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    totalRequired: requiredFields.length,
    filledRequired,
  };
}

/**
 * Check if a specific field is required for a node type
 */
export function isFieldRequired(
  category: NodeCategory,
  subtype: NodeSubtype,
  fieldPath: string
): boolean {
  const requiredFields = getRequiredFields(category, subtype);
  return requiredFields.some((f) => f.path === fieldPath);
}

/**
 * Get the label for a required field
 */
export function getFieldLabel(
  category: NodeCategory,
  subtype: NodeSubtype,
  fieldPath: string
): string | undefined {
  const requiredFields = getRequiredFields(category, subtype);
  const field = requiredFields.find((f) => f.path === fieldPath);
  return field?.label;
}
