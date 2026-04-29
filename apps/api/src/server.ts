import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import { env } from "./env.js";
import { registerInventoryRoutes } from "./routes/inventory.js";
import { registerBagOrderRoutes } from "./routes/bagOrders.js";
import { registerBreakRoutes } from "./routes/breaks.js";
import { registerStreamRoutes } from "./routes/streams.js";
import { registerSpotRoutes } from "./routes/spot.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOpsRoutes } from "./routes/ops.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: env.corsOrigin, credentials: true });
await app.register(sensible);

app.get("/health", async () => ({ ok: true }));
app.get("/metrics", async () => ({
  service: "gold-api",
  uptimeSeconds: process.uptime(),
  timestamp: new Date().toISOString()
}));

await registerInventoryRoutes(app);
await registerBagOrderRoutes(app);
await registerBreakRoutes(app);
await registerStreamRoutes(app);
await registerSpotRoutes(app);
await registerAuthRoutes(app);
await registerOpsRoutes(app);
await registerAdminRoutes(app);
await registerDashboardRoutes(app);

app.setErrorHandler((error, _req, reply) => {
  app.log.error(error);
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return reply.status(400).send({ error: first?.message ?? "Validation failed" });
  }
  const message = error instanceof Error ? error.message : "Unhandled error";
  if (message === "Unauthorized") return reply.status(401).send({ error: message });
  if (message === "Forbidden") return reply.status(403).send({ error: message });
  if (message.includes("Invalid credentials")) return reply.status(401).send({ error: message });
  if (message === "Account deactivated") return reply.status(401).send({ error: message });
  if (message === "No app access") return reply.status(403).send({ error: message });
  if (message === "Email already exists") return reply.status(409).send({ error: message });
  if (
    message === "Email is required when login is enabled" ||
    message === "Password is required when login is enabled" ||
    message === "Display name is required for users without login"
  ) {
    return reply.status(400).send({ error: message });
  }
  if (message === "Stream not found") return reply.status(404).send({ error: message });
  const statusCode = (error as FastifyError).statusCode;
  if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
    return reply.status(statusCode).send({ error: message });
  }
  reply.status(500).send({ error: message });
});

app.listen({ host: "0.0.0.0", port: env.port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
