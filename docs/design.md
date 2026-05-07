# jsonui-mcp-server (`jui-tools`) — Design

## Purpose

An MCP server that lets an AI agent drive JsonUI projects without memorising
CLI syntax or re-reading source files. It exposes four groups of tools:

1. **Spec lookup** — answers "what is this component / attribute, and how
   does it bind?" from the canonical jsonui-cli data files.
2. **Project context** — reads `jui.config.json`, screen specs, layouts,
   and component specs on the agent's behalf.
3. **`jui` CLI wrappers** — `init` / `generate project` / `generate screen`
   / `generate converter` / `build` / `verify` / `migrate-layouts`.
4. **`jsonui-doc` CLI wrappers** — `init` / `validate` / `generate` /
   `rules` for specs, components, and HTML output.

The server is published as `jui-tools` (version 2.x), currently exposing
30 tools.

---

## Data pipeline

The spec-lookup tools (Group A) never hand-maintain component data. They
derive everything at runtime from two files that live in jsonui-cli:

| File | Owner | Role |
|---|---|---|
| `shared/core/attribute_definitions.json` | jsonui-cli | Raw schema: every component, every attribute, their `type`s, descriptions, enums, and — for attributes whose `type` includes `"binding"` — an optional `binding_direction: "two-way"` flag. |
| `shared/core/component_metadata.json` | jsonui-cli | Presentation metadata: per-component description, aliases, which platforms generate the component, platform-specific implementation notes, and agent-facing prose rules. |

`SpecLoader` joins these two at startup to produce the in-memory
`ComponentSpec` map that the tools read.

### 4-layer resolution

Both files are located via the same fallback chain:

1. `$JSONUI_CLI_PATH/shared/core/<file>` — env override for monorepos or
   custom checkouts.
2. `./.jsonui-cli/shared/core/<file>` — per-project override inside the
   current working directory.
3. `~/.jsonui-cli/shared/core/<file>` — default location of the
   jsonui-cli bootstrap installer.
4. `<mcp-root>/data/<file>` — bundled snapshot, populated at install
   time by `scripts/fetch-definitions.js` (hit against
   `raw.githubusercontent.com/Tai-Kimura/jsonui-cli/main/...`).

The highest-priority existing file wins. If all four are missing,
`SpecLoader` throws at startup with a diagnostic that lists every path
it tried.

The `get_data_source` tool exposes this information at runtime: which
layer each file came from, its `mtime`, and a freshness bucket
(`fresh` ≤30d / `aging` ≤90d / `stale` >90d). Agents that need
up-to-date schema call this to verify the data they're working against.

### Derived (non-file) content

`src/data/derived.ts` holds content that does not depend on the two
jsonui-cli files — it encodes fixed cross-platform conventions:

- `MODIFIER_ORDER` (Swift / Kotlin / React application order + critical
  rules like "background must come after padding").
- `BINDING_RULES` (`@{}` syntax, two-way vs. read-only summary, direction
  rules across platforms).
- `PLATFORM_MAPPING` (`matchParent` / `wrapContent`, `contentMode`,
  `textAlign`, `fontWeight`, `orientation`, `gravity`, type mappings).
- `categorizeCommonAttributes(…)` — groups `common.*` attributes into
  sizing / spacing / visual / visibility / interaction / layout /
  lifecycle / accessibility / binding buckets for the lookup tools.

These are served directly by the `get_modifier_order`,
`get_binding_rules`, and `get_platform_mapping` tools.

---

## Tool inventory (30)

### Group A — Spec lookup (7)

| Tool | What it returns |
|---|---|
| `lookup_component` | Full spec for a component (attributes, binding behaviour, platform notes, rules). |
| `lookup_attribute` | Definition + scope (common vs. component) for a single attribute name. |
| `search_components` | Ranked matches across component names, aliases, descriptions, attribute names, and rules. |
| `get_modifier_order` | Platform-specific modifier / class ordering. |
| `get_binding_rules` | Full `@{}` binding reference. |
| `get_platform_mapping` | Value/enum mapping across Swift/Kotlin/React. |
| `get_data_source` | Per-file layer, path, `mtime`, freshness bucket. |

### Group B — Project context (6)

