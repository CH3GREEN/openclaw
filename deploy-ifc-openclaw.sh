#!/bin/bash
# OpenClaw IFC 增强版 - 全新机器快速部署脚本
# 版本：2026.2.23
# 适用：Ubuntu 20.04+

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 标题
echo "========================================"
echo "🚀 OpenClaw IFC 增强版 - 快速部署"
echo "========================================"
echo ""
echo "版本：2026.2.23 IFC Enhanced"
echo "预计时间：15-30 分钟"
echo ""

# 检查是否 root
if [ "$EUID" -eq 0 ]; then
    log_error "请不要使用 root 权限运行此脚本"
    exit 1
fi

# 检查 Ubuntu 版本
if [ ! -f /etc/os-release ]; then
    log_error "无法识别操作系统"
    exit 1
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" ]]; then
    log_warn "此脚本为 Ubuntu 优化，当前系统：$ID"
    read -p "是否继续？(y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "系统信息:"
echo "  OS: $PRETTY_NAME"
echo "  用户：$USER"
echo "  主机：$(hostname)"
echo ""

# 步骤 1: 系统更新
log_info "步骤 1/8: 更新系统..."
sudo apt update -qq
sudo apt upgrade -y -qq
sudo apt install -y -qq curl git wget build-essential python3 jq systemd
log_success "系统更新完成"
echo ""

# 步骤 2: 安装 Node.js
log_info "步骤 2/8: 安装 Node.js v22..."

# 检查是否已安装
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 22 ]; then
        log_success "Node.js 已安装：$(node --version)"
    else
        log_warn "Node.js 版本过低：$(node --version)，需要 v22+"
        read -p "是否升级？(y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo apt remove -y nodejs npm
        else
            log_error "Node.js v22+ 是必需的"
            exit 1
        fi
    fi
fi

# 安装 Node.js 22
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs
    log_success "Node.js 已安装：$(node --version)"
fi
echo ""

# 步骤 3: 安装 pnpm
log_info "步骤 3/8: 安装 pnpm..."
if ! command -v pnpm &> /dev/null; then
    sudo npm install -g pnpm
    log_success "pnpm 已安装：$(pnpm --version)"
else
    log_success "pnpm 已安装：$(pnpm --version)"
fi
echo ""

# 步骤 4: 检查 IFC 源代码
log_info "步骤 4/8: 检查 IFC 源代码..."
IFC_CODE_DIR=""

# 检查常见位置
if [ -d "$HOME/Desktop/code/openclaw" ]; then
    IFC_CODE_DIR="$HOME/Desktop/code/openclaw"
elif [ -d "$HOME/openclaw" ]; then
    IFC_CODE_DIR="$HOME/openclaw"
elif [ -d "$HOME/code/openclaw" ]; then
    IFC_CODE_DIR="$HOME/code/openclaw"
elif [ -d "$HOME/Desktop/openclaw" ]; then
    IFC_CODE_DIR="$HOME/Desktop/openclaw"
fi

if [ -z "$IFC_CODE_DIR" ]; then
    log_error "未找到 IFC 源代码目录"
    echo ""
    echo "请将 IFC 源代码复制到以下位置之一:"
    echo "  ~/Desktop/code/openclaw"
    echo "  ~/openclaw"
    echo "  ~/code/openclaw"
    echo "  ~/Desktop/openclaw"
    echo ""
    echo "或使用 git clone:"
    echo "  git clone <仓库地址> ~/Desktop/code/openclaw"
    exit 1
fi

log_success "IFC 源代码位置：$IFC_CODE_DIR"

# 检查必要文件
if [ ! -f "$IFC_CODE_DIR/package.json" ]; then
    log_error "未找到 package.json"
    exit 1
fi

if [ ! -d "$IFC_CODE_DIR/src/security/ifc" ]; then
    log_warn "未找到 IFC 源代码目录 (src/security/ifc)"
    echo "IFC 代码可能未正确复制"
    read -p "是否继续？(y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# 步骤 5: 安装依赖
