"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.store = void 0;
const events_1 = require("events");
class DeploymentStore {
    constructor() {
        this.deployments = new Map();
        this.events = new events_1.EventEmitter();
        // SSE streams can have many listeners across concurrently open dashboards
        this.events.setMaxListeners(200);
    }
    create(deployment) {
        this.deployments.set(deployment.id, deployment);
        return deployment;
    }
    get(id) {
        return this.deployments.get(id);
    }
    list() {
        return Array.from(this.deployments.values()).sort((a, b) => b.createdAt - a.createdAt);
    }
    update(id, patch) {
        const existing = this.deployments.get(id);
        if (!existing)
            return undefined;
        const updated = { ...existing, ...patch };
        this.deployments.set(id, updated);
        return updated;
    }
}
exports.store = new DeploymentStore();
