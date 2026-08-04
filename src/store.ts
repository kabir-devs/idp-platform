import { EventEmitter } from "events";
import { Deployment } from "./types";

class DeploymentStore {
  private deployments = new Map<string, Deployment>();
  public events = new EventEmitter();

  constructor() {
    // SSE streams can have many listeners across concurrently open dashboards
    this.events.setMaxListeners(200);
  }

  create(deployment: Deployment) {
    this.deployments.set(deployment.id, deployment);
    return deployment;
  }

  get(id: string) {
    return this.deployments.get(id);
  }

  list() {
    return Array.from(this.deployments.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  update(id: string, patch: Partial<Deployment>) {
    const existing = this.deployments.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.deployments.set(id, updated);
    return updated;
  }
}

export const store = new DeploymentStore();

