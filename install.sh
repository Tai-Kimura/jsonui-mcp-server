#!/bin/bash
set -e

REPO_URL="${JSONUI_MCP_REPO:-https://github.com/Tai-Kimura/jsonui-mcp-server.git}"
INSTALL_DIR="${JSONUI_MCP_DIR:-$HOME/.jsonui-mcp-server}"
CLAUDE_JSON="${CLAUDE_JSON:-$HOME/.claude.json}"
NODE_BIN="$(which node)"

if [ -z "$NODE_BIN" ]; then
  echo "Error: node not found in PATH. Install Node.js first." >&2
  exit 1
fi

echo "=== JUI Tools MCP Server Installer ==="
echo "  Repo:    $REPO_URL"
echo "  Install: $INSTALL_DIR"
echo "  Node:    $NODE_BIN"

# 1. Clone or update the repository
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git fetch origin
  git reset --hard origin/main
elif [ -d "$INSTALL_DIR" ]; then
  echo "Re-installing (previous directory had no .git)..."
  rm -rf "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
else
  echo "Cloning repository..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# 2. Install dependencies
echo "Installing dependencies..."
npm install

# 3. Build
echo "Building..."
npm run build

# 4. Register MCP server in ~/.claude.json
echo "Configuring Claude Code..."

if [ ! -f "$CLAUDE_JSON" ]; then
  cat > "$CLAUDE_JSON" << EOF
{
  "mcpServers": {
    "jui-tools": {
      "command": "$NODE_BIN",
      "args": ["$INSTALL_DIR/dist/index.js"]
    }
  }
}
EOF
else
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$CLAUDE_JSON', 'utf8'));
    if (!data.mcpServers) data.mcpServers = {};
    // Remove old entry if exists
    if (data.mcpServers['jsonui-spec']) {
      delete data.mcpServers['jsonui-spec'];
      console.log('Removed old jsonui-spec entry.');
    }
    data.mcpServers['jui-tools'] = {
      command: '$NODE_BIN',
      args: ['$INSTALL_DIR/dist/index.js']
    };
    fs.writeFileSync('$CLAUDE_JSON', JSON.stringify(data, null, 2));
  "
fi

echo ""
echo "Installation complete!"
echo "  Installed to: $INSTALL_DIR"
echo "  Server path: $INSTALL_DIR/dist/index.js"
echo "  Node: $NODE_BIN"
echo "  Config: $CLAUDE_JSON"
echo ""
echo "To set a default project directory, add env to your MCP config:"
echo '  "jui-tools": {'
echo '    "command": "'$NODE_BIN'",'
echo '    "args": ["'$INSTALL_DIR'/dist/index.js"],'
echo '    "env": { "JUI_PROJECT_DIR": "/path/to/your/project" }'
echo '  }'
echo ""
echo "Restart Claude Code to activate the MCP server."
