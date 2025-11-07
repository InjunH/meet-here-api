/**
 * @fileoverview 참가자 관리 API 라우트
 * 참가자 추가, 조회, 위치 업데이트
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/middleware/errorHandler.js';
import { logger } from '@/utils/logger.js';
import { participantService } from '@/services/participant.service.js';

const router = Router();

// Validation schemas
const AddParticipantSchema = z.object({
  sessionId: z.string().uuid(),
  name: z.string().min(1).max(50),
  location: z.object({
    lat: z.string(),
    lng: z.string(),
    displayName: z.string().optional(),
  }),
});

const UpdateLocationSchema = z.object({
  lat: z.string(),
  lng: z.string(),
  displayName: z.string().optional(),
});

const ParticipantIdSchema = z.object({
  id: z.string().uuid(),
});

const SessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

/**
 * @swagger
 * /api/v1/participants:
 *   post:
 *     summary: 참가자 추가
 *     description: 세션에 새로운 참가자를 추가합니다
 *     tags: [Participants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - name
 *               - location
 *             properties:
 *               sessionId:
 *                 type: string
 *                 format: uuid
 *               name:
 *                 type: string
 *                 example: "김철수"
 *               location:
 *                 type: object
 *                 required:
 *                   - lat
 *                   - lng
 *                 properties:
 *                   lat:
 *                     type: string
 *                   lng:
 *                     type: string
 *                   displayName:
 *                     type: string
 *     responses:
 *       201:
 *         description: 참가자 추가 성공
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = AddParticipantSchema.parse(req.body);

  logger.info('Adding participant', {
    sessionId: body.sessionId,
    name: body.name,
  });

  const participant = await participantService.addParticipant({
    sessionId: body.sessionId,
    name: body.name,
    location: body.location,
  });

  logger.info('Participant added', {
    participantId: participant.id,
    sessionId: body.sessionId,
  });

  res.status(201).json({
    success: true,
    data: participant,
    message: 'Participant added successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/participants/session/{sessionId}:
 *   get:
 *     summary: 세션의 참가자 목록 조회
 *     description: 특정 세션의 모든 참가자를 조회합니다
 *     tags: [Participants]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 참가자 목록 조회 성공
 */
router.get('/session/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = SessionIdSchema.parse({ sessionId: req.params.sessionId });

  logger.info('Getting participants', { sessionId });

  const participants = await participantService.getParticipants(sessionId);

  logger.info('Participants retrieved', {
    sessionId,
    count: participants.length,
  });

  res.json({
    success: true,
    data: {
      participants,
      total: participants.length,
    },
    message: 'Participants retrieved successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/participants/{id}:
 *   get:
 *     summary: 특정 참가자 조회
 *     description: 참가자 ID로 참가자 정보를 조회합니다
 *     tags: [Participants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 참가자 조회 성공
 *       404:
 *         description: 참가자를 찾을 수 없음
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = ParticipantIdSchema.parse({ id: req.params.id });
  const { sessionId } = SessionIdSchema.parse({ sessionId: req.query.sessionId });

  logger.info('Getting participant', { participantId: id, sessionId });

  const participant = await participantService.getParticipant(sessionId, id);

  if (!participant) {
    throw createError.notFound('Participant not found');
  }

  logger.info('Participant retrieved', { participantId: id });

  res.json({
    success: true,
    data: participant,
    message: 'Participant retrieved successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/participants/{id}/location:
 *   put:
 *     summary: 참가자 위치 업데이트
 *     description: 참가자의 현재 위치를 업데이트합니다 (실시간)
 *     tags: [Participants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: sessionId
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
 *             required:
 *               - lat
 *               - lng
 *             properties:
 *               lat:
 *                 type: string
 *               lng:
 *                 type: string
 *               displayName:
 *                 type: string
 *     responses:
 *       200:
 *         description: 위치 업데이트 성공
 */
router.put('/:id/location', asyncHandler(async (req: Request, res: Response) => {
  const { id } = ParticipantIdSchema.parse({ id: req.params.id });
  const { sessionId } = SessionIdSchema.parse({ sessionId: req.query.sessionId });
  const location = UpdateLocationSchema.parse(req.body);

  logger.debug('Updating location', {
    participantId: id,
    sessionId,
  });

  await participantService.updateLocation(sessionId, id, location);

  logger.debug('Location updated', { participantId: id });

  res.json({
    success: true,
    message: 'Location updated successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/participants/{id}/heartbeat:
 *   post:
 *     summary: 참가자 활동 상태 업데이트
 *     description: 참가자가 활성 상태임을 표시합니다 (heartbeat)
 *     tags: [Participants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Heartbeat 성공
 */
router.post('/:id/heartbeat', asyncHandler(async (req: Request, res: Response) => {
  const { id } = ParticipantIdSchema.parse({ id: req.params.id });
  const { sessionId } = SessionIdSchema.parse({ sessionId: req.query.sessionId });

  await participantService.updateLastActive(sessionId, id);

  res.json({
    success: true,
    message: 'Heartbeat received',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/participants/{id}:
 *   delete:
 *     summary: 참가자 제거
 *     description: 세션에서 참가자를 제거합니다
 *     tags: [Participants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 참가자 제거 성공
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = ParticipantIdSchema.parse({ id: req.params.id });
  const { sessionId } = SessionIdSchema.parse({ sessionId: req.query.sessionId });

  logger.info('Removing participant', { participantId: id, sessionId });

  await participantService.removeParticipant(sessionId, id);

  logger.info('Participant removed', { participantId: id });

  res.json({
    success: true,
    message: 'Participant removed successfully',
    timestamp: new Date().toISOString(),
  });
}));

export { router as participantsRouter };