log_info "步骤 5/8: 安装依赖..."
cd "$IFC_CODE_DIR"

# 清理旧依赖
if [ -d node_modules ]; then
    log_info "清理旧依赖..."
    rm -rf node_modules
fi

# 安装依赖（跳过可选的失败项）
pnpm install --ignore-scripts
log_success "依赖安装完成"
echo ""

# 步骤 6: 编译 IFC 代码
log_info "步骤 6/8: 编译 IFC 代码..."

# 进入 IFC 代码目录
cd "$IFC_CODE_DIR"

# 检查是否已编译
if [ -f dist/index.js ] && grep -q "IFCSecurityMiddleware" dist/index.js; then
    log_success "IFC 代码已编译"
else
    log_info "开始编译..."
    
    # 使用 npx 直接运行 tsdown（--yes 自动确认下载，无需全局安装）
    npx --yes tsdown
    
    # 验证
    if [ ! -f dist/index.js ]; then
        log_error "编译失败：未找到 dist/index.js"
        exit 1
    fi
    
    if ! grep -q "IFCSecurityMiddleware" dist/index.js; then
        log_error "编译失败：未找到 IFC 代码"
        exit 1
    fi
    
    log_success "IFC 代码编译完成"
fi

# 显示编译信息
DIST_SIZE=$(du -sh dist/ | cut -f1)
DIST_FILES=$(find dist/ -name "*.js" | wc -l)
log_success "编译产物：$DIST_FILES 个文件，$DIST_SIZE"
echo ""

# 步骤 7: 安装 OpenClaw 基础
log_info "步骤 7/8: 安装 OpenClaw 基础..."

# 检查是否已安装
if command -v openclaw &> /dev/null; then
    OPENCLAW_VERSION=$(openclaw --version 2>/dev/null || echo "未知")
    log_info "已安装 OpenClaw: $OPENCLAW_VERSION"
    read -p "是否重新安装？(y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo npm install -g openclaw
    fi
else
    sudo npm install -g openclaw
fi

log_success "OpenClaw 基础已安装：$(openclaw --version)"
echo ""

# 步骤 8: 安装 IFC 增强版
log_info "步骤 8/8: 安装 IFC 增强版..."

if [ -f "$IFC_CODE_DIR/scripts/install-ifc-global.sh" ]; then
    cd "$IFC_CODE_DIR"
    ./scripts/install-ifc-global.sh
    log_success "IFC 增强版已安装"
else
    log_warn "未找到安装脚本，手动安装..."
    
    # 创建全局目录
    sudo mkdir -p /usr/lib/node_modules/openclaw-ifc
    sudo chown -R $USER:$USER /usr/lib/node_modules/openclaw-ifc
    
    # 复制文件
    cp -r dist "$IFC_CODE_DIR/scripts" package.json openclaw.mjs /usr/lib/node_modules/openclaw-ifc/
    
    # 安装依赖（修复模块缺失问题）
    cd /usr/lib/node_modules/openclaw-ifc
    if [ -f package.json ]; then
        log_info "安装 IFC 依赖..."
        npm install --omit=dev --legacy-peer-deps --no-audit
        log_success "IFC 依赖安装完成"
    else
        log_warn "未找到 package.json，跳过依赖安装"
    fi
    
    # 创建链接
    if [ -L /usr/bin/openclaw ]; then
        sudo mv /usr/bin/openclaw /usr/bin/openclaw.original
    fi
    sudo ln -sf /usr/lib/node_modules/openclaw-ifc/openclaw.mjs /usr/bin/openclaw
    
    log_success "IFC 增强版已手动安装"
fi
echo ""

# 配置 IFC
log_info "配置 IFC..."

mkdir -p ~/.openclaw

