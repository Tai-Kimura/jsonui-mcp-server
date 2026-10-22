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

## Available Tools (57)

### Group A: コンポーネント仕様参照 (9)

| Tool | Description |
|------|-------------|
| `lookup_component` | コンポーネント仕様を取得（属性、binding、プラットフォーム別詳細） |
| `lookup_attribute` | 属性定義を取得（型、binding対応、使用コンポーネント） |
| `search_components` | キーワードでコンポーネント/属性を検索 |
| `get_modifier_order` | プラットフォーム別 modifier 適用順序（Swift は jsonui-cli の `sjui_tools/lib/swiftui/views/modifier_order.json` から導出。Kotlin / React は手書きで、`source` にそう出る） |
| `get_binding_rules` | binding 構文ルール（two-way / read-only） |
| `get_platform_mapping` | プラットフォーム間の値変換マッピング |
| `get_screen_identity` | スクリーン正準定義（screen とは何か・id 導出・表示判定述語） |
| `get_data_source` | データ由来（layer / path / mtime / 鮮度）の確認 |
| `get_platform_rules` | Layout の platform 指定の規則（1 platform だけ属性を変える node の `platform` オブジェクト、platform ごとに node を落とす文字列形、root の `platforms`、優先順位、`responsive` との違い） |

### Group B: プロジェクトコンテキスト (7)

| Tool | Description |
|------|-------------|
| `get_project_config` | jui.config.json の読み取り |
| `list_screen_specs` | 画面 spec 一覧（メタデータ付き） |
| `list_component_specs` | コンポーネント spec 一覧 |
| `list_layouts` | Layout JSON ファイル一覧 |
| `read_spec_file` | spec ファイルの内容を返す。散文フィールド（description / notes / intent / purpose / processing / handling / rule / meaning / note / reason〔`harnessConditions`・`canonicalDivergence` の下を除く〕/ condition〔トップレベルの `transitions` の下のみ〕）の `{"md": "key"}`（`<name>.texts.yaml` への参照）は `{"md", "text"}` に展開して返す（編集は YAML 側）。参照の無い spec はファイルそのまま。`search_specs` は texts ファイルの本文を検索しない |
| `read_layout_file` | Layout JSON の内容を返す |
| `search_specs` | 全 spec（画面・サブディレクトリの sub-spec・コンポーネント）をキーワード検索し、ファイル・JSON path・抜粋を返す |

### Group C: jui CLI (8)

| Tool | Description | CLI |
|------|-------------|-----|
| `jui_init` | プロジェクト初期化 | `jui init` |
| `jui_generate_project` | Layout JSON + ViewModel 生成 | `jui generate project` |
| `jui_generate_screen` | 画面 spec テンプレート作成 | `jui generate screen` |
| `jui_generate_converter` | カスタムコンポーネント converter 生成 | `jui generate converter` |
| `jui_build` | 全プラットフォームビルド | `jui build` |
| `jui_verify` | Layout JSON の差分検証 | `jui verify` |
| `jui_migrate_layouts` | レイアウト移行 | `jui migrate-layouts` |
| `jui_sync_tool` | ホームインストールのツールをプロジェクトローカルへ同期（extensions/ 保護） | `jui sync_tool` |

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

### Group E: API モデル連携 (3)

| Tool | Description | CLI |
|------|-------------|-----|
| `list_api_specs` | API/swagger spec 一覧（halt 条件の事前検出付き） | `jui ls api-specs --json` |
| `list_api_models` | 生成済み DTO/Domain 一覧（orphan 検出付き） | `jui ls api-models --json` |
| `preview_api_model_sync` | swagger→DTO/Domain 同期の dry-run プレビュー（書き込みなし） | `jui g api --dry-run --json` |

### Group F: jsonui-test CLI (10)

| Tool | Description | CLI |
|------|-------------|-----|
| `test_validate` | テストファイル（screen/flow + description）のバリデーション。既定では CLI 同様に flatten-install 副作用あり（`no_install=true` で検証のみ） | `jsonui-test validate [--no-install]` |
| `test_generate_screen` | screen テストテンプレート生成 | `jsonui-test generate test screen` |
| `test_generate_flow` | flow テストテンプレート生成 | `jsonui-test generate test flow` |
| `test_generate_branch_tests` | spec の branchContracts から分岐テスト生成(web/android/ios) | `jsonui-test generate branch-tests` |
| `test_generate_description` | テストケースの description JSON 生成（screen/flow） | `jsonui-test generate description` |
| `test_report` | results JSON → JUnit XML / HTML レポート変換 | `jsonui-test report` |
| `test_mock_generate` | OpenAPI からモック scaffold（`check=true` で drift レポートのみ・書き込みなし） | `jsonui-test mock generate [--check]` |
| `test_artifacts_pull` | 最新実行のテスト成果物（スクリーンショット/録画）を iOS xcresult / Android 実機から artifacts ディレクトリへ取り込み | `jsonui-test artifacts pull --json` |
| `test_artifacts_status` | test-artifacts 設定の解決結果（出力先、iOS xcresult 探索、Android appId）と取り込み済みファイル一覧 | `jsonui-test artifacts status --json` |
| `test_contracts_coverage` | OpenAPI が宣言する応答 status を、画面・VM method・operation・platform ごとに「行が答える / 理由つきの除外 / 評価できない / 不足」に振り分ける（読み取り専用、まだ門ではない。exit 0 pass・1 不足か宣言の誤り・2 始められない・3 評価できないものがある。jsonui-cli 1.8.116 以上） | `jsonui-test contracts coverage [screen] [--platform …] --json` |

