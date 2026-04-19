# JsonUI MCP Server 設計書

## 概要

エージェントがJsonUIコンポーネントの仕様を調べる際に使用するMCPサーバー。
エージェントが複数ファイル（attribute_definitions.json、converter ソースコード、type_converter.rb等）を都度読みに行く代わりに、MCPツールを呼ぶだけで正確な仕様を即座に取得できるようにする。

### 現状の問題

エージェントがコンポーネントの仕様を調べるために毎回以下を読んでいる：
- `attribute_definitions.json`（3756行、29コンポーネント）
- `type_converter.rb` / `type_mapping.json`
- `binding_validator.rb`
- 各プラットフォームのコンバーターソースコード（Ruby / Swift / Kotlin）

### 解決策

正確な仕様書（JSON）をMCPサーバーに持たせ、エージェントがツールを呼ぶだけで必要な情報を返す。

---

## 仕様書JSON設計

### ファイル構成

```
specs/
├── components/          # コンポーネント別仕様
│   ├── label.json
│   ├── text_field.json
│   ├── button.json
│   ├── image.json
│   ├── network_image.json
│   ├── view.json
│   ├── scroll_view.json
│   ├── collection.json
│   ├── switch.json
│   ├── toggle.json
│   ├── check_box.json
│   ├── radio.json
│   ├── select_box.json
│   ├── segment.json
│   ├── slider.json
│   ├── progress.json
│   ├── indicator.json
│   ├── circle_view.json
│   ├── gradient_view.json
│   ├── blur.json
│   ├── icon_label.json
│   ├── web.json
│   ├── safe_area_view.json
│   ├── tab_view.json
│   ├── text_view.json
│   ├── edit_text.json
│   └── input.json
├── common_attributes.json    # 全コンポーネント共通属性（131属性）
├── modifier_order.json       # プラットフォーム別modifier適用順序
├── binding_rules.json        # binding構文ルール
└── platform_mapping.json     # プラットフォーム間の値変換ルール
```

### コンポーネント仕様フォーマット（例: text_field.json）

