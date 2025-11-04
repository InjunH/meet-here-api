#!/bin/bash

# 네이버 지역 검색 API 테스트 스크립트

API_BASE_URL="http://localhost:8080"
ENDPOINT="/api/v1/naver/nearby-places"

echo "========================================"
echo "네이버 주변 장소 검색 API 테스트"
echo "========================================"
echo ""

# 테스트 1: 강남역 근처 카페 검색
echo "[테스트 1] 강남역 근처 카페 검색"
curl -X POST "${API_BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 37.498095,
    "lng": 127.027619,
    "query": "카페",
    "display": 5
  }' | jq '.'

echo ""
echo "========================================"
echo ""

# 테스트 2: 역삼역 근처 음식점 검색 (페이지네이션)
echo "[테스트 2] 역삼역 근처 음식점 검색 (start=1)"
curl -X POST "${API_BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 37.5006,
    "lng": 127.0366,
    "query": "음식점",
    "start": 1,
    "display": 3
  }' | jq '.'

echo ""
echo "========================================"
echo ""

# 테스트 3: 잘못된 요청 (query 누락)
echo "[테스트 3] 잘못된 요청 테스트 (query 누락)"
curl -X POST "${API_BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 37.5006,
    "lng": 127.0366
  }' | jq '.'

echo ""
echo "========================================"
echo ""

# 테스트 4: 잘못된 좌표
echo "[테스트 4] 잘못된 좌표 테스트 (lat 범위 초과)"
curl -X POST "${API_BASE_URL}${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 100,
    "lng": 127.0366,
    "query": "카페"
  }' | jq '.'

echo ""
echo "========================================"
echo "테스트 완료"
echo "========================================"
