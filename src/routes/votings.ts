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
