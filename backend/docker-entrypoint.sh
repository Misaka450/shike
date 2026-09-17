#!/bin/sh
# ============================================================
# 容器启动脚本
# 作用：宿主机的数据目录默认属主可能是 root，而我们要以非 root 用户（node）运行服务，
#      否则会因为没有写权限导致数据库无法创建。这里先修正属主，再降权执行主进程。
# ============================================================
set -e

DATA_DIR="/opt/shike-ai/data"

if [ "$(id -u)" = "0" ]; then
  # 确保数据目录存在并且归 node 用户所有（失败也不阻断启动，可能用了只读挂载）
  mkdir -p "$DATA_DIR" 2>/dev/null || true
  chown -R node:node "$DATA_DIR" 2>/dev/null || true

  # 降权到 node 用户运行（setpriv 不可用时回退到 su）
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --init-groups "$@"
  fi

  exec su node -s /bin/sh -c "$*"
fi

# 已经以非 root 身份启动，直接执行
exec "$@"