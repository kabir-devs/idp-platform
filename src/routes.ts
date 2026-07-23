import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { store } from "./store";
import { newDeploymentSkeleton, runPipeline } from "./pipeline";
import { DeploymentRequest, Environment, Language } from "./types";

const router = Router();

const VALID_LANGUAGES: Language[] = ["node", "python", "go", "java", "ruby"];
const VALID_ENVS: Environment[] = ["development", "staging", "production"];

router.post("/deployments", (req: Request, res: Response) => {
  const body = req.body as Partial<DeploymentRequest>;
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

  const id = uuid();
  const deployment = newDeploymentSkeleton(id, repo, language, environment);
  store.create(deployment);

  // Fire and forget: pipeline runs asynchronously, progress goes out over SSE.
  runPipeline(id);

  res.status(201).json(deployment);
});

router.get("/deployments", (_req: Request, res: Response) => {
  res.json(store.list());
});

router.get("/deployments/:id", (req: Request, res: Response) => {
  const deployment = store.get(req.params.id);
  if (!deployment) return res.status(404).json({ error: "not found" });
  res.json(deployment);
});

router.get("/deployments/:id/stream", (req: Request, res: Response) => {
  const { id } = req.params;
  const deployment = store.get(id);
  if (!deployment) return res.status(404).json({ error: "not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: "deployment-update", deployment })}\n\n`);

  const listener = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  store.events.on(id, listener);

  req.on("close", () => {
    store.events.off(id, listener);
  });
});

export default router;