```json
{
  "name": "TextField",
  "description": "テキスト入力フィールド",
  "aliases": ["EditText", "Input"],
  "platforms": {
    "swift_generated": true,
    "swift_dynamic": true,
    "kotlin_generated": true,
    "kotlin_dynamic": true,
    "react": true
  },
  "attributes": {
    "text": {
      "type": ["string", "binding"],
      "description": "入力テキスト",
      "bindingDirection": "two-way",
      "required": false
    },
    "hint": {
      "type": "string",
      "description": "プレースホルダーテキスト",
      "aliases": ["placeholder"]
    },
    "input": {
      "type": {
        "enum": ["text", "email", "password", "number", "phone", "url", "search"]
      },
      "description": "入力タイプ。password指定時はSwiftUIでSecureFieldに切替"
    },
    "secure": {
      "type": "boolean",
      "description": "パスワード入力モード（input='password'と同等）"
    },
    "enabled": {
      "type": ["boolean", "binding"],
      "description": "入力可否",
      "bindingDirection": "read-only",
      "default": true
    },
    "maxLines": {
      "type": "number",
      "description": "最大行数",
      "default": 1
    },
    "fieldId": {
      "type": "string",
      "description": "フォーカス管理用ID。nextFocusIdと組み合わせてフォーカスチェーンを構成"
    },
    "nextFocusId": {
      "type": "string",
      "description": "サブミット時に次にフォーカスするフィールドのfieldId"
    },
    "returnKeyType": {
      "type": {
        "enum": ["done", "next", "search", "send", "go"]
      },
      "description": "キーボードのリターンキータイプ"
    },
    "autocapitalizationType": {
      "type": {
        "enum": ["none", "words", "sentences", "allCharacters"]
      },
      "description": "自動大文字化"
    },
    "autocorrectionType": {
      "type": {
        "enum": ["default", "yes", "no"]
      },
      "description": "自動修正"
    },
    "contentType": {
      "type": "string",
      "description": "テキストコンテンツタイプ（emailAddress, password等）"
    },
    "fontSize": {
      "type": ["number", "binding"],
      "description": "フォントサイズ"
    },
    "fontColor": {
      "type": ["string", "binding"],
      "description": "テキスト色"
    },
    "fontWeight": {
      "type": "string",
      "description": "フォントウェイト（bold, light等）"
    },
    "hintColor": {
      "type": "string",
      "description": "プレースホルダー色"
    },
    "tintColor": {
      "type": "string",
      "description": "キャレット色（SwiftUI: caretAttributesでも指定可）"
    },
    "textAlign": {
      "type": {
        "enum": ["left", "center", "right"]
      },
      "description": "テキスト配置"
    },
    "borderColor": {
      "type": "string",
      "description": "ボーダー色"
    },
    "borderWidth": {
      "type": "number",
      "description": "ボーダー幅"
    },
    "highlightBackground": {
      "type": "string",
      "description": "フォーカス時の背景色"
    },
    "onTextChange": {
      "type": "callback",
      "description": "テキスト変更時のコールバック",
      "signature": "(String) -> Void"
    },
    "onSubmit": {
      "type": "callback",
      "description": "サブミット時のコールバック",
      "signature": "() -> Void"
    }
  },
  "bindingBehavior": {
    "text": {
      "direction": "two-way",
      "swift": "$data.propertyName",
      "kotlin": "updateData(mapOf(varName to newValue))",
      "react": "value={data.prop} onChange={(e) => data.onPropChange?.(e.target.value)}"
    },
    "enabled": {
      "direction": "read-only",
      "swift": "data.propertyName",
      "kotlin": "resolveBoolean(json, \"enabled\", data, default = true)",
      "react": "disabled={!data.prop}"
    }
  },
  "platformSpecific": {
    "swift": {
      "generatedView": "SecureField（input=password時）/ TextField",
      "focusManagement": "@FocusState変数を生成、nextFocusIdでチェーン構成",
      "caretAttributes": "tintColorまたはcaretAttributes.colorでキャレット色指定"
    },
    "kotlin": {
      "composable": "OutlinedTextField / BasicTextField",
      "focusManagement": "FocusManager.requestFocus(nextFocusId)",
      "inputType": "contentType/inputに基づくKeyboardOptions設定"
    },
    "react": {
      "element": "<input type=\"...\"/>",
      "autoHandler": "text binding時にonPropChange自動生成",
      "inputType": "email→email, password→password, number→number, phone→tel"
    }
  },
  "rules": [
    "input='password'の場合、SwiftUIではSecureFieldが使用される",
    "fieldIdとnextFocusIdの組み合わせでフォーカスチェーンを構成",
    "text属性のbindingは必ずtwo-way（$data.）で生成すること",
    "Reactではtext bindingからonXxxChange関数が自動生成される"
  ]
}
```

### common_attributes.json フォーマット

