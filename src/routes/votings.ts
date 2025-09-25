import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, createError } from '@/middleware/errorHandler.js';
import { validateDeviceId } from '@/middleware/security.js';
import { logger } from '@/utils/logger.js';

const router = Router();

// Validation schemas
const CreateVotingSchema = z.object({
  meetingId: z.string().regex(/^meet_/),
  candidates: z.array(z.object({
    placeId: z.string(),
    name: z.string(),
    category: z.string(),
    distance: z.number()
  })).min(2).max(5)
});

const CastVoteSchema = z.object({
  placeId: z.string(),
  participantName: z.string().min(1).max(50).optional()
});

const GetVotingSchema = z.object({
  id: z.string().min(1)
});

// Types
interface VotingCandidate {
  placeId: string;
  name: string;
  category: string;
  distance: number;
  voteCount: number;
}

interface Vote {
  id: string;
  userId?: string;
  deviceId: string;
  placeId: string;
  participantName?: string;
  createdAt: string;
}

interface Voting {
  id: string;
  meetingId: string;
  candidates: VotingCandidate[];
  votes: Vote[];
  status: 'OPEN' | 'CLOSED' | 'COMPLETED';
  winner?: VotingCandidate;
  createdAt: string;
  endsAt?: string;
  totalVotes: number;
}

