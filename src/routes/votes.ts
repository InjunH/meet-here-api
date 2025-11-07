/**
 * @fileoverview 투표 관리 API 라우트
 * 투표하기, 투표 취소, 투표 현황 조회
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/middleware/errorHandler.js';
import { logger } from '@/utils/logger.js';
import { voteService } from '@/services/vote.service.js';

const router = Router();

// Validation schemas
const CastVoteSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
  placeId: z.string().uuid(),
});

const VoteParamsSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
});

const SessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

const VoteStatusQuerySchema = z.object({
  placeIds: z.string().transform((str) => str.split(',')), // comma-separated list
});

/**
 * @swagger
 * /api/v1/votes:
 *   post:
 *     summary: 투표하기
 *     description: 참가자가 장소에 투표합니다 (재투표 가능)
 *     tags: [Votes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - participantId
 *               - placeId
 *             properties:
 *               sessionId:
 *                 type: string
 *                 format: uuid
 *               participantId:
 *                 type: string
 *                 format: uuid
 *               placeId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: 투표 성공
 *       400:
 *         description: 잘못된 요청
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = CastVoteSchema.parse(req.body);

  logger.info('Casting vote', {
    sessionId: body.sessionId,
    participantId: body.participantId,
    placeId: body.placeId,
  });

  await voteService.castVote({
    sessionId: body.sessionId,
    participantId: body.participantId,
    placeId: body.placeId,
  });

  logger.info('Vote cast successfully', {
    sessionId: body.sessionId,
    participantId: body.participantId,
  });

  res.json({
    success: true,
    message: 'Vote cast successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/votes/{sessionId}/{participantId}:
 *   delete:
 *     summary: 투표 취소
 *     description: 참가자의 투표를 취소합니다
 *     tags: [Votes]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 투표 취소 성공
 */
router.delete('/:sessionId/:participantId', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, participantId } = VoteParamsSchema.parse({
    sessionId: req.params.sessionId,
    participantId: req.params.participantId,
  });

  logger.info('Cancelling vote', { sessionId, participantId });

  await voteService.cancelVote(sessionId, participantId);

  logger.info('Vote cancelled', { sessionId, participantId });

  res.json({
    success: true,
    message: 'Vote cancelled successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/votes/session/{sessionId}:
 *   get:
 *     summary: 투표 현황 조회
 *     description: 세션의 실시간 투표 현황을 조회합니다
 *     tags: [Votes]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: placeIds
 *         required: true
 *         description: 장소 ID 목록 (콤마로 구분)
 *         schema:
 *           type: string
 *         example: "uuid1,uuid2,uuid3"
 *     responses:
 *       200:
 *         description: 투표 현황 조회 성공
 */
router.get('/session/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = SessionIdSchema.parse({ sessionId: req.params.sessionId });
  const { placeIds } = VoteStatusQuerySchema.parse({ placeIds: req.query.placeIds });

  logger.debug('Getting vote status', { sessionId, placeIdsCount: placeIds.length });

  const voteStatus = await voteService.getVoteStatus(sessionId, placeIds);

  logger.debug('Vote status retrieved', {
    sessionId,
    totalVotes: voteStatus.totalVotes,
  });

  res.json({
    success: true,
    data: voteStatus,
    message: 'Vote status retrieved successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/votes/session/{sessionId}/winner:
 *   get:
 *     summary: 최다 득표 장소 조회
 *     description: 가장 많은 투표를 받은 장소를 조회합니다
 *     tags: [Votes]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: placeIds
 *         required: true
 *         description: 장소 ID 목록 (콤마로 구분)
 *         schema:
 *           type: string
 *         example: "uuid1,uuid2,uuid3"
 *     responses:
 *       200:
 *         description: 최다 득표 장소 조회 성공
 *       404:
 *         description: 투표 없음
 */
router.get('/session/:sessionId/winner', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = SessionIdSchema.parse({ sessionId: req.params.sessionId });
  const { placeIds } = VoteStatusQuerySchema.parse({ placeIds: req.query.placeIds });

  logger.info('Getting winning place', { sessionId, placeIdsCount: placeIds.length });

  const winningPlaceId = await voteService.getWinningPlace(sessionId, placeIds);

  if (!winningPlaceId) {
    throw createError.notFound('No votes found');
  }

  logger.info('Winning place found', { sessionId, winningPlaceId });

  res.json({
    success: true,
    data: { winningPlaceId },
    message: 'Winning place retrieved successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/votes/participant/{sessionId}/{participantId}:
 *   get:
 *     summary: 특정 참가자의 투표 조회
 *     description: 참가자가 어떤 장소에 투표했는지 조회합니다
 *     tags: [Votes]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 참가자 투표 조회 성공
 *       404:
 *         description: 투표 없음
 */
router.get('/participant/:sessionId/:participantId', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, participantId } = VoteParamsSchema.parse({
    sessionId: req.params.sessionId,
    participantId: req.params.participantId,
  });

  logger.debug('Getting participant vote', { sessionId, participantId });

  const placeId = await voteService.getParticipantVote(sessionId, participantId);

  if (!placeId) {
    throw createError.notFound('Participant has not voted');
  }

  logger.debug('Participant vote found', { sessionId, participantId, placeId });

  res.json({
    success: true,
    data: { placeId },
    message: 'Participant vote retrieved successfully',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * @swagger
 * /api/v1/votes/session/{sessionId}/statistics:
 *   get:
 *     summary: 투표 통계 조회
 *     description: 세션의 투표 통계를 조회합니다
 *     tags: [Votes]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 투표 통계 조회 성공
 */
router.get('/session/:sessionId/statistics', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = SessionIdSchema.parse({ sessionId: req.params.sessionId });

  logger.debug('Getting vote statistics', { sessionId });

  const statistics = await voteService.getVoteStatistics(sessionId);

  logger.debug('Vote statistics retrieved', { sessionId, statistics });

  res.json({
    success: true,
    data: statistics,
    message: 'Vote statistics retrieved successfully',
    timestamp: new Date().toISOString(),
  });
}));

export { router as votesRouter };
