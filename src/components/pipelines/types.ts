export interface PipelineListItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  creatorName: string;
  creatorEmail: string;
  accessType: 'owner' | 'shared';
  permissionLevel: string | null; // CAN_READ, CAN_EDIT, CAN_RUN for shared pipelines
}

export interface PipelineShareInfo {
  id: string;
  permissionLevel: string;
  createdAt: string;
  updatedAt: string;
  sharedWithUserId: string;
  sharedWithEmail: string;
  sharedWithName: string;
}

export type PipelinePermissionLevel = 'CAN_READ' | 'CAN_EDIT' | 'CAN_RUN';