| Tool | Reads |
|---|---|
| `get_project_config` | `jui.config.json`, resolves relative paths to absolute. |
| `list_screen_specs` | Screen-spec index with metadata. |
| `list_component_specs` | Component-spec index with metadata. |
| `list_layouts` | Layout JSON inventory. |
| `read_spec_file` | One spec file (no parsing beyond `JSON.parse`). |
| `read_layout_file` | One layout JSON file. |

### Group C — `jui` CLI wrappers (8)

`jui_init`, `jui_generate_project`, `jui_generate_screen`,
`jui_generate_converter`, `jui_build`, `jui_verify`,
`jui_migrate_layouts`, `jui_sync_tool`.

`jui_sync_tool` mirrors the home `~/.jsonui-cli/` platform tools into each
project-local `<platform_root>/<tool>_tools/`, preserving every
`extensions/` directory and propagating each tool's `.ruby-version` to
the platform root. Agents call it after a jsonui-cli bump or when
bootstrapping a freshly scaffolded platform.

### Group D — `jsonui-doc` CLI wrappers (9)

`doc_init_spec`, `doc_init_component`, `doc_validate_spec`,
`doc_validate_component`, `doc_generate_spec`, `doc_generate_component`,
`doc_generate_html`, `doc_rules_init`, `doc_rules_show`.

`figma fetch/images` and `generate mermaid/adapter` are intentionally
excluded (token management / low priority).

---

## Source layout

```
src/
  index.ts                 # registers all 29 tools
  config.ts                # ServerConfig: JUI_PROJECT_DIR, jui.config.json
  cli_runner.ts            # execFile wrapper (no shell), timeout defaults
  spec_loader.ts           # 4-layer fallback + merge pipeline, public API
  data/
    derived.ts             # MODIFIER_ORDER / BINDING_RULES / PLATFORM_MAPPING + categorizer
  tools/
    spec/ (7 files)        # Group A
    context/ (6 files)     # Group B
    jui/ (8 files)         # Group C
    doc/ (9 files)         # Group D
data/
  attribute_definitions.json  # bundled snapshot (4th-layer fallback)
  component_metadata.json     # bundled snapshot (4th-layer fallback)
scripts/
  fetch-definitions.js     # npm postinstall hook — fetches both files
```

---

## Configuration

### `project_dir` resolution

Each tool in Groups B/C/D accepts an optional `project_dir`. Resolution:

1. Tool parameter, if passed.
2. `$JUI_PROJECT_DIR` environment variable.
3. Otherwise the tool returns an actionable error.

### Environment variables

| Variable | Purpose |
|---|---|
| `JUI_PROJECT_DIR` | Default project directory for Groups B/C/D. |
| `JSONUI_CLI_PATH` | Override for layer 1 of the spec-data fallback. |
| `JSONUI_CLI_RAW_BASE` | Override the GitHub raw base URL used by the postinstall fetch script (defaults to `raw.githubusercontent.com/Tai-Kimura/jsonui-cli/main`). |
| `JSONUI_ATTR_DEFINITIONS_URL` | Direct URL override for `attribute_definitions.json` in the fetch script. |
| `JSONUI_COMPONENT_METADATA_URL` | Direct URL override for `component_metadata.json` in the fetch script. |

### Claude Code integration

`~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "jui-tools": {
      "command": "node",
      "args": ["<install_path>/dist/index.js"],
      "env": {
        "JUI_PROJECT_DIR": "/path/to/project"
      }
    }
  }
}
```

`install.sh` writes this entry (preserving any other servers); `uninstall.sh`
removes it.

---

## Security

- Group C/D tools invoke CLIs through `child_process.execFile`, never
  `exec`, so no shell parses arguments.
- File-read tools validate that targets stay inside `project_dir`.
- `figma` CLIs are excluded to avoid handling tokens in this server.

---

## Install flow

```bash
git clone https://github.com/Tai-Kimura/jsonui-mcp-server.git
cd jsonui-mcp-server
./install.sh          # npm install → npm run build → postinstall fetch
```

`npm install` triggers `scripts/fetch-definitions.js` automatically. If
the network is unavailable and no prior bundled snapshot exists, the
script exits 0 and the MCP surfaces the misconfiguration at startup
instead of silently running on stale data.
