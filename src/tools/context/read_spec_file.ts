import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { ServerConfig } from "../../config.js";
import { expandSpecTexts } from "../../spec_texts.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "read_spec_file",
    "Read the contents of a screen or component spec file. Prose fields " +
      "(description / notes / intent) written as {\"md\": \"key\"} live in a " +
      "YAML texts file (<name>.texts.yaml beside the spec, or " +
      "{\"md\": \"file.texts.yaml#key\"}); they are returned expanded as " +
      "{\"md\": ..., \"text\": ...} — edit the text in the YAML file, not " +
      "here. A spec without such references is returned byte-for-byte.",
    {
      file: z.string().describe("Filename (e.g., 'login.spec.json' or 'my_card.component.json')"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async ({ file, project_dir }) => {
      try {
        const projectDir = config.resolveProjectDir(project_dir);
        const projectConfig = config.readProjectConfig(projectDir);

        const isComponent = file.endsWith(".component.json");
        const dirField = isComponent ? "component_spec_directory" : "spec_directory";
        const baseDir = config.resolveDir(projectConfig, dirField, projectDir);
        const filePath = join(baseDir, file);

        config.validatePathInProject(filePath, projectDir);

        if (!existsSync(filePath)) {
          return { content: [{ type: "text", text: `File not found: ${filePath}` }] };
        }

        const content = readFileSync(filePath, "utf-8");
        // Only a spec that uses texts references is re-serialised; every
        // other spec comes back exactly as it is on disk.
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          return { content: [{ type: "text", text: content }] };
        }
        const texts = expandSpecTexts(parsed, filePath);
        if (texts.found === 0) {
          return { content: [{ type: "text", text: content }] };
        }
        const blocks = [{ type: "text" as const, text: JSON.stringify(texts.data, null, 2) }];
        const summary =
          `texts: ${texts.expanded}/${texts.found} reference(s) expanded as ` +
          `{"md", "text"} from ${texts.files.join(", ") || "(no file read)"} — ` +
          `the "text" key is for reading only; edit the YAML file.`;
        const problems = texts.problems.length
          ? "\nunresolved (run jsonui-doc validate spec for the full check):\n" +
            texts.problems.map((p) => `  - ${p}`).join("\n")
          : "";
        blocks.push({ type: "text" as const, text: summary + problems });
        return { content: blocks };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }] };
      }
    }
  );
}