# 检查是否有现有配置
if [ -f ~/.openclaw/openclaw.json ]; then
    log_info "检测到现有配置"
    
    # 添加 IFC 配置（如果不存在）
    if ! grep -q '"ifc"' ~/.openclaw/openclaw.json; then
        log_info "添加 IFC 配置..."
        # 使用 jq 添加 IFC 配置
        if command -v jq &> /dev/null; then
            jq '.ifc = {"enabled": true, "throwOnViolation": false, "debug": true, "policyMode": "audit"}' \
               ~/.openclaw/openclaw.json > /tmp/openclaw.json.tmp
            mv /tmp/openclaw.json.tmp ~/.openclaw/openclaw.json
            log_success "IFC 配置已添加"
        else
            log_warn "jq 未安装，请手动添加 IFC 配置"
        fi
    else
        log_success "IFC 配置已存在"
    fi
else
    log_info "创建新配置..."
    cat > ~/.openclaw/openclaw.json << 'EOF'
{
  "meta": {
    "lastTouchedVersion": "2026.2.23",
    "ifcEnhanced": true
  },
  "ifc": {
    "enabled": true,
    "throwOnViolation": false,
    "debug": true,
    "policyMode": "audit"
  },
  "logging": {
    "level": "info",
    "ifc": true
  }
}
EOF
    log_success "配置已创建"
fi
echo ""

# 更新 systemd 服务
log_info "更新 systemd 服务..."

mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/openclaw-gateway.service << EOF
[Unit]
Description=OpenClaw Gateway (IFC Enhanced)
After=network-online.target

[Service]
ExecStart=/usr/bin/node /usr/lib/node_modules/openclaw-ifc/dist/index.js gateway --port 18789
Restart=always
RestartSec=5
Environment=HOME=/home/$USER
Environment=OPENCLAW_GATEWAY_PORT=18789
Environment=OPENCLAW_IFC_ENABLED=true

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable openclaw-gateway.service
log_success "systemd 服务已配置"
echo ""

# 启动 Gateway
log_info "启动 Gateway..."
systemctl --user start openclaw-gateway.service
sleep 3

if systemctl --user is-active --quiet openclaw-gateway.service; then
    log_success "Gateway 已启动"
else
    log_warn "Gateway 启动失败，请检查日志"
fi
echo ""

# 验证安装
echo "========================================"
echo "🎉 部署完成！"
echo "========================================"
echo ""

echo "验证信息:"
echo "----------------------------------------"
echo "  OpenClaw 版本：$(openclaw --version 2>/dev/null || echo '未安装')"
echo "  命令位置：$(which openclaw 2>/dev/null || echo '未找到')"
echo "  IFC 代码：$(grep -c 'IFCSecurityMiddleware' /usr/lib/node_modules/openclaw-ifc/dist/index.js 2>/dev/null || echo '0') 处"
echo "  Gateway 状态：$(systemctl --user is-active openclaw-gateway.service 2>/dev/null || echo 'unknown')"
echo ""

echo "配置文件位置:"
echo "  ~/.openclaw/openclaw.json"
echo ""

echo "管理命令:"
echo "----------------------------------------"
echo "  启动：systemctl --user start openclaw-gateway.service"
echo "  停止：systemctl --user stop openclaw-gateway.service"
echo "  重启：systemctl --user restart openclaw-gateway.service"
echo "  状态：systemctl --user status openclaw-gateway.service"
echo ""

echo "查看日志:"
echo "----------------------------------------"
echo "  tail -f ~/.openclaw/logs/openclaw.log"
echo "  tail -f ~/.openclaw/logs/openclaw.log | grep -i ifc"
echo ""

echo "测试 IFC:"
echo "----------------------------------------"
echo "  1. 创建测试文件：echo 'test' > ~/test.txt"
echo "  2. 在对话中：请读取 ~/test.txt"
echo "  3. 查看日志：tail -f ~/.openclaw/logs/openclaw.log | grep -i ifc"
echo ""

echo "下一步:"
echo "----------------------------------------"
echo "  1. 编辑配置文件：nano ~/.openclaw/openclaw.json"
echo "  2. 添加 API Key (Qwen, Google 等)"
echo "  3. 配置 QQBot（如需要）"
echo "  4. 重启服务：systemctl --user restart openclaw-gateway.service"
echo ""

log_success "享受 IFC 增强的安全性！🔒"
echo ""