```json
{
  "description": "全コンポーネント共通の属性定義（131属性）",
  "source": "attribute_definitions.json の common セクション",
  "categories": {
    "sizing": {
      "width": {
        "type": ["number", {"enum": ["matchParent", "wrapContent"]}, "binding"],
        "required": true,
        "description": "幅。weightが指定されている場合は不要",
        "platformMapping": {
          "matchParent": {
            "swift": ".infinity (frame maxWidth)",
            "kotlin": "Modifier.fillMaxWidth()",
            "react": "w-full"
          },
          "wrapContent": {
            "swift": "省略（デフォルト）",
            "kotlin": "Modifier.wrapContentWidth()",
            "react": "w-fit"
          }
        }
      },
      "height": { "...同様..." },
      "minWidth": { "type": ["number", "binding"] },
      "maxWidth": { "type": ["number", "binding"] },
      "minHeight": { "type": ["number", "binding"] },
      "maxHeight": { "type": ["number", "binding"] },
      "weight": { "type": ["number", "binding"], "description": "フレキシブルレイアウトのウェイト。0は無視" },
      "aspectRatio": { "type": "number" }
    },
    "spacing": {
      "padding": {
        "type": ["number", "array"],
        "description": "内部余白。配列の場合 [top, right, bottom, left] または [vertical, horizontal]"
      },
      "margin": { "...同様..." },
      "paddingTop": { "type": "number" },
      "paddingBottom": { "type": "number" },
      "paddingStart": { "type": "number", "description": "RTL対応の開始側パディング" },
      "paddingEnd": { "type": "number", "description": "RTL対応の終了側パディング" },
      "insets": { "type": "number", "description": "edge inset" },
      "insetHorizontal": { "type": "number" }
    },
    "visual": {
      "background": { "type": ["string", "binding"], "description": "背景色" },
      "cornerRadius": { "type": ["number", "binding"] },
      "borderWidth": { "type": ["number", "binding"] },
      "borderColor": { "type": ["string", "binding"] },
      "borderStyle": { "type": {"enum": ["solid", "dashed", "dotted"]}, "default": "solid" },
      "opacity": { "type": ["number", "binding"], "aliases": ["alpha"] },
      "shadow": { "type": ["boolean", "string", "object"] },
      "clipToBounds": { "type": "boolean" }
    },
    "visibility": {
      "hidden": { "type": ["boolean", "binding"], "description": "非表示（スペースは保持）" },
      "visibility": { "type": ["string", "binding"], "description": "binding時は条件付きレンダリング" },
      "gone": { "type": ["boolean", "binding"], "description": "非表示（スペースも除去）" }
    },
    "interaction": {
      "onClick": { "type": "binding", "description": "タップイベント（binding形式: @{handler}）" },
      "onclick": { "type": "string", "description": "タップイベント（セレクタ形式: 関数名文字列）" },
      "enabled": { "type": ["boolean", "binding"], "default": true },
      "userInteractionEnabled": { "type": "boolean", "default": true }
    },
    "layout": {
      "gravity": {
        "type": "string",
        "description": "配置。center, centerHorizontal, centerVertical, top, bottom, left, right"
      },
      "orientation": {
        "type": {"enum": ["horizontal", "vertical"]},
        "description": "子要素の配置方向（View/ScrollViewで使用）"
      }
    },
    "lifecycle": {
      "onAppear": { "type": "binding", "description": "表示時コールバック" },
      "onDisappear": { "type": "binding", "description": "非表示時コールバック" }
    },
    "accessibility": {
      "accessibilityIdentifier": { "type": "string", "description": "テスト用ID。id属性から自動設定" }
    }
  }
}
```

### modifier_order.json フォーマット

```json
{
  "description": "プラットフォーム別のmodifier適用順序。順序はレンダリング結果に影響するため厳守",
  "swift": {
    "order": [
      "centerAlignment",
      "edgeAlignment",
      "padding",
      "frameConstraints (min/max)",
      "frameSize (width/height)",
      "insets/insetHorizontal",
      "background",
      "cornerRadius",
      "border (must be after cornerRadius)",
      "margins",
      "alpha/opacity",
      "shadow",
      "clipping",
      "offset",
      "visibility (hidden/opacity ternary)",
      "safeAreaInsets",
      "disabled",
      "tag (for TabView)",
      "tintColor",
      "onClick/onTapGesture",
      "lifecycle (onAppear/onDisappear)",
      "confirmationDialog",
      "accessibilityIdentifier"
    ],
    "criticalRules": [
      "background MUST come after padding（背景がpadding領域を含むため）",
      "border MUST come after cornerRadius（角丸ボーダーのため）",
      "frame MUST come before margins（サイズ確定後に外部余白）",
      "Image: .resizable() must come first, then .aspectRatio"
    ]
  },
  "kotlin": {
    "order": [
      "testTag",
      "margins",
      "weight (caller applies)",
      "size (width/height, matchParent/wrapContent, min/max/aspectRatio)",
      "alpha/opacity",
      "shadow/elevation",
      "background (cornerRadius → clip → border → bgColor)",
      "clickable",
      "padding",
      "alignment (RowScope/ColumnScope/BoxScope)"
    ],
    "criticalRules": [
      "Modifier.then() chains left-to-right; order matters",
      "margins before size（外側から内側へ）",
      "cornerRadius must be applied as clip before background"
    ]
  },
  "react": {
    "note": "ReactはTailwind CSSクラスの結合なので順序制約は少ない",
    "classOrder": [
      "layout (flex, flex-col/row)",
      "sizing (w-*, h-*)",
      "spacing (p-*, m-*)",
      "typography (text-*, font-*)",
      "visual (bg-*, rounded-*, border-*, shadow-*)",
      "opacity",
      "overflow",
      "cursor/interaction"
    ],
    "dynamicStyles": "Tailwindでマッピングできない値はinline style objectに格納"
  }
}
```

