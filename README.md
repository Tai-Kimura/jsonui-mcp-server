# jui-tools MCP Server

JsonUI プロジェクト管理用 MCP サーバー。`jui` + `jsonui-doc` CLI のラッパーとコンポーネント仕様参照を提供。

AI agent が CLI 構文を知らなくても、MCP ツール経由で JsonUI の全操作を実行可能。

## Install

```bash
git clone git@github.com:Tai-Kimura/jsonui-mcp-server.git /tmp/jsonui-mcp-installer
bash /tmp/jsonui-mcp-installer/install.sh
rm -rf /tmp/jsonui-mcp-installer
```

インストール後、`~/.claude.json` に MCP サーバーが登録される。

### プロジェクトディレクトリの設定

環境変数でデフォルトのプロジェクトディレクトリを設定可能:

```json
{
  "mcpServers": {
    "jui-tools": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "JUI_PROJECT_DIR": "/path/to/your/project"
      }
    }
  }
}
```

各ツールの `project_dir` パラメータで上書きも可能。

## Update

```bash
bash ~/.jsonui-mcp-server/install.sh
```

## Uninstall

```bash
bash ~/.jsonui-mcp-server/uninstall.sh
```

## Available Tools (28)

### Group A: コンポーネント仕様参照 (6)

| Tool | Description |
|------|-------------|
| `lookup_component` | コンポーネント仕様を取得（属性、binding、プラットフォーム別詳細） |
| `lookup_attribute` | 属性定義を取得（型、binding対応、使用コンポーネント） |
| `search_components` | キーワードでコンポーネント/属性を検索 |
| `get_modifier_order` | プラットフォーム別 modifier 適用順序 |
| `get_binding_rules` | binding 構文ルール（two-way / read-only） |
| `get_platform_mapping` | プラットフォーム間の値変換マッピング |

### Group B: プロジェクトコンテキスト (6)

| Tool | Description |
|------|-------------|
| `get_project_config` | jui.config.json の読み取り |
| `list_screen_specs` | 画面 spec 一覧（メタデータ付き） |
| `list_component_specs` | コンポーネント spec 一覧 |
| `list_layouts` | Layout JSON ファイル一覧 |
| `read_spec_file` | spec ファイルの内容を返す |
| `read_layout_file` | Layout JSON の内容を返す |

### Group C: jui CLI (7)

| Tool | Description | CLI |
|------|-------------|-----|
| `jui_init` | プロジェクト初期化 | `jui init` |
| `jui_generate_project` | Layout JSON + ViewModel 生成 | `jui generate project` |
| `jui_generate_screen` | 画面 spec テンプレート作成 | `jui generate screen` |
| `jui_generate_converter` | カスタムコンポーネント converter 生成 | `jui generate converter` |
| `jui_build` | 全プラットフォームビルド | `jui build` |
| `jui_verify` | Layout JSON の差分検証 | `jui verify` |
| `jui_migrate_layouts` | レイアウト移行 | `jui migrate-layouts` |

### Group D: jsonui-doc CLI (9)

| Tool | Description | CLI |
|------|-------------|-----|
| `doc_init_spec` | 画面 spec テンプレート作成 | `jsonui-doc init spec` |
| `doc_init_component` | コンポーネント spec テンプレート作成 | `jsonui-doc init component` |
| `doc_validate_spec` | 画面 spec のバリデーション | `jsonui-doc validate spec` |
| `doc_validate_component` | コンポーネント spec のバリデーション | `jsonui-doc validate component` |
| `doc_generate_spec` | spec から HTML/MD ドキュメント生成 | `jsonui-doc generate spec` |
| `doc_generate_component` | コンポーネント spec からドキュメント生成 | `jsonui-doc generate component` |
| `doc_generate_html` | テストファイルから HTML ドキュメントサイト生成 | `jsonui-doc generate html` |
| `doc_rules_init` | カスタムバリデーションルール作成 | `jsonui-doc rules init` |
| `doc_rules_show` | 有効なバリデーションルール表示 | `jsonui-doc rules show` |

## Prerequisites

- Node.js 18+
- `jui` CLI (`pip install jui-tools`)
- `jsonui-doc` CLI (`pip install jsonui-doc-cli`)
