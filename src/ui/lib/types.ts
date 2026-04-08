export const PIPELINE_STAGES = [
  "Wishlist",
  "Applied",
  "Phone Screen",
  "Interview Loop",
  "Offer",
  "Rejected",
  "Archived",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface JobApplicationInput {
  url: string;
  company: string;
  title: string;
  location: string;
  salary: string | null;
  appliedDate: number;
  status: string;
  source: string;
  notes: string;
  tags: string[];
  confidence: number | null;
}

export interface JobApplication extends JobApplicationInput {
  id: number;
  createdAt: number;
  lastUpdated: number;
}

export interface CountBucket {
  label: string;
  total: number;
}

export interface DashboardMetrics {
  totalApplications: number;
  activePipeline: number;
  appliedThisWeek: number;
  responseRate: number;
  staleCount: number;
  stageBreakdown: CountBucket[];
  sourceBreakdown: CountBucket[];
  insight: string;
}