/**
 * @swagger
 * /api/v1/votings:
 *   post:
 *     summary: 새 투표 생성
 *     description: 미팅에 대한 장소 투표를 생성합니다.
 *     tags: [Votings]
 *     security:
 *       - DeviceIdAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - meetingId
 *               - candidates
 *             properties:
 *               meetingId:
 *                 type: string
 *                 pattern: '^meet_'
 *                 description: 미팅 세션 ID
 *                 example: "meet_1634567890_abc123def"
 *               candidates:
 *                 type: array
 *                 minItems: 2
 *                 maxItems: 5
 *                 items:
 *                   type: object
 *                   required:
 *                     - placeId
 *                     - name
 *                     - category
 *                     - distance
 *                   properties:
 *                     placeId:
 *                       type: string
 *                       description: 장소 ID
 *                       example: "place_cafe_1"
 *                     name:
 *                       type: string
 *                       description: 장소명
 *                       example: "스타벅스 신촌점"
 *                     category:
 *                       type: string
 *                       description: 장소 카테고리
 *                       example: "카페"
 *                     distance:
 *                       type: number
 *                       description: 중심점으로부터 거리 (미터)
 *                       example: 150
 *     responses:
 *       201:
 *         description: 투표 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Vote'
 *                 message:
 *                   type: string
 *                   example: "Voting created successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: 잘못된 요청 데이터
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
// POST /api/v1/votings - Create new voting
router.post('/', validateDeviceId, asyncHandler(async (req: Request, res: Response) => {
  const body = CreateVotingSchema.parse(req.body);
  const deviceId = req.headers['x-device-id'] as string;

  try {
    logger.info('Creating new voting', {
      meetingId: body.meetingId,
      candidateCount: body.candidates.length,
      deviceId
    });

    // Generate voting ID
    const votingId = `vote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create voting with candidates
    const voting: Voting = {
      id: votingId,
      meetingId: body.meetingId,
      candidates: body.candidates.map(candidate => ({
        ...candidate,
        voteCount: 0
      })),
      votes: [],
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      totalVotes: 0
    };

    // TODO: Save voting to database
    // await saveVoting(voting);

    logger.info('Voting created successfully', {
      votingId,
      meetingId: body.meetingId
    });

    res.status(201).json({
      success: true,
      data: voting,
      message: 'Voting created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to create voting', {
      error: (error as Error).message,
      meetingId: body.meetingId,
      deviceId
    });
    throw createError.internal('Failed to create voting');
  }
}));

/**
 * @swagger
 * /api/v1/votings/{id}:
 *   get:
 *     summary: 투표 상세 정보 조회
 *     description: 투표 ID를 사용하여 투표 상세 정보를 조회합니다.
 *     tags: [Votings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 투표 ID
 *         schema:
 *           type: string
 *           example: "vote_1634567890_abc123def"
 *     responses:
 *       200:
 *         description: 투표 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Vote'
 *                 message:
 *                   type: string
 *                   example: "Voting details retrieved successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: 투표를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// GET /api/v1/votings/:id - Get voting details
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = GetVotingSchema.parse({ id: req.params.id });

  try {
    logger.info('Fetching voting details', { votingId: id });

    // TODO: Fetch voting from database
    // const voting = await getVotingById(id);

    // Mock response
    const mockVoting: Voting = {
      id,
      meetingId: 'meet_123',
      candidates: [
        {
          placeId: 'place_1',
          name: '스타벅스 신촌점',
          category: '카페',
          distance: 150,
          voteCount: 2
        },
        {
          placeId: 'place_2',
          name: '투썸플레이스',
          category: '카페',
          distance: 200,
          voteCount: 1
        }
      ],
      votes: [
        {
          id: 'vote_1',
          deviceId: 'device_1',
          placeId: 'place_1',
          participantName: '참가자A',
          createdAt: new Date(Date.now() - 60000).toISOString()
        },
        {
          id: 'vote_2',
          deviceId: 'device_2',
          placeId: 'place_1',
          participantName: '참가자B',
          createdAt: new Date(Date.now() - 30000).toISOString()
        }
      ],
      status: 'OPEN',
      createdAt: new Date(Date.now() - 120000).toISOString(),
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      totalVotes: 3
    };

    res.json({
      success: true,
      data: mockVoting,
      message: 'Voting details retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to fetch voting', {
      error: (error as Error).message,
      votingId: id
    });
    throw createError.notFound('Voting not found');
  }
}));

/**
 * @swagger
 * /api/v1/votings/{id}/vote:
 *   post:
 *     summary: 투표하기
 *     description: 특정 장소에 투표합니다.
 *     tags: [Votings]
 *     security:
 *       - DeviceIdAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 투표 ID
 *         schema:
 *           type: string
 *           example: "vote_1634567890_abc123def"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - placeId
 *             properties:
 *               placeId:
 *                 type: string
 *                 description: 선택한 장소 ID
 *                 example: "place_cafe_1"
 *               participantName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: 투표자 이름 (선택사항)
 *                 example: "홍길동"
 *     responses:
 *       201:
 *         description: 투표 성공
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
 *                     vote:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         placeId:
 *                           type: string
 *                         participantName:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                     message:
 *                       type: string
 *                       example: "Vote cast successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: 잘못된 요청 또는 투표 종료
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 이미 투표함
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// POST /api/v1/votings/:id/vote - Cast a vote
router.post('/:id/vote', validateDeviceId, asyncHandler(async (req: Request, res: Response) => {
  const votingId = req.params.id;
  const body = CastVoteSchema.parse(req.body);
  const deviceId = req.headers['x-device-id'] as string;
  const userId = req.headers['x-user-id'] as string;

  try {
    logger.info('Casting vote', {
      votingId,
      placeId: body.placeId,
      deviceId,
      participantName: body.participantName
    });

    // TODO: Check if voting exists and is open
    // TODO: Check if user/device has already voted
    // TODO: Validate placeId is a candidate

    // Create vote
    const vote: Vote = {
      id: `vote_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      userId,
      deviceId,
      placeId: body.placeId,
      participantName: body.participantName,
      createdAt: new Date().toISOString()
    };

    // TODO: Save vote to database atomically
    // await castVote(votingId, vote);

    logger.info('Vote cast successfully', {
      votingId,
      voteId: vote.id,
      placeId: body.placeId
    });

    res.status(201).json({
      success: true,
      data: {
        vote,
        message: 'Vote cast successfully'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to cast vote', {
      error: (error as Error).message,
      votingId,
      placeId: body.placeId,
      deviceId
    });

    // Handle specific voting errors
    if ((error as Error).message.includes('already voted')) {
      throw createError.conflict('You have already voted in this voting');
    }
    if ((error as Error).message.includes('voting closed')) {
      throw createError.badRequest('This voting is no longer accepting votes');
    }
    if ((error as Error).message.includes('invalid candidate')) {
      throw createError.badRequest('Selected place is not a valid candidate');
    }

    throw createError.internal('Failed to cast vote');
  }
}));

/**
 * @swagger
 * /api/v1/votings/{id}/results:
 *   get:
 *     summary: 투표 결과 조회
 *     description: 실시간 투표 결과를 조회합니다.
 *     tags: [Votings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 투표 ID
 *         schema:
 *           type: string
 *           example: "vote_1634567890_abc123def"
 *     responses:
 *       200:
 *         description: 투표 결과 조회 성공
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
 *                     votingId:
 *                       type: string
 *                       example: "vote_1634567890_abc123def"
 *                     status:
 *                       type: string
 *                       enum: [OPEN, CLOSED, COMPLETED]
 *                       example: "OPEN"
 *                     totalVotes:
 *                       type: integer
 *                       example: 3
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           placeId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           category:
 *                             type: string
 *                           voteCount:
 *                             type: integer
 *                           percentage:
 *                             type: number
 *                             format: float
 *                           isWinner:
 *                             type: boolean
 *                     winner:
 *                       type: object
 *                       properties:
 *                         placeId:
 *                           type: string
 *                         name:
 *                           type: string
 *                         voteCount:
 *                           type: integer
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                 message:
 *                   type: string
 *                   example: "Voting results retrieved successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: 투표 결과를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// GET /api/v1/votings/:id/results - Get voting results
router.get('/:id/results', asyncHandler(async (req: Request, res: Response) => {
  const votingId = req.params.id;

  try {
    logger.info('Fetching voting results', { votingId });

    // TODO: Fetch voting results from database
    // const results = await getVotingResults(votingId);

    // Mock results
    const results = {
      votingId,
      status: 'OPEN',
      totalVotes: 3,
      results: [
        {
          placeId: 'place_1',
          name: '스타벅스 신촌점',
          category: '카페',
          voteCount: 2,
          percentage: 66.7,
          isWinner: true
        },
        {
          placeId: 'place_2',
          name: '투썸플레이스',
          category: '카페',
          voteCount: 1,
          percentage: 33.3,
          isWinner: false
        }
      ],
      winner: {
        placeId: 'place_1',
        name: '스타벅스 신촌점',
        voteCount: 2
      },
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: results,
      message: 'Voting results retrieved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to fetch voting results', {
      error: (error as Error).message,
      votingId
    });
    throw createError.notFound('Voting results not found');
  }
}));

/**
 * @swagger
 * /api/v1/votings/{id}/close:
 *   post:
 *     summary: 투표 종료
 *     description: 진행 중인 투표를 종료하고 최종 결과를 확정합니다.
 *     tags: [Votings]
 *     security:
 *       - DeviceIdAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 투표 ID
 *         schema:
 *           type: string
 *           example: "vote_1634567890_abc123def"
 *     responses:
 *       200:
 *         description: 투표 종료 성공
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
 *                     votingId:
 *                       type: string
 *                       example: "vote_1634567890_abc123def"
 *                     status:
 *                       type: string
 *                       enum: [CLOSED]
 *                       example: "CLOSED"
 *                     closedAt:
 *                       type: string
 *                       format: date-time
 *                 message:
 *                   type: string
 *                   example: "Voting closed successfully"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 권한 없음
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
// POST /api/v1/votings/:id/close - Close voting (admin action)
router.post('/:id/close', validateDeviceId, asyncHandler(async (req: Request, res: Response) => {
  const votingId = req.params.id;
  const deviceId = req.headers['x-device-id'] as string;

  try {
    logger.info('Closing voting', { votingId, deviceId });

    // TODO: Check if user has permission to close voting
    // TODO: Update voting status to CLOSED
    // TODO: Determine winner

    res.json({
      success: true,
      data: {
        votingId,
        status: 'CLOSED',
        closedAt: new Date().toISOString()
      },
      message: 'Voting closed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to close voting', {
      error: (error as Error).message,
      votingId,
      deviceId
    });
    throw createError.internal('Failed to close voting');
  }
}));

export { router as votingsRouter };
