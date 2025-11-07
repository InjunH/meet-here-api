/**
 * @fileoverview 세션 관리 API 라우트
 * 세션 생성, 조회, 업데이트, 삭제
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/middleware/errorHandler.js';
import { logger } from '@/utils/logger.js';
import { sessionService } from '@/services/session.service.js';
import { participantService } from '@/services/participant.service.js';

const router = Router();

// Validation schemas
const CreateSessionSchema = z.object({
  title: z.string().min(1).max(100),
  hostName: z.string().min(1).max(50),
});

const UpdateSessionSchema = z.object({
  status: z.enum(['active', 'voting', 'completed', 'cancelled']).optional(),
  centerLat: z.string().optional(),
  centerLng: z.string().optional(),
  centerDisplayName: z.string().optional(),
  selectedPlaceId: z.string().uuid().optional(),
});

const SessionIdSchema = z.object({
  id: z.string().uuid(),
});

/**
 * @swagger
 * /api/v1/sessions:
 *   post:
 *     summary: 새 세션 생성
 *     description: 새로운 만남 세션을 생성합니다
 *     tags: [Sessions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - hostName
 *             properties:
 *               title:
 *                 type: string
 *                 example: "강남역 근처 만남"
 *               hostName:
 *                 type: string
 *                 example: "홍길동"
 *     responses:
 *       201:
 *         description: 세션 생성 성공
 *       400:
 *         description: 잘못된 요청
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = CreateSessionSchema.parse(req.body);

  logger.info('Creating session', { title: body.title, hostName: body.hostName });

  const session = await sessionService.createSession({
    title: body.title,
    hostName: body.hostName,
  });

  logger.info('Session created', { sessionId: session.id });

  res.status(201).json({
    success: true,
    data: session,
    message: 'Session created successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/sessions/{id}:
 *   get:
 *     summary: 세션 조회
 *     description: 세션 ID로 세션 정보를 조회합니다
 *     tags: [Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 세션 조회 성공
 *       404:
 *         description: 세션을 찾을 수 없음
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = SessionIdSchema.parse({ id: req.params.id });

  logger.info('Getting session', { sessionId: id });

  const session = await sessionService.getSession(id);

  if (!session) {
    throw createError.notFound('Session not found');
  }

  // 참가자 수 추가
  const participants = await participantService.getParticipants(id);
  const sessionWithCount = {
    ...session,
    participantCount: participants.length,
  };

  logger.info('Session retrieved', { sessionId: id, participantCount: participants.length });

  res.json({
    success: true,
    data: sessionWithCount,
    message: 'Session retrieved successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/sessions/{id}:
 *   put:
 *     summary: 세션 업데이트
 *     description: 세션 정보를 업데이트합니다
 *     tags: [Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, voting, completed, cancelled]
 *               centerLat:
 *                 type: string
 *               centerLng:
 *                 type: string
 *               centerDisplayName:
 *                 type: string
 *               selectedPlaceId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: 세션 업데이트 성공
 *       404:
 *         description: 세션을 찾을 수 없음
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = SessionIdSchema.parse({ id: req.params.id });
  const updates = UpdateSessionSchema.parse(req.body);

  logger.info('Updating session', { sessionId: id, updates });

  const session = await sessionService.updateSession(id, updates);

  logger.info('Session updated', { sessionId: id });

  res.json({
    success: true,
    data: session,
    message: 'Session updated successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/sessions/{id}/complete:
 *   post:
 *     summary: 세션 완료
 *     description: 세션을 완료 상태로 변경하고 선택된 장소를 저장합니다
 *     tags: [Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               selectedPlaceId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: 세션 완료 성공
 */
router.post('/:id/complete', asyncHandler(async (req: Request, res: Response) => {
  const { id } = SessionIdSchema.parse({ id: req.params.id });
  const { selectedPlaceId } = req.body;

  logger.info('Completing session', { sessionId: id, selectedPlaceId });

  const session = await sessionService.completeSession(id, selectedPlaceId);

  logger.info('Session completed', { sessionId: id });

  res.json({
    success: true,
    data: session,
    message: 'Session completed successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/sessions/{id}:
 *   delete:
 *     summary: 세션 삭제
 *     description: 세션과 관련된 모든 데이터를 삭제합니다
 *     tags: [Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 세션 삭제 성공
 *       404:
 *         description: 세션을 찾을 수 없음
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = SessionIdSchema.parse({ id: req.params.id });

  logger.info('Deleting session', { sessionId: id });

  await sessionService.deleteSession(id);

  logger.info('Session deleted', { sessionId: id });

  res.json({
    success: true,
    message: 'Session deleted successfully',
    timestamp: new Date().toISOString(),
  });
}));

export { router as sessionsRouter };
