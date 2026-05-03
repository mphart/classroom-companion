import http from "node:http";

import { createApp } from "./app";
import { MySqlRepository } from "./repositories/mysqlRepository";
import { attachTranscriptionWss } from "./transcription/registerTranscriptionWss";

const port = Number(process.env.PORT ?? 4000);

async function start() {
  const repo = MySqlRepository.fromEnv();
  await repo.ensureGeneratedPracticeExamEnum();

  const app = createApp(repo);
  const server = http.createServer(app);

  attachTranscriptionWss(server);

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on port ${port} (HTTP + /transcription/stream WebSocket)`);
  });
}

void start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