### binding_rules.json フォーマット

```json
{
  "description": "JsonUIのbinding構文ルール",
  "format": {
    "bindingExpression": "@{propertyName}",
    "negation": "@{!propertyName}",
    "defaultValue": "@{propertyName ?? defaultValue}",
    "nestedPath": "@{user.name}（Kotlin Dynamic Mode）"
  },
  "directions": {
    "two-way": {
      "description": "コンポーネントの状態変更がデータに反映される",
      "swift": "$data.propertyName",
      "kotlin": "mutableStateOf + updateData callback",
      "react": "value={data.prop} + auto-generated onChange",
      "applicableAttributes": [
        "TextField.text",
        "TextView.text",
        "Switch.isOn",
        "Toggle.isOn",
        "CheckBox.checked",
        "Slider.value",
        "Segment.selectedIndex",
        "Radio.selectedIndex",
        "SelectBox.selectedIndex"
      ]
    },
    "read-only": {
      "description": "データの値を表示するのみ",
      "swift": "data.propertyName",
      "kotlin": "data[propertyName]",
      "react": "{data.propertyName}",
      "applicableAttributes": [
        "Label.text",
        "*.width / *.height（frame値）",
        "*.enabled",
        "*.hidden / *.visibility",
        "*.background / *.fontColor",
        "*.fontSize",
        "*.opacity / *.alpha"
      ]
    }
  },
  "criticalRules": [
    "frame値（width, height等）は必ずread-only（data.）。$data.は不可",
    "two-way bindingは状態を持つ入力コンポーネントのみ",
    "Reactではtwo-way binding時にonPropertyNameChange関数が自動生成される",
    "Kotlin DynamicではupdateData(mapOf(key to value))でデータを更新",
    "onclick（小文字）はセレクタ形式（文字列）、onClick（キャメル）はbinding形式（@{handler}）"
  ]
}
```

### platform_mapping.json フォーマット

