import { config } from "./config";
import { logger } from "./logger";
import { buildApp } from "./app";

const { app } = await buildApp();

try {
  await app.listen({ host: "0.0.0.0", port: config.port });
  logger.info("server started", {
    port: config.port,
    clientOrigin: config.clientOrigin,
    databasePath: config.databasePath
  });
} catch (error) {
  logger.error("server failed to start", {
    error: error instanceof Error ? error.message : "Unknown startup error"
  });
  process.exit(1);
}
