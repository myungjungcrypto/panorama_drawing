#!/bin/bash
# =============================================================
# 치과 파노라마 3D 시각화 - EC2 배포 스크립트
# =============================================================
# 사용법: sudo bash deploy.sh
#
# 이 스크립트는 멱등성(idempotent)으로 설계되어 여러 번 실행해도 안전합니다.
# 처음 실행 시: 전체 설치 + 설정
# 이후 실행 시: 코드 업데이트 + 재빌드 + 재시작
# =============================================================

set -euo pipefail

# =================== 설정 변수 ===================
DOMAIN="nanbalchi.com"
EMAIL="admin@nanbalchi.com"
APP_DIR="/home/ubuntu/panorama_drawing"
REPO_URL="https://github.com/myungjungcrypto/panorama_drawing.git"
GIT_BRANCH="main"
NODE_VERSION="20"
APP_USER="ubuntu"

# =================== 색상 출력 ===================
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =================== root 권한 확인 ===================
if [ "$EUID" -ne 0 ]; then
  log_error "root 권한이 필요합니다. sudo bash deploy.sh 로 실행하세요."
  exit 1
fi

# =================== Step 1: 시스템 패키지 ===================
log_info "Step 1: 시스템 패키지 업데이트 및 설치..."

apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx git curl ufw > /dev/null 2>&1

log_info "시스템 패키지 설치 완료"

# =================== Step 2: Node.js 설치 ===================
if command -v node &> /dev/null && node --version | grep -q "v${NODE_VERSION}"; then
  log_info "Step 2: Node.js $(node --version) 이미 설치됨 (건너뜀)"
else
  log_info "Step 2: Node.js ${NODE_VERSION} LTS 설치 중..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  log_info "Node.js $(node --version) 설치 완료"
fi

# =================== Step 3: PM2 설치 ===================
if command -v pm2 &> /dev/null; then
  log_info "Step 3: PM2 이미 설치됨 (건너뜀)"
else
  log_info "Step 3: PM2 설치 중..."
  npm install -g pm2 > /dev/null 2>&1
  log_info "PM2 설치 완료"
fi

# =================== Step 4: Swap 파일 (빌드 메모리 확보) ===================
if [ -f /swapfile ]; then
  log_info "Step 4: Swap 파일 이미 존재 (건너뜀)"
else
  log_info "Step 4: 2GB Swap 파일 생성 중..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile > /dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  log_info "Swap 파일 생성 완료 (2GB)"
fi

# =================== Step 5: 저장소 클론/업데이트 ===================
if [ -d "$APP_DIR/.git" ]; then
  log_info "Step 5: 기존 저장소 업데이트 중..."
  cd "$APP_DIR"
  sudo -u "$APP_USER" git fetch origin "$GIT_BRANCH"
  sudo -u "$APP_USER" git reset --hard "origin/$GIT_BRANCH"
else
  log_info "Step 5: 저장소 클론 중..."
  sudo -u "$APP_USER" git clone -b "$GIT_BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
log_info "저장소 준비 완료"

# =================== Step 6: 의존성 설치 + 빌드 ===================
log_info "Step 6: 의존성 설치 및 빌드 중... (수 분 소요될 수 있습니다)"
cd "$APP_DIR"

sudo -u "$APP_USER" npm ci 2>&1 | tail -3
sudo -u "$APP_USER" npm run build 2>&1 | tail -5

log_info "빌드 완료"

# =================== Step 7: 로그 디렉토리 ===================
sudo -u "$APP_USER" mkdir -p "$APP_DIR/logs"

# =================== Step 8: PM2 프로세스 설정 ===================
log_info "Step 8: PM2 프로세스 설정 중..."

# 기존 프로세스가 있으면 삭제
pm2 delete panorama-drawing 2>/dev/null || true

cd "$APP_DIR"
sudo -u "$APP_USER" pm2 start deploy/ecosystem.config.js --env production
sudo -u "$APP_USER" pm2 save

log_info "PM2 프로세스 시작 완료"

# =================== Step 9: PM2 시스템 시작 설정 ===================
log_info "Step 9: PM2 시스템 시작 설정 중..."

env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" > /dev/null 2>&1
sudo -u "$APP_USER" pm2 save > /dev/null 2>&1

log_info "PM2 시스템 시작 설정 완료 (재부팅 후 자동 시작)"

# =================== Step 10: Nginx 설정 ===================
log_info "Step 10: Nginx 설정 중..."

cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/panorama_drawing

# sites-enabled 심볼릭 링크
ln -sf /etc/nginx/sites-available/panorama_drawing /etc/nginx/sites-enabled/panorama_drawing

# 기본 사이트 비활성화
rm -f /etc/nginx/sites-enabled/default

# Nginx 설정 검증 및 적용
nginx -t 2>&1
systemctl reload nginx

log_info "Nginx 설정 완료"

# =================== Step 11: SSL 인증서 (Let's Encrypt) ===================
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  log_info "Step 11: SSL 인증서 이미 존재 (건너뜀)"
else
  log_info "Step 11: SSL 인증서 발급 중..."

  # DNS 확인
  RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
  if [ -z "$RESOLVED_IP" ]; then
    log_warn "DNS가 아직 전파되지 않았습니다. SSL 설정을 건너뜁니다."
    log_warn "DNS 전파 후 다음 명령어로 수동 발급하세요:"
    log_warn "  sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email $EMAIL"
  else
    certbot --nginx \
      -d "$DOMAIN" \
      -d "www.$DOMAIN" \
      --non-interactive \
      --agree-tos \
      --email "$EMAIL" \
      --redirect \
      2>&1 | tail -5

    log_info "SSL 인증서 발급 완료"
  fi
fi

# certbot 자동 갱신 활성화
systemctl enable certbot.timer 2>/dev/null || true

# =================== Step 12: 방화벽 (UFW) ===================
log_info "Step 12: 방화벽 설정 중..."

ufw default deny incoming > /dev/null 2>&1
ufw default allow outgoing > /dev/null 2>&1
ufw allow ssh > /dev/null 2>&1
ufw allow 'Nginx Full' > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1

log_info "방화벽 설정 완료 (SSH, HTTP, HTTPS 허용)"

# =================== 완료 ===================
echo ""
echo "=============================================="
echo -e "${GREEN} 배포 완료!${NC}"
echo "=============================================="
echo ""
echo "  도메인: https://$DOMAIN"
echo "  PM2 상태: pm2 status"
echo "  로그 확인: pm2 logs panorama-drawing"
echo "  Nginx 상태: sudo systemctl status nginx"
echo ""

# PM2 상태 출력
pm2 status

echo ""
log_info "배포가 완료되었습니다!"
