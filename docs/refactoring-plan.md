# JsonUI MCP Server v2 リファクタリング計画

## Context

現在のMCPサーバー（`jsonui-mcp-server`）はコンポーネント仕様の参照のみ（6ツール）。
AI agentがJsonUIプロジェクトを操作するには、CLI構文を知ってBashで実行する必要がある。

**目的**: `jui` + `jsonui-doc` CLIを全てMCPツール化し、AI agentがCLI構文を知らなくても全操作できるようにする。コンポーネント参照も残す。

---

## サーバー名変更

`jsonui-spec` → `jui-tools` (version 2.0.0)

## project_dir 解決方針

1. 起動時: 環境変数 `JUI_PROJECT_DIR` でデフォルト設定
2. 各ツール: `project_dir` パラメータで上書き可能
3. どちらもない場合: エラーメッセージで案内

---

## ツール一覧（4グループ・28ツール）

### Group A: コンポーネント仕様参照（既存6ツール、変更なし）

| ツール | 説明 |
|--------|------|
| `lookup_component` | コンポーネント仕様を取得 |
| `lookup_attribute` | 属性定義を取得 |
| `search_components` | キーワード検索 |
| `get_modifier_order` | modifier適用順序 |
| `get_binding_rules` | binding構文ルール |
| `get_platform_mapping` | プラットフォーム間変換 |

### Group B: プロジェクトコンテキスト（新規6ツール、ファイル読み取りのみ）

| ツール | 説明 | 実装方法 |
|--------|------|---------|
| `get_project_config` | jui.config.json読み取り | fs.readFile |
| `list_screen_specs` | spec一覧 + メタデータ | glob + JSON parse |
| `list_component_specs` | コンポーネントspec一覧 | glob + JSON parse |
| `list_layouts` | Layout JSON一覧 | glob |
| `read_spec_file` | spec内容を返す | fs.readFile |
| `read_layout_file` | Layout JSON内容を返す | fs.readFile |

### Group C: jui CLIラッパー（新規7ツール）

| ツール | CLIコマンド | 主要パラメータ |
|--------|------------|---------------|
| `jui_init` | `jui init` | project_name, ios_path, android_path, web_path |
| `jui_generate_project` | `jui generate project` | spec_file?, force?, dry_run?, platform? |
| `jui_generate_screen` | `jui generate screen` | names[], display_name? |
| `jui_generate_converter` | `jui generate converter` | name?, from_spec?, all?, attributes? |
| `jui_build` | `jui build` | clean?, platform? |
| `jui_verify` | `jui verify` | spec_file?, detail?, fail_on_diff?, platform? |
| `jui_migrate_layouts` | `jui migrate-layouts` | source_platform?, dry_run? |

### Group D: jsonui-doc CLIラッパー（新規9ツール）

| ツール | CLIコマンド | 主要パラメータ |
|--------|------------|---------------|
| `doc_init_spec` | `jsonui-doc init spec` | name, display_name? |
| `doc_init_component` | `jsonui-doc init component` | name, display_name?, category? |
| `doc_validate_spec` | `jsonui-doc validate spec` | file |
| `doc_validate_component` | `jsonui-doc validate component` | file |
| `doc_generate_spec` | `jsonui-doc generate spec` | file, output?, format? |
| `doc_generate_component` | `jsonui-doc generate component` | file, output?, format? |
| `doc_generate_html` | `jsonui-doc generate html` | input_dir, output_dir?, title? |
| `doc_rules_init` | `jsonui-doc rules init` | flutter? |
| `doc_rules_show` | `jsonui-doc rules show` | directory? |

**除外**: `figma fetch/images`（APIトークン必要）、`generate mermaid/adapter`（低優先度）

---

## ソースコード構成

```
src/
  index.ts                    # エントリポイント（ツール登録）
  config.ts                   # NEW: project_dir解決、環境変数管理
  cli_runner.ts               # NEW: child_process.execFileラッパー
  spec_loader.ts              # 既存（変更なし）
  tools/
    spec/                     # Group A（既存ロジックをファイル分割）
      lookup_component.ts
      lookup_attribute.ts
      search_components.ts
      get_modifier_order.ts
      get_binding_rules.ts
      get_platform_mapping.ts
    context/                  # Group B
      get_project_config.ts
      list_screen_specs.ts
      list_component_specs.ts
      list_layouts.ts
      read_spec_file.ts
      read_layout_file.ts
    jui/                      # Group C
      jui_init.ts
      jui_generate_project.ts
      jui_generate_screen.ts
      jui_generate_converter.ts
      jui_build.ts
      jui_verify.ts
      jui_migrate_layouts.ts
    doc/                      # Group D
      doc_init_spec.ts
      doc_init_component.ts
      doc_validate_spec.ts
      doc_validate_component.ts
      doc_generate_spec.ts
      doc_generate_component.ts
      doc_generate_html.ts
      doc_rules_init.ts
      doc_rules_show.ts
```

---

## 主要ファイルの実装方針

### `src/config.ts`