```json
{
  "description": "プラットフォーム間の属性値変換マッピング",
  "values": {
    "matchParent": {
      "swift": ".infinity (frame maxWidth/maxHeight)",
      "kotlin": "fillMaxWidth() / fillMaxHeight()",
      "react": "w-full / h-full"
    },
    "wrapContent": {
      "swift": "デフォルト（frame指定なし）",
      "kotlin": "wrapContentWidth() / wrapContentHeight()",
      "react": "w-fit / h-fit"
    }
  },
  "contentMode": {
    "aspectFit": { "swift": ".fit", "kotlin": "ContentScale.Fit", "react": "object-contain" },
    "aspectFill": { "swift": ".fill", "kotlin": "ContentScale.Crop", "react": "object-cover" },
    "scaleToFill": { "swift": ".fill (no aspectRatio)", "kotlin": "ContentScale.FillBounds", "react": "object-fill" }
  },
  "textAlign": {
    "left": { "swift": ".leading", "kotlin": "TextAlign.Start", "react": "text-left" },
    "center": { "swift": ".center", "kotlin": "TextAlign.Center", "react": "text-center" },
    "right": { "swift": ".trailing", "kotlin": "TextAlign.End", "react": "text-right" }
  },
  "fontWeight": {
    "bold": { "swift": ".bold", "kotlin": "FontWeight.Bold", "react": "font-bold" },
    "light": { "swift": ".light", "kotlin": "FontWeight.Light", "react": "font-light" },
    "thin": { "swift": ".thin", "kotlin": "FontWeight.Thin", "react": "font-thin" },
    "medium": { "swift": ".medium", "kotlin": "FontWeight.Medium", "react": "font-medium" },
    "semibold": { "swift": ".semibold", "kotlin": "FontWeight.SemiBold", "react": "font-semibold" }
  },
  "orientation": {
    "horizontal": { "swift": "HStack", "kotlin": "Row", "react": "flex flex-row" },
    "vertical": { "swift": "VStack", "kotlin": "Column", "react": "flex flex-col" },
    "none": { "swift": "ZStack", "kotlin": "Box", "react": "relative" }
  },
  "gravity": {
    "center": {
      "swift": ".center alignment",
      "kotlin": "Alignment.Center / Arrangement.Center",
      "react": "items-center justify-center"
    },
    "centerHorizontal": {
      "swift_vertical": "HStack alignment .center",
      "swift_horizontal": "not applicable",
      "kotlin_vertical": "Alignment.CenterHorizontally",
      "react": "items-center (flex-col)"
    },
    "centerVertical": {
      "swift_horizontal": "VStack alignment .center",
      "kotlin_horizontal": "Alignment.CenterVertically",
      "react": "items-center (flex-row)"
    }
  },
  "types": {
    "String": { "swift": "String", "kotlin": "String", "react": "string" },
    "Int": { "swift": "Int", "kotlin": "Int", "react": "number" },
    "Float": { "swift": "CGFloat", "kotlin": "Float", "react": "number" },
    "Double": { "swift": "Double", "kotlin": "Double", "react": "number" },
    "Bool": { "swift": "Bool", "kotlin": "Boolean", "react": "boolean" },
    "Array": { "swift": "[T]", "kotlin": "List<T>", "react": "T[]" },
    "Dictionary": { "swift": "[String: Any]", "kotlin": "Map<String, Any>", "react": "Record<string, any>" }
  }
}
```

---

## MCPサーバー設計

### 技術スタック

- **言語**: TypeScript（MCP SDK公式サポート）
- **フレームワーク**: `@modelcontextprotocol/sdk`
- **データ**: JSONファイル（specs/ディレクトリ）
- **トランスポート**: stdio（Claude Code統合用）

### ツール定義

| ツール名 | 引数 | 戻り値 | 用途 |
|----------|------|--------|------|
| `lookup_component` | `name: string` | コンポーネント仕様全体 | コンポーネントの属性・binding・ルールを一括取得 |
| `lookup_attribute` | `name: string` | 属性定義 + 所属コンポーネント | 特定属性の詳細を取得 |
| `search_components` | `query: string` | マッチするコンポーネント/属性リスト | キーワード検索（binding対応属性一覧等） |
| `get_modifier_order` | `platform: "swift" \| "kotlin" \| "react"` | modifier適用順序 | コード生成時の順序確認 |
| `get_binding_rules` | なし | binding構文ルール全体 | binding実装時の参照 |
| `get_platform_mapping` | `attribute: string, from: string, to: string` | 変換ルール | クロスプラットフォーム変換 |

### プロジェクト構成

```
jsonui-mcp-server/
├── docs/
│   └── design.md              # この設計書
├── specs/
│   ├── components/            # コンポーネント別仕様JSON
│   │   ├── label.json
│   │   ├── text_field.json
│   │   └── ...
│   ├── common_attributes.json
│   ├── modifier_order.json
│   ├── binding_rules.json
│   └── platform_mapping.json
├── src/
│   ├── index.ts               # MCPサーバーエントリポイント
│   ├── tools/
│   │   ├── lookup_component.ts
│   │   ├── lookup_attribute.ts
│   │   ├── search_components.ts
│   │   ├── get_modifier_order.ts
│   │   ├── get_binding_rules.ts
│   │   └── get_platform_mapping.ts
│   └── spec_loader.ts         # JSON仕様書ローダー
├── install.sh                 # インストーラー
├── uninstall.sh               # アンインストーラー
├── package.json
├── tsconfig.json
└── README.md
```

