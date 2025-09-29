/**
 * @fileoverview 중간지점 계산 API 라우터
 * 여러 참가자의 위치를 기반으로 중간지점 계산 및 지하철역 추천 API 제공
 */

import { Router, Request, Response } from 'express';
import { logger } from '@/utils/logger.js';
import { meetingPointService } from '@/services/meeting-point.service.js';
import { subwayStationService } from '@/services/subway-station.service.js';
import {
  meetingPointRequestSchema,
  stationSearchOptionsSchema,
  coordinateSchema,
  apiResponseSchema,
  errorResponseSchema
} from '@/schemas/meeting-point.schemas.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: MeetingPoint
 *   description: 중간지점 계산 및 지하철역 추천 API
 */

/**
 * @swagger
 * /api/v1/meeting-point/calculate:
 *   post:
 *     summary: 중간지점 계산 및 주변 지하철역 추천
 *     tags: [MeetingPoint]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - participants
 *             properties:
 *               participants:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 10
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - lat
 *                     - lng
 *                   properties:
 *                     name:
 *                       type: string
 *                       description: 참가자 이름
 *                       example: "Person A"
 *                     lat:
 *                       type: number
 *                       minimum: 37.4
 *                       maximum: 37.7
 *                       description: 위도 (서울 지역)
 *                       example: 37.5665
 *                     lng:
 *                       type: number
 *                       minimum: 126.8
 *                       maximum: 127.2
 *                       description: 경도 (서울 지역)
 *                       example: 126.9780
 *                     address:
 *                       type: string
 *                       description: 주소 (선택사항)
 *                       example: "서울특별시 중구 세종대로 110"
 *               options:
 *                 type: object
 *                 properties:
 *                   transportType:
 *                     type: string
 *                     enum: [subway, bus, walking]
 *                     default: subway
 *                     description: 교통수단
 *                   maxDistance:
 *                     type: number
 *                     minimum: 100
 *                     maximum: 10000
 *                     default: 2000
 *                     description: 중심점에서 최대 거리 (미터)
 *                   maxResults:
 *                     type: number
 *                     minimum: 1
 *                     maximum: 20
 *                     default: 5
 *                     description: 최대 결과 개수
 *                   includeTransfers:
 *                     type: boolean
 *                     default: true
 *                     description: 환승역 우선 여부
 *                   weights:
 *                     type: array
 *                     items:
 *                       type: number
 *                       minimum: 0.1
 *                       maximum: 10
 *                     description: 참가자별 가중치
 *           example:
 *             participants:
 *               - name: "Person A"
 *                 lat: 37.5665
 *                 lng: 126.9780
 *                 address: "서울역"
 *               - name: "Person B"
 *                 lat: 37.5502
 *                 lng: 126.9821
 *                 address: "남대문시장"
 *             options:
 *               maxDistance: 2000
 *               maxResults: 5
 *               includeTransfers: true
 *     responses:
 *       200:
 *         description: 중간지점 계산 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     center:
 *                       type: object
 *                       properties:
 *                         lat:
 *                           type: number
 *                           example: 37.5584
 *                         lng:
 *                           type: number
 *                           example: 126.9801
 *                         address:
 *                           type: string
 *                           example: "서울특별시 중구 명동"
 *                     nearbyStations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           code:
 *                             type: string
 *                             example: "2000"
 *                           name:
 *                             type: string
 *                             example: "시청"
 *                           line:
 *                             type: string
 *                             example: "2호선"
 *                           coordinates:
 *                             type: object
 *                             properties:
 *                               lat:
 *                                 type: number
 *                                 example: 37.5707
 *                               lng:
 *                                 type: number
 *                                 example: 126.9775
 *                           distance:
 *                             type: number
 *                             example: 245
 *                     participants:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ParticipantLocation'
 *                     stats:
 *                       type: object
 *                       properties:
 *                         averageDistance:
 *                           type: number
 *                           example: 1250
 *                         maxDistance:
 *                           type: number
 *                           example: 1800
 *                         minDistance:
 *                           type: number
 *                           example: 700
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-09-29T00:00:00.000Z"
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 내부 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/calculate', async (req: Request, res: Response) => {
  const requestId = `calc-${Date.now()}`;

  try {
    logger.info('중간지점 계산 요청', { requestId, body: req.body });

    // 요청 데이터 검증
    const validationResult = meetingPointRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      logger.warn('중간지점 계산 요청 검증 실패', {
        requestId,
        errors: validationResult.error.issues
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid Request',
        message: '요청 데이터가 올바르지 않습니다',
        details: validationResult.error.issues,
        timestamp: new Date().toISOString()
      });
    }

    const request = validationResult.data;

    // 중간지점 계산 실행
    const result = await meetingPointService.calculateMeetingPoint(request);

    logger.info('중간지점 계산 완료', {
      requestId,
      center: result.center,
      stationCount: result.nearbyStations.length,
      stats: result.stats
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('중간지점 계산 실패', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    res.status(500).json({
      success: false,
      error: 'Calculation Failed',
      message: error instanceof Error ? error.message : '중간지점 계산 중 오류가 발생했습니다',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/v1/meeting-point/stations/search:
 *   get:
 *     summary: 지하철역 이름으로 검색
 *     tags: [MeetingPoint]
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *         description: 검색할 역명
 *         example: "강남"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: 최대 결과 개수
 *         example: 5
 *     responses:
 *       200:
 *         description: 검색 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SubwayStation'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: 잘못된 요청
 *       404:
 *         description: 검색 결과 없음
 */
