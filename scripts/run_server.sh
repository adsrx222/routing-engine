#!/usr/bin/env bash
set -e

# Color output helpers
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Resolve project root relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

PORT="${1:-8000}"

cd "$PROJECT_ROOT"

echo -e "${YELLOW}=== Starting Local HTTP Server ===${NC}"

# Automatically copy graph files to the web directory
if [ -f "workspace/graph.bin" ]; then
    echo -e "${GREEN}Copying graph.bin to web directory...${NC}"
    cp workspace/graph.bin web/
else
    echo -e "${YELLOW}Warning: workspace/graph.bin not found! Please run download_graphs.py first.${NC}"
fi

echo -e "${GREEN}Server running at:${NC} ${BLUE}http://localhost:${PORT}/web/${NC}"
echo "Press Ctrl+C to stop."

# Automatically open in browser on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    (sleep 1 && open "http://localhost:${PORT}/web/") &
fi

# Serve from project root so both web/ and workspace/*.bin data files are accessible
python3 -m http.server "$PORT"