### Claude Code 統合

`~/.claude/settings.json` に追加:
```json
{
  "mcpServers": {
    "jsonui-spec": {
      "command": "node",
      "args": ["<install_path>/dist/index.js"]
    }
  }
}
```

### インストーラー設計

#### install.sh

GitHubからclone後に実行するインストールスクリプト。

**処理内容**:
1. 依存パッケージのインストール（`npm install`）
2. TypeScriptビルド（`npm run build`）
3. `~/.claude/settings.json` にMCPサーバー設定を自動追加

**settings.json 更新ロジック**:
- ファイルが存在しない場合: 新規作成
- ファイルが存在する場合: 既存のJSONを読み込み、`mcpServers.jsonui-spec` を追加/更新
- 既存の他のMCPサーバー設定は保持
- `args` のパスは `install.sh` の実行ディレクトリから自動解決（絶対パス）

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "=== JsonUI MCP Server Installer ==="

# 1. Install dependencies
echo "Installing dependencies..."
cd "$SCRIPT_DIR"
npm install

# 2. Build
echo "Building..."
npm run build

# 3. Update Claude Code settings
echo "Configuring Claude Code..."
mkdir -p "$HOME/.claude"

if [ ! -f "$SETTINGS_FILE" ]; then
  # Create new settings file
  cat > "$SETTINGS_FILE" << EOF
{
  "mcpServers": {
    "jsonui-spec": {
      "command": "node",
      "args": ["$SCRIPT_DIR/dist/index.js"]
    }
  }
}
EOF
else
  # Update existing settings file using node
  node -e "
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
    if (!settings.mcpServers) settings.mcpServers = {};
    settings.mcpServers['jsonui-spec'] = {
      command: 'node',
      args: ['$SCRIPT_DIR/dist/index.js']
    };
    fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
  "
fi

echo ""
echo "Installation complete!"
echo "  Server path: $SCRIPT_DIR/dist/index.js"
echo "  Settings: $SETTINGS_FILE"
echo ""
echo "Restart Claude Code to activate the MCP server."
```

#### uninstall.sh

**処理内容**:
1. `~/.claude/settings.json` から `jsonui-spec` エントリを削除
2. 他のMCPサーバー設定は保持

```bash
#!/bin/bash
set -e

SETTINGS_FILE="$HOME/.claude/settings.json"

echo "=== JsonUI MCP Server Uninstaller ==="

if [ -f "$SETTINGS_FILE" ]; then
  node -e "
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
    if (settings.mcpServers && settings.mcpServers['jsonui-spec']) {
      delete settings.mcpServers['jsonui-spec'];
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
      console.log('Removed jsonui-spec from Claude Code settings.');
    } else {
      console.log('jsonui-spec not found in settings.');
    }
  "
else
  echo "Settings file not found: $SETTINGS_FILE"
fi

echo "Uninstall complete. Restart Claude Code to apply."
```

#### GitHub からのインストール手順

```bash
# 1. Clone
git clone https://github.com/<org>/jsonui-mcp-server.git

# 2. Install (dependencies + build + Claude Code settings)
cd jsonui-mcp-server
./install.sh

# 3. Restart Claude Code
```

---

## 作業順序

1. **仕様書作成**: `attribute_definitions.json` + コンバーター知識からコンポーネント仕様JSONを生成
2. **共通ファイル作成**: common_attributes.json, modifier_order.json, binding_rules.json, platform_mapping.json
3. **MCPサーバー実装**: TypeScriptでJSON読み込み → ツール提供
4. **インストーラー実装**: install.sh / uninstall.sh
5. **Claude Code統合テスト**: インストール → ツール呼び出し確認
6. **エージェント更新**: スキル定義にMCPツール使用を追記（任意）
