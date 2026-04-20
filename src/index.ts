#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SpecLoader, mcpRootFromImportMetaUrl } from "./spec_loader.js";
import { ServerConfig } from "./config.js";

// --- Group A: Component Spec Lookup ---
import { register as registerLookupComponent } from "./tools/spec/lookup_component.js";
import { register as registerLookupAttribute } from "./tools/spec/lookup_attribute.js";
import { register as registerSearchComponents } from "./tools/spec/search_components.js";
import { register as registerGetModifierOrder } from "./tools/spec/get_modifier_order.js";
import { register as registerGetBindingRules } from "./tools/spec/get_binding_rules.js";
import { register as registerGetPlatformMapping } from "./tools/spec/get_platform_mapping.js";
import { register as registerGetDataSource } from "./tools/spec/get_data_source.js";

// --- Group B: Project Context ---
import { register as registerGetProjectConfig } from "./tools/context/get_project_config.js";
import { register as registerListScreenSpecs } from "./tools/context/list_screen_specs.js";
import { register as registerListComponentSpecs } from "./tools/context/list_component_specs.js";
import { register as registerListLayouts } from "./tools/context/list_layouts.js";
import { register as registerReadSpecFile } from "./tools/context/read_spec_file.js";
import { register as registerReadLayoutFile } from "./tools/context/read_layout_file.js";

// --- Group C: jui CLI ---
import { register as registerJuiInit } from "./tools/jui/jui_init.js";
import { register as registerJuiGenerateProject } from "./tools/jui/jui_generate_project.js";
import { register as registerJuiGenerateScreen } from "./tools/jui/jui_generate_screen.js";
import { register as registerJuiGenerateConverter } from "./tools/jui/jui_generate_converter.js";
import { register as registerJuiBuild } from "./tools/jui/jui_build.js";
import { register as registerJuiVerify } from "./tools/jui/jui_verify.js";
import { register as registerJuiMigrateLayouts } from "./tools/jui/jui_migrate_layouts.js";

// --- Group D: jsonui-doc CLI ---
import { register as registerDocInitSpec } from "./tools/doc/doc_init_spec.js";
import { register as registerDocInitComponent } from "./tools/doc/doc_init_component.js";
import { register as registerDocValidateSpec } from "./tools/doc/doc_validate_spec.js";
import { register as registerDocValidateComponent } from "./tools/doc/doc_validate_component.js";
import { register as registerDocGenerateSpec } from "./tools/doc/doc_generate_spec.js";
import { register as registerDocGenerateComponent } from "./tools/doc/doc_generate_component.js";
import { register as registerDocGenerateHtml } from "./tools/doc/doc_generate_html.js";
import { register as registerDocRulesInit } from "./tools/doc/doc_rules_init.js";
import { register as registerDocRulesShow } from "./tools/doc/doc_rules_show.js";

function log(message: string) {
  console.error(`[jui-tools] ${new Date().toISOString()} ${message}`);
}

log("Server starting...");

const server = new McpServer({
  name: "jui-tools",
  version: "2.0.0",
});

// Initialize spec loader for Group A
// Resolves attribute_definitions.json via 4-layer fallback:
// JSONUI_CLI_PATH env > ./.jsonui-cli/ > ~/.jsonui-cli/ > bundled snapshot in data/.
const mcpRoot = mcpRootFromImportMetaUrl(import.meta.url);
const loader = new SpecLoader(mcpRoot);
const source = loader.getDataSource();
log(
  `attribute_definitions: [${source.attributeDefinitions.layer}] ${source.attributeDefinitions.path} (${source.attributeDefinitions.freshness})`
);
log(
  `component_metadata:    [${source.componentMetadata.layer}] ${source.componentMetadata.path} (${source.componentMetadata.freshness})`
);
log(
  `Loaded ${source.componentCount} components, ${source.commonAttributeCount} common attributes`
);

// Initialize server config for Groups B/C/D
const config = new ServerConfig();

// Register Group A: Component Spec Lookup (7 tools)
registerLookupComponent(server, loader);
registerLookupAttribute(server, loader);
registerSearchComponents(server, loader);
registerGetModifierOrder(server, loader);
registerGetBindingRules(server, loader);
registerGetPlatformMapping(server, loader);
registerGetDataSource(server, loader);

// Register Group B: Project Context (6 tools)
registerGetProjectConfig(server, config);
registerListScreenSpecs(server, config);
registerListComponentSpecs(server, config);
registerListLayouts(server, config);
registerReadSpecFile(server, config);
registerReadLayoutFile(server, config);

// Register Group C: jui CLI (7 tools)
registerJuiInit(server, config);
registerJuiGenerateProject(server, config);
registerJuiGenerateScreen(server, config);
registerJuiGenerateConverter(server, config);
registerJuiBuild(server, config);
registerJuiVerify(server, config);
registerJuiMigrateLayouts(server, config);

// Register Group D: jsonui-doc CLI (9 tools)
registerDocInitSpec(server, config);
registerDocInitComponent(server, config);
registerDocValidateSpec(server, config);
registerDocValidateComponent(server, config);
registerDocGenerateSpec(server, config);
registerDocGenerateComponent(server, config);
registerDocGenerateHtml(server, config);
registerDocRulesInit(server, config);
registerDocRulesShow(server, config);

log(`Registered 29 tools (7 spec + 6 context + 7 jui + 9 doc)`);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("Server connected and ready.");
}

main().catch(console.error);