> `jsonui-test mock serve`（常駐 HTTP + run-target 実行）は RCE 面のため **MCP 非公開**（CLI 直叩き限定）。

### Group G: jui viz (5)

Claude Code のセッションを見るローカルのビューア（`jui viz`）。**Claude Code のセッションだけを見せる**（Codex など他のエージェントのセッションは出ない）。どれもホームフォルダで走り、`JUI_PROJECT_DIR` は使わない。

| Tool | Description | CLI |
|------|-------------|-----|
| `viz_status` | サーバーが動いているか（pid・URL）、`~/.claude/settings.json` のフック（18 個中いくつ）、権限の中継が登録済みか（`relay=false` で中継の確認を省く） | `jui viz status --json [--with-relay]` |
| `viz_doctor` | viz の環境の点検（Python パッケージ・フックとその Python・ポート・claude CLI） | `jui viz doctor --json` |
| `viz_start` | サーバーをバックグラウンドで起動し、`/health` が応答したら URL を返す。動いていれば起動せずに `alreadyRunning` で返す | `jui viz start --json [--port N]` |
| `viz_stop` | jui が記録したサーバーだけを止める | `jui viz stop` |
| `viz_open` | 動いているサーバーのページをブラウザで開く（動いていなければ失敗。先に `viz_start`） | `jui viz open` |

> フックと中継の導入（`jui viz hooks install` / `jui viz relay install`）は `~/.claude/settings.json` と利用者の MCP 設定を書くので **MCP 非公開**（CLI で行う）。jui が古いと（`viz` / `start` / `--with-relay` が無い）、結果の `update_jui` に更新の手順が出る。

### Group H: サーバールーム（infra） (6)

`docs/infra`（モデル・flow・負荷・単価）を確かめ、下書きし、値段を付ける。どれも `jsonui-doc … --json` を呼び、その JSON を短くまとめて返す（**jsonui-cli 2.3.15 以降**）。書き方は jsonui-cli の `document_tools/INFRA.md`。

| Tool | Description | CLI |
|------|-------------|-----|
| `infra_validate` | モデルを読めるか（読めない時は理由）、使ったファイル・数・flow の数、problems を重さとコードで数え、最初の 20 件。移管計画（`docs/infra/migrations/<名前>`）がある部屋では、計画ごとの problems（`migration.*` と、新の構成に今の検査を当てた分）・数・ステップの順も（`plan` で 1 つだけ、2.3.20 以降） | `jsonui-doc validate infra <project> --json [--migration <名前>]` |
| `infra_load_validate` | 負荷のシナリオ（id・環境・月・時間・行・edge）と problems（node・hour・quantity つき） | `jsonui-doc validate infra-load <project> --json` |
| `infra_prices_validate` | 部屋の単価のファイル・単価の数・problems | `jsonui-doc validate infra-prices <project> --json` |
| `infra_seed` | IaC・設定ファイル・コードから下書き。数・node・読んだ物・置けなかった物（unmatched）・skipped・notes。既定では一時フォルダに書いて読み戻し、プロジェクトは変えない（`write: true` で `<infra.dir>/seed`） | `jsonui-doc seed infra <project> -o <dir> [--force]` |
| `infra_check` | 宣言した `builtin:infra-iac` / `infra-code` / `infra-load` の結果（status・数・ok でない結果の最初の 20 件・レポートの道） | `jsonui-doc check infra -p <project> --json` |
| `infra_cost` | 月の合計・provider（か node）ごとの合計・上位 node・一番高い日・単価なし／規則なし／負荷なし・容量を超えた時間・注意。`date` で 1 日（上位 node の meter ごとの額と単価の層、ピークの時刻）。負荷の problems と単価の警告も。`plan` で移管計画の月の旧・新・差（node ごとの増減の大きい順・provider ごと・ステップごと。ステップの差はそのステップでの月額全体の変化で、動いたノード・線は moved。旧か新で値が付かない変えたノードは unpricedChanged、`account: true` でアカウントの月（その環境をまとめて値付け）も、2.3.20 以降） | `jsonui-doc cost infra <project> --json [--scenario] [--date] [--by] [--migration <名前> [--account]]` |

> 単価の取得（`jui viz cloud-prices fetch`）はネットへ出て viz のホームに書くので **MCP 非公開**（CLI で行う）。jsonui-doc が古くて `--json` の形が違うと、どのキーが無いかを名指しして失敗する。

## Testing

単体テストは [vitest](https://vitest.dev/)（ESM ネイティブで本リポジトリのモジュール構成とそのまま噛み合うため採用）。

```bash
npm ci --ignore-scripts   # postinstall の snapshot fetch をスキップ（CI と同じ手順）
npm test                  # 全テスト実行
npm run test:watch        # watch モード
```

テストは完全に自己完結:

- ネットワーク・実 `jui` / `jsonui-doc` CLI・実プロジェクトには一切依存しない（`child_process` はモック、プロジェクトは tmp dir の fixture）
- `~/.jsonui-cli/` / `$JSONUI_CLI_PATH` / `$JUI_PROJECT_DIR` はテスト内で差し替え（`tests/setup.ts`）
- bundled snapshot（`data/*.json`）の妥当性テストはコミット済みの実データに対して走る。CI が `npm ci --ignore-scripts` を使うのはこのため（postinstall がリモート最新で `data/` を上書きするとコミット対象のデータを検証できなくなる）
- `scripts/fetch-definitions.js` のネットワーク挙動はテスト対象外

CI は `.github/workflows/test.yml`（Node 20 / 22 matrix、main への push と PR で実行）。

## Prerequisites

- Node.js 18+
- `jui` CLI (`pip install jui-tools`)
- `jsonui-doc` CLI (`pip install jsonui-doc-cli`)
