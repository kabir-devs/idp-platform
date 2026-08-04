# Internal Developer Platform

Submit `{ repo, language, environment }` and the platform provisions
everything else — a Kubernetes namespace, a container image build, a
deployment rollout, ingress + TLS routing, and monitoring dashboards —
streamed live to a console-style dashboard.

This is a **portfolio / demo build**: the Kubernetes, Docker, and
Grafana calls are simulated (realistic commands, timing, and generated
resource names) so the whole thing runs anywhere with just Node.js —
no cluster, registry, or cloud account required. The pipeline
orchestration, event streaming, and API/data model are real and are
built so the simulated steps can be swapped for real `kubectl`/Docker
SDK/Grafana API calls without changing the architecture.

## What it demonstrates

- **Platform API design** — a golden-path `POST /api/deployments`
  endpoint that takes minimal developer input and self-serves the rest.
- **Pipeline orchestration** — a sequential, resumable-shaped pipeline
  (namespace → build → deploy → ingress → monitoring → dashboard) with
  per-step status, logs, and timestamps.
- **Live progress streaming** — Server-Sent Events push step and log
  updates to the dashboard in real time (no polling).
- **Generated infra outputs** — namespace names, image tags, service
  URLs, ingress hosts, and dashboard links are derived per deployment,
  the way a real platform would report back what it built.

## Project layout

```
src/
  types.ts      shared types (Deployment, PipelineStep, ...)
  store.ts      in-memory deployment store + event bus
  pipeline.ts   the 6-stage automation pipeline (the "platform" logic)
  routes.ts     REST API (create, list, get, SSE stream)
  server.ts     Express app entrypoint
public/
  index.html    dashboard shell
  styles.css    console-style design system
  app.js        form handling, sidebar, live pipeline rail rendering
```

## Run it

```bash
npm install
npm run build
npm start
```

Or for live-reload development:

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**.

## API

| Method | Path                          | Description                          |
|--------|-------------------------------|---------------------------------------|
| POST   | `/api/deployments`            | Submit `{repo, language, environment}`, kicks off the pipeline |
| GET    | `/api/deployments`            | List all deployments                  |
| GET    | `/api/deployments/:id`        | Get one deployment's full state       |
| GET    | `/api/deployments/:id/stream` | SSE stream of live step/log updates   |

`language` accepts: `node`, `python`, `go`, `java`, `ruby`.
`environment` accepts: `development`, `staging`, `production`.

## Wiring in real infrastructure

Each stage lives in `src/pipeline.ts` as its own `runStep(...)` call.
To go from simulated to real:

- **namespace** → replace with `@kubernetes/client-node` (or shell out
  to `kubectl create namespace`) using a real kubeconfig.
- **build** → replace with `dockerode` or a shell-out to
  `docker build && docker push` against a real registry.
- **deploy** → apply a real Deployment/Service manifest via the
  Kubernetes API.
- **ingress** → apply an Ingress resource (and, if using cert-manager,
  a Certificate resource).
- **monitoring** → apply a Prometheus `ServiceMonitor` / scrape config.
- **dashboard** → call the Grafana HTTP API to provision a dashboard
  from a JSON template.

The event bus, API surface, and dashboard don't need to change — they
already treat each stage as an opaque async step that reports logs and
a final status.

