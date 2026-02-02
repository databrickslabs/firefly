"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PipelineActionsDropdown } from "./pipeline-actions-dropdown";
import type { PipelineListItem } from "./types";

// Simple relative time formatter
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
  if (diffWeek < 4) return `${diffWeek} week${diffWeek !== 1 ? "s" : ""} ago`;
  if (diffMonth < 12) return `${diffMonth} month${diffMonth !== 1 ? "s" : ""} ago`;

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface PipelinesTableProps {
  pipelines: PipelineListItem[];
  onEdit: (pipelineId: string) => void;
  onShare: (pipeline: PipelineListItem) => void;
  onClone: (pipelineId: string) => void;
  onDelete: (pipelineId: string) => void;
  onRename: (pipelineId: string, newName: string) => Promise<void>;
}

function getAccessBadge(pipeline: PipelineListItem) {
  if (pipeline.accessType === 'owner') {
    return <Badge variant="default">Owner</Badge>;
  }

  switch (pipeline.permissionLevel) {
    case 'CAN_EDIT':
      return <Badge variant="secondary">Can Edit</Badge>;
    case 'CAN_RUN':
      return <Badge variant="secondary">Can Run</Badge>;
    case 'CAN_READ':
    default:
      return <Badge variant="outline">Can Read</Badge>;
  }
}

export function PipelinesTable({
  pipelines,
  onEdit,
  onShare,
  onClone,
  onDelete,
  onRename,
}: PipelinesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Last Updated</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pipelines.map((pipeline) => (
          <TableRow
            key={pipeline.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onEdit(pipeline.id)}
          >
            <TableCell>
              <div>
                <div className="font-medium">{pipeline.name}</div>
                {pipeline.description && (
                  <div className="text-sm text-muted-foreground truncate max-w-[300px]">
                    {pipeline.description}
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell>
              <div className="text-sm">
                {pipeline.creatorName}
                <div className="text-xs text-muted-foreground">
                  {pipeline.creatorEmail}
                </div>
              </div>
            </TableCell>
            <TableCell>{getAccessBadge(pipeline)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatTimeAgo(new Date(pipeline.updatedAt))}
            </TableCell>
            <TableCell>
              <PipelineActionsDropdown
                pipeline={pipeline}
                onEdit={() => onEdit(pipeline.id)}
                onShare={() => onShare(pipeline)}
                onClone={() => onClone(pipeline.id)}
                onDelete={() => onDelete(pipeline.id)}
                onRename={(newName) => onRename(pipeline.id, newName)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
