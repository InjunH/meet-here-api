#!/bin/bash

# 간단한 curl 테스트 - 서버가 실행 중일 때 사용

BASE_URL="http://localhost:8080"

echo "================================"
echo "네이버 주변 장소 검색 API 테스트"
echo "================================"
echo ""

# 강남역 근처 카페 검색
echo "강남역 근처 카페 검색 중..."
curl -X POST "${BASE_URL}/api/v1/naver/nearby-places" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 37.498095,
    "lng": 127.027619,
    "query": "카페",
    "display": 3
  }' 2>/dev/null | jq '.data.places[] | {title, address, category}'

echo ""
echo "테스트 완료!"
