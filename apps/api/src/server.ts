import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { env } from "./env.js";
import { registerInventoryRoutes } from "./routes/inventory.js";
import { registerBagOrderRoutes } from "./routes/bagOrders.js";
import { registerStreamRoutes } from "./routes/streams.js";
import { registerSpotRoutes } from "./routes/spot.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOpsRoutes } from "./routes/ops.js";

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
await registerStreamRoutes(app);
await registerSpotRoutes(app);
await registerAuthRoutes(app);
await registerOpsRoutes(app);

app.setErrorHandler((error, _req, reply) => {
  app.log.error(error);
  const message = error instanceof Error ? error.message : "Unhandled error";
  reply.status(500).send({ error: message });
});

app.listen({ host: "0.0.0.0", port: env.port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
