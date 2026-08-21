#!/usr/bin/env bash
set -e

# Color output helpers
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Resolve project root relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo -e "${YELLOW}=== Building WebAssembly Module ===${NC}"

# 1. Source EMSDK environment if not already loaded
if ! command -v emcmake &> /dev/null; then
    EMSDK_SCRIPT="$HOME/emsdk/emsdk_env.sh"
    if [ -f "$EMSDK_SCRIPT" ]; then
        echo "Loading Emscripten environment from $EMSDK_SCRIPT..."
        source "$EMSDK_SCRIPT" > /dev/null 2>&1
    else
        echo -e "${RED}Error: emcmake not found and $EMSDK_SCRIPT does not exist.${NC}"
        echo "Please install EMSDK in your home directory (~/emsdk)."
        exit 1
    fi
fi

# 2. Handle clean build flag (--clean or -c)
if [ "$1" == "--clean" ] || [ "$1" == "-c" ]; then
    echo "Cleaning previous build artifacts in build_wasm and web/dist..."
    rm -rf build_wasm web/dist/*
fi

# 3. Ensure target directory exists
mkdir -p web/dist

# 4. Configure CMake
echo "Configuring CMake with Emscripten..."
emcmake cmake -B build_wasm

# 5. Build Wasm module
echo "Compiling WebAssembly target..."
cmake --build build_wasm --target pathfinder_wasm

echo -e "${GREEN}✓ Build complete! Artifacts generated in web/dist/${NC}"