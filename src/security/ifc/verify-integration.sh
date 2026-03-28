#!/bin/bash
# IFC Integration Verification Script
# Run this to verify all IFC files are properly set up

set -e

echo "🔍 Verifying FIDES IFC Integration..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter
PASS=0
FAIL=0

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $1 (MISSING)"
    ((FAIL++))
  fi
}

check_export() {
  if grep -q "$2" "$1" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $1 exports $2"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $1 missing export: $2"
    ((FAIL++))
  fi
}

echo "📁 Checking core files..."
check_file "src/security/ifc/core.ts"
check_file "src/security/ifc/tool-wrapper.ts"
check_file "src/security/ifc/executor.ts"
check_file "src/security/ifc/index.ts"
check_file "src/security/ifc/gateway-integration.ts"
check_file "src/middleware/ifc-middleware.ts"
check_file "src/middleware/index.ts"

echo ""
echo "📚 Checking documentation..."
check_file "src/security/ifc/USAGE.md"
check_file "src/security/ifc/INTEGRATION-SUMMARY.md"
check_file "src/security/ifc/README-Integration.md"

echo ""
echo "🔗 Checking exports..."
check_export "src/security/ifc/index.ts" "export.*from.*core"
check_export "src/security/ifc/index.ts" "export.*from.*tool-wrapper"
check_export "src/security/ifc/index.ts" "export.*from.*executor"
check_export "src/security/index.ts" "export.*from.*ifc"
check_export "src/middleware/index.ts" "export.*from.*ifc-middleware"
check_export "src/index.ts" "FidesPlanner"
check_export "src/index.ts" "IFCSecurityMiddleware"

echo ""
echo "═══════════════════════════════════════"
echo -e "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo "═══════════════════════════════════════"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}⚠️  Some checks failed. Please review the missing files/exports.${NC}"
  exit 1
else
  echo ""
  echo -e "${GREEN}✅ All checks passed! IFC integration is complete.${NC}"
  exit 0
fi
