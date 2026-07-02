/**
 * Shared fixtures and harnesses for the MCP server test suite.
 *
 * Everything here is hermetic: fixture datasets are written to fresh temp
 * directories, and the tool harness invokes tool handlers directly (after
 * emulating the SDK-side Zod validation) without opening any transport.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { z, type ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ----- temp dirs ----------------------------------------------------------

const createdDirs: string[] = [];

/** Create a throwaway temp directory, tracked for cleanupTempDirs(). */
export function makeTempDir(label = "fixture"): string {
  const dir = mkdtempSync(join(tmpdir(), `jui-mcp-test-${label}-`));
  createdDirs.push(dir);
  return dir;
}

/** Remove every directory created via makeTempDir() (call in afterEach/afterAll). */
export function cleanupTempDirs(): void {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
}

export function writeJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ----- fixture jsonui-cli dataset ----------------------------------------

/**
 * Minimal but representative attribute_definitions.json:
 *   - `_comment` top-level key (must be skipped)
 *   - `common` section with `_meta` (skipped), categorized + uncategorized keys
 *   - Label: binding attr WITHOUT binding_direction  -> read-only
 *   - TextField: binding attr WITH binding_direction -> two-way
 *   - Button: no binding attrs, no metadata entry     -> default metadata
 */
export const FIXTURE_ATTRIBUTE_DEFINITIONS = {
  _comment: "test fixture — not real data",
  common: {
    _meta: { version: "0.0.1" },
    width: { type: ["string", "int"], description: "View width" },
    padding: { type: "int", description: "Inner padding" },
    background: { type: "string", description: "Background color" },
    onClick: { type: "binding", description: "Tap handler binding" },
    glowIntensity: { type: "float", description: "Uncategorized zebra attribute" },
  },
  Label: {
    _internal: { note: "must be skipped" },
    text: { type: ["string", "binding"], description: "Text content" },
    fontSize: { type: "int", description: "Font size in points" },
  },
  TextField: {
    text: {
      type: ["string", "binding"],
      description: "Text content (two-way)",
      binding_direction: "two-way",
    },
    hint: { type: "string", description: "Placeholder hint" },
  },
  Button: {
    onclick: { type: "string", description: "Selector-format tap handler" },
    enabled: { type: ["boolean", "binding"], description: "Enabled state" },
  },
};

export const FIXTURE_COMPONENT_METADATA = {
  _description: "test fixture metadata",
  _schema: { version: 1 },
  Label: {
    description: "Text display component",
    aliases: ["Text"],
    platforms: { react: false },
    platformSpecific: { swift: { renderer: "SwiftUI Text" } },
    rules: ["Prefer fontColor over textColor"],
  },
  TextField: {
    description: "Single-line text input",
    aliases: ["EditText", "Input"],
  },
  // Button intentionally absent -> DEFAULT_METADATA path
};

export interface CliDatasetOptions {
  attributeDefinitions?: unknown;
  componentMetadata?: unknown;
  /** Skip writing attribute_definitions.json (to test per-file fallback). */
  omitAttributeDefinitions?: boolean;
  /** Skip writing component_metadata.json (to test per-file fallback). */
  omitComponentMetadata?: boolean;
}

/** Write a fixture jsonui-cli checkout layout: <root>/shared/core/*.json */
export function makeCliDataset(root: string, opts: CliDatasetOptions = {}): void {
  const core = join(root, "shared", "core");
  if (!opts.omitAttributeDefinitions) {
    writeJson(
      join(core, "attribute_definitions.json"),
      opts.attributeDefinitions ?? FIXTURE_ATTRIBUTE_DEFINITIONS
    );
  }
  if (!opts.omitComponentMetadata) {
    writeJson(
      join(core, "component_metadata.json"),
      opts.componentMetadata ?? FIXTURE_COMPONENT_METADATA
    );
  }
}

/** Write a fixture bundled snapshot layout: <mcpRoot>/data/*.json */
export function makeBundledDataset(root: string, opts: CliDatasetOptions = {}): void {
  const dataDir = join(root, "data");
  if (!opts.omitAttributeDefinitions) {
    writeJson(
      join(dataDir, "attribute_definitions.json"),
      opts.attributeDefinitions ?? FIXTURE_ATTRIBUTE_DEFINITIONS
    );
  }
  if (!opts.omitComponentMetadata) {
    writeJson(
      join(dataDir, "component_metadata.json"),
      opts.componentMetadata ?? FIXTURE_COMPONENT_METADATA
    );
  }
}

// ----- fixture JsonUI project ---------------------------------------------

export const FIXTURE_PROJECT_CONFIG = {
  project_name: "ExampleApp",
  spec_directory: "docs/screens/json",
  layouts_directory: "layouts",
  styles_directory: "layouts/Styles",
  images_directory: "images",
  component_spec_directory: "docs/components/json",
  strings_file: "strings.json",
  type_map_file: ".jsonui-type-map.json",
  platforms: { ios: { path: "ios", mode: "swiftui" } },
};

/**
 * Create a minimal JsonUI project in `root`:
 *   jui.config.json, two screen specs (one intentionally corrupt),
 *   one component spec, nested layout files.
 */
export function makeFixtureProject(root: string): void {
  writeJson(join(root, "jui.config.json"), FIXTURE_PROJECT_CONFIG);

  writeJson(join(root, "docs/screens/json/login.spec.json"), {
    type: "screen_spec",
    metadata: {
      name: "Login",
      displayName: "Login Screen",
      layoutFile: "login",
    },
  });
  // Corrupt JSON: list_screen_specs must degrade gracefully, not crash.
  mkdirSync(join(root, "docs/screens/json"), { recursive: true });
  writeFileSync(join(root, "docs/screens/json/broken.spec.json"), "{ not json !");

  writeJson(join(root, "docs/components/json/example_card.component.json"), {
    type: "component_spec",
    metadata: { name: "ExampleCard", category: "card" },
  });

  writeJson(join(root, "layouts/login.json"), {
    type: "View",
    id: "login_root",
    child: [{ type: "Label", text: "Welcome" }],
  });
  writeJson(join(root, "layouts/Styles/common.json"), {
    defaultFontColor: "#333333",
  });
  // Non-JSON file must not be listed by list_layouts.
  writeFileSync(join(root, "layouts/README.txt"), "not a layout");
}

// ----- MCP tool capture harness -------------------------------------------

export interface CapturedTool {
  description: string;
  schema: ZodRawShape;
  handler: (params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

export interface ToolHarness {
  server: McpServer;
  tools: Map<string, CapturedTool>;
  /**
   * Invoke a registered tool. Params are validated through the captured Zod
   * raw shape first, mirroring what the MCP SDK does before dispatch.
   * Returns the text of the first content item.
   */
  call(name: string, params?: Record<string, unknown>): Promise<string>;
}

export function createToolHarness(): ToolHarness {
  const tools = new Map<string, CapturedTool>();
  const server = {
    tool(
      name: string,
      description: string,
      schema: ZodRawShape,
      handler: CapturedTool["handler"]
    ) {
      tools.set(name, { description, schema, handler });
    },
  } as unknown as McpServer;

  async function call(
    name: string,
    params: Record<string, unknown> = {}
  ): Promise<string> {
    const tool = tools.get(name);
    if (!tool) {
      throw new Error(
        `Tool not registered: ${name}. Registered: ${[...tools.keys()].join(", ")}`
      );
    }
    const parsed = z.object(tool.schema).parse(params);
    const result = await tool.handler(parsed);
    return result.content[0].text;
  }

  return { server, tools, call };
}
