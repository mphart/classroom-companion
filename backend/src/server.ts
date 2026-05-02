import { createApp } from "./app";
import { MySqlRepository } from "./repositories/mysqlRepository";

const port = Number(process.env.PORT ?? 4000);
const app = createApp(MySqlRepository.fromEnv());

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${port}`);
});
