export type Environment = "development" | "staging" | "production";

export type Language = "node" | "python" | "go" | "java" | "ruby";

export type StepStatus = "pending" | "running" | "success" | "failed";

export type DeploymentStatus = "pending" | "running" | "success" | "failed";

export interface PipelineStep {
  id: string;
  name: string;
  status: StepStatus;
  logs: string[];
  startedAt?: number;
  finishedAt?: number;
}

export interface DeploymentResources {
  namespace?: string;
  image?: string;
  serviceUrl?: string;
  ingressHost?: string;
  dashboardUrl?: string;
  monitoringEndpoint?: string;
  replicas?: number;
}

export interface Deployment {
  id: string;
  repo: string;
  language: Language;
  environment: Environment;
  createdAt: number;
  status: DeploymentStatus;
  steps: PipelineStep[];
  resources: DeploymentResources;
}

export interface DeploymentRequest {
  repo: string;
  language: Language;
  environment: Environment;
}

export interface StreamEvent {
  type: "step-update" | "log" | "deployment-update";
  deploymentId: string;
  step?: PipelineStep;
  log?: string;
  deployment?: Deployment;
}
