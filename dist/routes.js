"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const store_1 = require("./store");
const pipeline_1 = require("./pipeline");
const router = (0, express_1.Router)();
const VALID_LANGUAGES = ["node", "python", "go", "java", "ruby"];
const VALID_ENVS = ["development", "staging", "production"];
router.post("/deployments", (req, res) => {
    const body = req.body;
    const repo = (body.repo || "").trim();
    const language = body.language;
    const environment = body.environment;
    if (!repo) {
        return res.status(400).json({ error: "repo is required" });
    }
    if (!language || !VALID_LANGUAGES.includes(language)) {
        return res
            .status(400)
            .json({ error: `language must be one of: ${VALID_LANGUAGES.join(", ")}` });
    }
    if (!environment || !VALID_ENVS.includes(environment)) {
        return res
            .status(400)
            .json({ error: `environment must be one of: ${VALID_ENVS.join(", ")}` });
    }
    const id = (0, uuid_1.v4)();
    const deployment = (0, pipeline_1.newDeploymentSkeleton)(id, repo, language, environment);
    store_1.store.create(deployment);
    // Fire and forget: pipeline runs asynchronously, progress goes out over SSE.
    (0, pipeline_1.runPipeline)(id);
    res.status(201).json(deployment);
});
router.get("/deployments", (_req, res) => {
    res.json(store_1.store.list());
});
router.get("/deployments/:id", (req, res) => {
    const deployment = store_1.store.get(req.params.id);
    if (!deployment)
        return res.status(404).json({ error: "not found" });
    res.json(deployment);
});
router.get("/deployments/:id/stream", (req, res) => {
    const { id } = req.params;
    const deployment = store_1.store.get(id);
    if (!deployment)
        return res.status(404).json({ error: "not found" });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: "deployment-update", deployment })}\n\n`);
    const listener = (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    store_1.store.events.on(id, listener);
    req.on("close", () => {
        store_1.store.events.off(id, listener);
    });
});
exports.default = router;

