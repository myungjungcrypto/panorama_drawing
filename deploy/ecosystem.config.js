// PM2 프로세스 관리 설정
// 사용법: pm2 start deploy/ecosystem.config.js --env production
module.exports = {
  apps: [{
    name: 'panorama-drawing',
    script: 'npm',
    args: 'start',
    cwd: '/home/ec2-user/panorama_drawing',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: '/home/ec2-user/panorama_drawing/logs/error.log',
    out_file: '/home/ec2-user/panorama_drawing/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  }]
};
