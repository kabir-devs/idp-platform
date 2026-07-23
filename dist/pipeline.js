"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STEP_DEFINITIONS = void 0;
exports.newDeploymentSkeleton = newDeploymentSkeleton;
exports.runPipeline = runPipeline;
const store_1 = require("./store");
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const slugify = (repo) => repo
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "app";
const shortSha = () => Math.random().toString(16).slice(2, 9);
const buildCommands = {
    node: ["npm ci", "npm run lint", "npm run build", "npm prune --production"],
    python: [
        "pip install -r requirements.txt",
        "python -m pytest -q",
        "python -m compileall .",
    ],
    go: ["go mod download", "go vet ./...", "go build -o bin/app ./..."],
    java: ["mvn -q -B dependency:resolve", "mvn -q -B test", "mvn -q -B package"],
    ruby: ["bundle install", "bundle exec rspec", "bundle exec rake assets:precompile"],
};
exports.STEP_DEFINITIONS = [
    { id: "namespace", name: "Provision namespace" },
    { id: "build", name: "Build container image" },
    { id: "deploy", name: "Deploy application" },
    { id: "ingress", name: "Configure ingress" },
    { id: "monitoring", name: "Generate monitoring" },
    { id: "dashboard", name: "Create dashboards" },
];
function newDeploymentSkeleton(id, repo, language, environment) {
    return {
        id,
        repo,
        language,
        environment,
        createdAt: Date.now(),
        status: "pending",
        steps: exports.STEP_DEFINITIONS.map((s) => ({
            id: s.id,
            name: s.name,
            status: "pending",
            logs: [],
        })),
        resources: {},
    };
}
function emitStep(deploymentId, step) {
    store_1.store.events.emit(deploymentId, {
        type: "step-update",
        deploymentId,
        step,
    });
}
function emitDeployment(deployment) {
    store_1.store.events.emit(deployment.id, {
        type: "deployment-update",
        deploymentId: deployment.id,
        deployment,
    });
}
async function runStep(deployment, stepId, logLines, durationMs) {
    const step = deployment.steps.find((s) => s.id === stepId);
    step.status = "running";
    step.startedAt = Date.now();
    emitStep(deployment.id, step);
    const perLine = durationMs / logLines.length;
    for (const line of logLines) {
        await sleep(perLine);
        step.logs.push(line);
        emitStep(deployment.id, step);
    }
    step.status = "success";
    step.finishedAt = Date.now();
    emitStep(deployment.id, step);
}
async function runPipeline(deploymentId) {
    const deployment = store_1.store.get(deploymentId);
    if (!deployment)
        return;
    deployment.status = "running";
    emitDeployment(deployment);
    const slug = slugify(deployment.repo);
    const namespace = `${slug}-${deployment.environment}`;
    const tag = shortSha();
    const image = `registry.internal.io/${slug}:${tag}`;
    const replicas = deployment.environment === "production" ? 3 : 1;
    const ingressHost = `${slug}-${deployment.environment}.apps.internal.io`;
    const dashboardUrl = `/grafana/d/${slug}-${deployment.environment}`;
    const monitoringEndpoint = `http://${namespace}.svc.cluster.local:9090/metrics`;
    try {
        await runStep(deployment, "namespace", [
            `kubectl create namespace ${namespace}`,
            `applying resourcequota: cpu=4, memory=8Gi`,
            `applying networkpolicy: default-deny-ingress`,
            `labeling namespace team=platform env=${deployment.environment}`,
            `namespace ${namespace} is Active`,
        ], 1800);
        deployment.resources.namespace = namespace;
        emitDeployment(deployment);
        await runStep(deployment, "build", [
            `cloning ${deployment.repo}`,
            `detected language: ${deployment.language}`,
            ...buildCommands[deployment.language],
            `docker build -t ${image} .`,
            `pushing ${image}`,
            `image pushed: ${image}`,
        ], 2600);
        deployment.resources.image = image;
        emitDeployment(deployment);
        await runStep(deployment, "deploy", [
            `applying deployment/${slug} in ${namespace}`,
            `setting image ${image}`,
            `scaling to ${replicas} replica(s)`,
            `waiting for rollout to finish...`,
            `deployment "${slug}" successfully rolled out`,
            `applying service/${slug} (ClusterIP)`,
        ], 2200);
        deployment.resources.replicas = replicas;
        deployment.resources.serviceUrl = `http://${slug}.${namespace}.svc.cluster.local`;
        emitDeployment(deployment);
        await runStep(deployment, "ingress", [
            `applying ingress/${slug}`,
            `requesting TLS certificate for ${ingressHost}`,
            `certificate issued`,
            `routing ${ingressHost} -> ${slug}.${namespace}.svc.cluster.local`,
            `ingress admitted`,
        ], 1600);
        deployment.resources.ingressHost = ingressHost;
        emitDeployment(deployment);
        await runStep(deployment, "monitoring", [
            `registering scrape target ${namespace}/${slug}`,
            `applying servicemonitor/${slug}`,
            `configuring default alerts: high-error-rate, high-latency, pod-restarts`,
            `metrics endpoint live: ${monitoringEndpoint}`,
        ], 1400);
        deployment.resources.monitoringEndpoint = monitoringEndpoint;
        emitDeployment(deployment);
        await runStep(deployment, "dashboard", [
            `generating Grafana dashboard from template: service-overview`,
            `provisioning panels: latency, error rate, cpu, memory, replica count`,
            `publishing dashboard ${dashboardUrl}`,
            `dashboard ready`,
        ], 1200);
        deployment.resources.dashboardUrl = dashboardUrl;
        deployment.status = "success";
        emitDeployment(deployment);
    }
    catch (err) {
        deployment.status = "failed";
        emitDeployment(deployment);
    }
}