router.get('/stations/search', async (req: Request, res: Response) => {
  const requestId = `search-${Date.now()}`;

  try {
    logger.info('지하철역 검색 요청', { requestId, query: req.query });

    const { query, limit = 10 } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid Query',
        message: '검색어가 필요합니다',
        timestamp: new Date().toISOString()
      });
    }

    const limitNum = parseInt(limit as string);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Limit',
        message: 'limit은 1-50 사이의 숫자여야 합니다',
        timestamp: new Date().toISOString()
      });
    }

    const stations = subwayStationService.searchByName(query, limitNum);

    logger.info('지하철역 검색 완료', {
      requestId,
      query,
      resultCount: stations.length
    });

    if (stations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No Results',
        message: `"${query}" 검색 결과가 없습니다`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: stations,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('지하철역 검색 실패', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Search Failed',
      message: '지하철역 검색 중 오류가 발생했습니다',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/v1/meeting-point/stations/nearby:
 *   get:
 *     summary: 특정 좌표 주변의 지하철역 검색
 *     tags: [MeetingPoint]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *           minimum: 37.4
 *           maximum: 37.7
 *         description: 위도
 *         example: 37.5665
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *           minimum: 126.8
 *           maximum: 127.2
 *         description: 경도
 *         example: 126.9780
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           minimum: 100
 *           maximum: 10000
 *           default: 2000
 *         description: 검색 반경 (미터)
 *         example: 1000
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: 최대 결과 개수
 *         example: 5
 *     responses:
 *       200:
 *         description: 검색 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SubwayStation'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: 잘못된 요청
 *       404:
 *         description: 검색 결과 없음
 */
router.get('/stations/nearby', async (req: Request, res: Response) => {
  const requestId = `nearby-${Date.now()}`;

  try {
    logger.info('주변 지하철역 검색 요청', { requestId, query: req.query });

    const { lat, lng, radius = 2000, limit = 10 } = req.query;

    // 좌표 검증
    const latNum = parseFloat(lat as string);
    const lngNum = parseFloat(lng as string);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Coordinates',
        message: '유효한 위도와 경도가 필요합니다',
        timestamp: new Date().toISOString()
      });
    }

    const coordinateValidation = coordinateSchema.safeParse({ lat: latNum, lng: lngNum });
    if (!coordinateValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Coordinates',
        message: '서울 지역 좌표 범위를 벗어났습니다',
        details: coordinateValidation.error.issues,
        timestamp: new Date().toISOString()
      });
    }

    // 반경과 제한 검증
    const radiusNum = parseInt(radius as string);
    const limitNum = parseInt(limit as string);

    if (isNaN(radiusNum) || radiusNum < 100 || radiusNum > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Radius',
        message: 'radius는 100-10000 사이의 숫자여야 합니다',
        timestamp: new Date().toISOString()
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Limit',
        message: 'limit은 1-50 사이의 숫자여야 합니다',
        timestamp: new Date().toISOString()
      });
    }

    const stations = subwayStationService.searchNearby(
      { lat: latNum, lng: lngNum },
      radiusNum,
      limitNum
    );

    logger.info('주변 지하철역 검색 완료', {
      requestId,
      center: { lat: latNum, lng: lngNum },
      radius: radiusNum,
      resultCount: stations.length
    });

    if (stations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No Results',
        message: `반경 ${radiusNum}m 내에 지하철역이 없습니다`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: stations,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('주변 지하철역 검색 실패', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Search Failed',
      message: '주변 지하철역 검색 중 오류가 발생했습니다',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/v1/meeting-point/health:
 *   get:
 *     summary: 중간지점 계산 서비스 상태 확인
 *     tags: [MeetingPoint]
 *     responses:
 *       200:
 *         description: 서비스 정상
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     serviceName:
 *                       type: string
 *                       example: "MeetingPointService"
 *                     isReady:
 *                       type: boolean
 *                       example: true
 *                     subwayStationCount:
 *                       type: number
 *                       example: 42
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: 서비스 준비되지 않음
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    logger.info('중간지점 계산 서비스 상태 확인');

    const status = meetingPointService.getStatus();
    const subwayStatus = subwayStationService.getStatus();

    const serviceStatus = {
      serviceName: status.serviceName,
      isReady: status.isReady && subwayStatus.isLoaded,
      subwayStationCount: subwayStatus.stationCount,
      lastUpdated: status.lastUpdated,
      subwayService: {
        dataPath: subwayStatus.dataPath,
        isLoaded: subwayStatus.isLoaded
      }
    };

    const httpStatus = serviceStatus.isReady ? 200 : 503;

    logger.info('중간지점 계산 서비스 상태 확인 완료', serviceStatus);

    res.status(httpStatus).json({
      success: serviceStatus.isReady,
      data: serviceStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('서비스 상태 확인 실패', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Health Check Failed',
      message: '서비스 상태 확인 중 오류가 발생했습니다',
      timestamp: new Date().toISOString()
    });
  }
});

export { router as meetingPointRouter };