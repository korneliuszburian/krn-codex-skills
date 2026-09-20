#!/bin/sh
# Terminal-Bench setup for the KRN lane agent: the opencode binary and the lane
# home are copied into /installed-agent by the agent, so this script only makes
# them usable inside the task container.
set -e
mkdir -p /installed-agent/home/.config/opencode /installed-agent/home/.local/share/opencode
if [ -f /installed-agent/auth.json ]; then
  cp /installed-agent/auth.json /installed-agent/home/.local/share/opencode/auth.json
  chmod 600 /installed-agent/home/.local/share/opencode/auth.json
fi
chmod +x /installed-agent/opencode
/installed-agent/opencode --version || echo "opencode binary check failed"
