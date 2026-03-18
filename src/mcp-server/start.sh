#!/bin/bash
# MCP server wrapper — logs all output for debugging
LOG="/tmp/juggernaut-mcp.log"
echo "=== MCP Start $(date) ===" >> "$LOG"
echo "Node: $(which node)" >> "$LOG"
echo "Node version: $(node --version 2>&1)" >> "$LOG"
echo "PWD: $(pwd)" >> "$LOG"
echo "Args: $@" >> "$LOG"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Script dir: $SCRIPT_DIR" >> "$LOG"
echo "Dist exists: $(ls -la "$SCRIPT_DIR/dist/index.js" 2>&1)" >> "$LOG"

exec /opt/homebrew/bin/node "$SCRIPT_DIR/dist/index.js" 2>> "$LOG"
