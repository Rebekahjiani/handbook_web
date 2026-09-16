#!/bin/bash
# 用途：先登录 Magento Admin，再爬取 shopping_admin handbook
# 在 /data/handbook_web 目录下运行

set -e
cd /data/handbook_web

echo "=== Step 1: Login to Magento Admin ==="
node generate-web-handbook/scripts/login-admin.mjs \
  --cdp http://127.0.0.1:9222 \
  --url http://localhost:7780 \
  --user admin \
  --pass admin1234

echo "=== Step 2: Crawl shopping_admin ==="
node generate-web-handbook/scripts/crawl-site.mjs \
  --url http://localhost:7780 \
  --site webarena-shopping-admin \
  --output handbooks \
  --cdp http://127.0.0.1:9222 \
  --max-pages 15 \
  --max-depth 2 \
  --coverage-corpus handbooks/shopping_admin_corpus/task-corpus.json \
  --site-key shopping_admin \
  --workflow-config generate-web-handbook/scripts/workflows/shopping-admin.mjs \
  --fresh
