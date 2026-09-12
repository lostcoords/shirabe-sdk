import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: process.env.SHIRABE_OPENAPI_INPUT ?? "../../openapi/dist/shirabe.bundled.yaml",
  output: {
    path: process.env.SHIRABE_OPENAPI_OUTPUT ?? "src/generated",
    module: { extension: ".js" },
  },
});
