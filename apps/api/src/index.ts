import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });
dotenv.config({ path: path.resolve(here, "../../../.env") });

const port = Number(process.env.API_PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`api listening on ${port}`);
});
