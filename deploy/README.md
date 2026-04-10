# EC2 배포 가이드

## 사전 준비

### 1. EC2 인스턴스
- **OS**: Amazon Linux 2023
- **인스턴스 유형**: t3.small 이상 (빌드 시 2GB+ 메모리 필요)
- **스토리지**: 20GB 이상

### 2. AWS 보안 그룹
인바운드 규칙에 다음 포트를 허용하세요:
| 포트 | 프로토콜 | 용도 |
|------|----------|------|
| 22   | TCP      | SSH  |
| 80   | TCP      | HTTP |
| 443  | TCP      | HTTPS |

### 3. 도메인 DNS 설정
도메인 등록 업체에서 A 레코드를 설정하세요:
- `nanbalchi.com` → EC2 탄력적 IP 주소
- `www.nanbalchi.com` → EC2 탄력적 IP 주소

> DNS 전파에 최대 48시간이 걸릴 수 있습니다. `dig nanbalchi.com`으로 확인하세요.

## 배포 방법

### 최초 배포
```bash
# 1. EC2에 SSH 접속
ssh -i your-key.pem ec2-user@<EC2-IP>

# 2. 저장소 클론
git clone https://github.com/myungjungcrypto/panorama_drawing.git
cd panorama_drawing

# 3. 배포 실행
sudo bash deploy/deploy.sh
```

### 업데이트 배포
```bash
cd /home/ec2-user/panorama_drawing
sudo bash deploy/deploy.sh
```
스크립트가 자동으로 최신 코드를 pull하고 빌드 후 재시작합니다.

## 유용한 명령어

### PM2 (프로세스 관리)
```bash
pm2 status                     # 프로세스 상태 확인
pm2 logs panorama-drawing      # 실시간 로그 확인
pm2 restart panorama-drawing   # 재시작
pm2 stop panorama-drawing      # 중지
pm2 monit                      # 모니터링 대시보드
```

### Nginx
```bash
sudo nginx -t                  # 설정 문법 검증
sudo systemctl reload nginx    # 설정 재로드
sudo systemctl status nginx    # 상태 확인
```

### SSL 인증서
```bash
sudo certbot renew --dry-run   # 갱신 테스트
sudo certbot certificates      # 인증서 목록 확인
```

## 문제 해결

### 빌드 실패 (메모리 부족)
배포 스크립트가 자동으로 2GB swap을 생성하지만, 부족할 경우:
```bash
# swap 크기 확인
free -h
# 추가 swap이 필요하면 인스턴스를 t3.medium으로 업그레이드
```

### 502 Bad Gateway
Next.js 프로세스가 실행 중인지 확인:
```bash
pm2 status
pm2 logs panorama-drawing --lines 50
```

### SSL 인증서 발급 실패
DNS가 EC2 IP를 가리키는지 확인:
```bash
dig nanbalchi.com
# 수동 발급
sudo certbot --nginx -d nanbalchi.com -d www.nanbalchi.com
```
