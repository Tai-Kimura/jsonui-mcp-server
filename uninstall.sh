#!/bin/bash
set -e

INSTALL_DIR="$HOME/.jsonui-mcp-server"
CLAUDE_JSON="$HOME/.claude.json"

echo "=== JUI Tools MCP Server Uninstaller ==="

# 1. Remove from ~/.claude.json
if [ -f "$CLAUDE_JSON" ]; then
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$CLAUDE_JSON', 'utf8'));
    let removed = false;
    if (data.mcpServers) {
      if (data.mcpServers['jui-tools']) {
        delete data.mcpServers['jui-tools'];
        removed = true;
      }
      if (data.mcpServers['jsonui-spec']) {
        delete data.mcpServers['jsonui-spec'];
        removed = true;
      }
    }
    if (removed) {
      fs.writeFileSync('$CLAUDE_JSON', JSON.stringify(data, null, 2));
      console.log('Removed MCP server entries from Claude Code config.');
    } else {
      console.log('No MCP server entries found in config.');
    }
  "
else
  echo "Config file not found: $CLAUDE_JSON"
fi

# 2. Remove installed files
if [ -d "$INSTALL_DIR" ]; then
  echo "Removing $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"
  echo "Removed installation directory."
else
  echo "Installation directory not found: $INSTALL_DIR"
fi

echo ""
echo "Uninstall complete. Restart Claude Code to apply."
