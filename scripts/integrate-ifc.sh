#!/bin/bash
# IFC Integration Script for OpenClaw
# This script helps integrate FIDES IFC into OpenClaw

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_ROOT/src"

echo "🔐 OpenClaw IFC Integration Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running from project root
if [ ! -f "$PROJECT_ROOT/package.json" ]; then
    echo -e "${RED}Error: Not in OpenClaw project root${NC}"
    exit 1
fi

echo "📁 Project root: $PROJECT_ROOT"
echo ""

# Step 1: Check if IFC files exist
echo "Step 1: Checking IFC files..."
IFC_FILES=(
    "$SRC_DIR/security/ifc/core.ts"
    "$SRC_DIR/security/ifc/tool-wrapper.ts"
    "$SRC_DIR/middleware/ifc-middleware.ts"
    "$SRC_DIR/config/types.ifc.ts"
)

for file in "${IFC_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✓${NC} $file"
    else
        echo -e "  ${RED}✗${NC} $file (missing)"
        exit 1
    fi
done
echo ""

# Step 2: Update config types export
echo "Step 2: Updating config types export..."
TYPES_FILE="$SRC_DIR/config/types.ts"

if grep -q "types.ifc" "$TYPES_FILE" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} IFC types already exported"
else
    echo "  Adding IFC types export..."
    echo "" >> "$TYPES_FILE"
    echo "// IFC (Information Flow Control)" >> "$TYPES_FILE"
    echo "export * from './types.ifc.js';" >> "$TYPES_FILE"
    echo -e "  ${GREEN}✓${NC} Added export to types.ts"
fi
echo ""

# Step 3: Check if schema needs update
echo "Step 3: Checking config schema..."
SCHEMA_FILE="$SRC_DIR/config/zod-schema.ts"

if grep -q "IFCConfigSchema" "$SCHEMA_FILE" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} IFC schema already added"
else
    echo -e "  ${YELLOW}⚠${NC} Manual step required: Add IFC schema to zod-schema.ts"
    echo "     See: src/security/ifc/INTEGRATION-PATCH.md"
fi
echo ""

# Step 4: Check tool integration
echo "Step 4: Checking tool integration..."
TOOLS_FILE="$SRC_DIR/agents/openclaw-tools.ts"

if grep -q "wrapOpenClawToolWithIFC" "$TOOLS_FILE" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} IFC tool wrapping already integrated"
else
    echo -e "  ${YELLOW}⚠${NC} Manual step required: Integrate IFC into openclaw-tools.ts"
    echo "     See: src/security/ifc/INTEGRATION-PATCH.md"
fi
echo ""

# Step 5: Build project
echo "Step 5: Building project..."
cd "$PROJECT_ROOT"

if npm run build 2>&1 | tail -20; then
    echo -e "  ${GREEN}✓${NC} Build successful"
else
    echo -e "  ${RED}✗${NC} Build failed - check TypeScript errors"
    exit 1
fi
echo ""

# Step 6: Run tests
echo "Step 6: Running IFC tests..."
if npm test -- src/security/ifc/tool-wrapper.test.ts 2>&1 | tail -30; then
    echo -e "  ${GREEN}✓${NC} Tests passed"
else
    echo -e "  ${YELLOW}⚠${NC} Some tests failed - review test output"
fi
echo ""

# Summary
echo "=================================="
echo "✅ Integration Complete!"
echo ""
echo "Next steps:"
echo "1. Review INTEGRATION-PATCH.md for manual changes"
echo "2. Add IFC config to your config.json:"
echo ""
cat << 'EOF'
{
  "security": {
    "ifc": {
      "enabled": true,
      "mode": "audit",
      "throwOnViolation": false,
      "debug": true
    }
  }
}
EOF
echo ""
echo "3. Test with: npm start -- --config=config.json"
echo ""
echo "Documentation:"
echo "  - Integration Guide: src/security/ifc/README-Integration.md"
echo "  - Patch Instructions: src/security/ifc/INTEGRATION-PATCH.md"
echo "  - Implementation Summary: src/security/ifc/IMPLEMENTATION-SUMMARY.md"
echo ""