```typescript
export class ServerConfig {
  private defaultProjectDir: string | undefined;

  constructor() {
    this.defaultProjectDir = process.env.JUI_PROJECT_DIR;
  }

  // パラメータ → 環境変数 → エラー の優先順位で解決
  resolveProjectDir(override?: string): string { ... }

  // jui.config.json を読み取り、パスを絶対パスに変換して返す
  readProjectConfig(dir: string): ProjectConfig { ... }

  // spec_directory, layouts_directory 等を絶対パスに解決
  resolveSpecDir(config: ProjectConfig, projectDir: string): string { ... }
  resolveLayoutsDir(config: ProjectConfig, projectDir: string): string { ... }
}
```

### `src/cli_runner.ts`

```typescript
interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// child_process.execFile 使用（shell injection防止）
// デフォルトタイムアウト: 60秒、build系: 300秒
export async function runCli(
  command: string,
  args: string[],
  options: { cwd: string; timeout?: number }
): Promise<CliResult> { ... }

// コマンド存在チェック
export async function commandExists(command: string): Promise<boolean> { ... }
```

### `src/index.ts`

```typescript
// サーバー名: jui-tools, バージョン: 2.0.0
const server = new McpServer({ name: "jui-tools", version: "2.0.0" });
const config = new ServerConfig();

// 各ツールファイルから register(server, config) をインポートして登録
import { register as lookupComponent } from "./tools/spec/lookup_component.js";
import { register as juiVerify } from "./tools/jui/jui_verify.js";
// ... 全28ツール

lookupComponent(server, loader);
juiVerify(server, config);
// ...
```

### ツール登録パターン（各ツールファイル共通）

```typescript
// 例: tools/jui/jui_verify.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServerConfig } from "../../config.js";
import { runCli } from "../../cli_runner.js";

export function register(server: McpServer, config: ServerConfig) {
  server.tool(
    "jui_verify",
    "Compare generated Layout JSON against on-disk layouts and report differences",
    {
      spec_file: z.string().optional().describe("Single spec file to verify (e.g., 'login.spec.json')"),
      detail: z.boolean().optional().describe("Include per-screen diff details in report"),
      fail_on_diff: z.boolean().optional().describe("Exit with error if any diff detected"),
      platform: z.string().optional().describe("Target platform (defaults to first in config)"),
      project_dir: z.string().optional().describe("Project directory (overrides JUI_PROJECT_DIR env)"),
    },
    async (params) => {
      const projectDir = config.resolveProjectDir(params.project_dir);
      const args = ["verify"];
      if (params.spec_file) args.push("--file", params.spec_file);
      if (params.detail) args.push("--detail");
      if (params.fail_on_diff) args.push("--fail-on-diff");
      if (params.platform) args.push("--platform", params.platform);

      const result = await runCli("jui", args, { cwd: projectDir });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: result.exitCode === 0,
            has_diffs: result.exitCode !== 0,
            report: result.stdout,
            errors: result.stderr || undefined,
          }, null, 2),
        }],
      };
    }
  );
}
```

---

## セキュリティ

- `execFile`（`exec`ではない）でshell injection防止
- ファイルパスのバリデーション（project_dir外へのtraversal禁止）
- figma系ツールは除外（トークン管理の問題）

---

## install.sh 更新

- MCP登録名を `jsonui-spec` → `jui-tools` に変更
- 旧エントリ `jsonui-spec` があれば削除
- `JUI_PROJECT_DIR` 環境変数の設定ガイドを表示

```json
{
  "mcpServers": {
    "jui-tools": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "JUI_PROJECT_DIR": "/path/to/project"
      }
    }
  }
}
```

---

## 実装順序

1. インフラ: `config.ts`, `cli_runner.ts`
2. Group A リファクタ: 既存ツールをファイル分割（ロジック変更なし）
3. Group B: コンテキストツール（ファイル読み取りのみ、テスト容易）
4. Group C: juiラッパー（generate_project, verify から）
5. Group D: jsonui-docラッパー（validate_spec, generate_spec から）
6. `index.ts` 統合、`install.sh` / `uninstall.sh` 更新
7. `README.md` 更新

---

## 検証方法

1. `npm run build` が通ること
2. `node dist/index.js` でサーバー起動確認（stderrにログ出力）
3. Claude CodeのMCP設定に登録して各ツールが呼べること
4. 実際のJsonUIプロジェクトで `jui_verify`, `jui_build` 等が動作すること

---

## 変更対象ファイル

### 新規作成
- `src/config.ts`
- `src/cli_runner.ts`
- `src/tools/spec/*.ts` (6ファイル)
- `src/tools/context/*.ts` (6ファイル)
- `src/tools/jui/*.ts` (7ファイル)
- `src/tools/doc/*.ts` (9ファイル)

### 変更
- `src/index.ts` — 全面書き換え（ツール登録を各ファイルに委譲）
- `package.json` — name, version, description更新
- `install.sh` — MCP登録名変更
- `uninstall.sh` — MCP登録名変更
- `README.md` — 全面書き換え

### 削除なし
- `src/spec_loader.ts` — そのまま維持
- `specs/` ディレクトリ — そのまま維持
