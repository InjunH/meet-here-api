import swaggerJsdoc from 'swagger-jsdoc';
import { Options } from 'swagger-jsdoc';

const options: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MeetHere API',
      version: '1.0.0',
      description: '여러 사람의 중간지점을 찾아 만남 장소를 추천하는 API 서버입니다.',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
      contact: {
        name: 'MeetHere Team',
        email: 'team@meethere.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:8080',
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        // 공통 응답 스키마
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: '응답 성공 여부',
            },
            message: {
              type: 'string',
              description: '응답 메시지',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: '응답 시각',
            },
          },
          required: ['success', 'timestamp'],
        },
        // 에러 응답 스키마
        ErrorResponse: {
          allOf: [
            { $ref: '#/components/schemas/ApiResponse' },
            {
              type: 'object',
              properties: {
                error: {
                  type: 'string',
                  description: '에러 타입',
                },
                details: {
                  type: 'string',
                  description: '에러 상세 메시지',
                },
              },
              required: ['error'],
            },
          ],
        },
        // 헬스체크 응답
        HealthResponse: {
          allOf: [
            { $ref: '#/components/schemas/ApiResponse' },
            {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      description: '서버 상태',
                      enum: ['ok', 'error'],
                    },
                    uptime: {
                      type: 'number',
                      description: '서버 업타임 (초)',
                    },
                    environment: {
                      type: 'string',
                      description: '실행 환경',
                    },
                    version: {
                      type: 'string',
                      description: 'API 버전',
                    },
                  },
                  required: ['status', 'uptime', 'environment', 'version'],
                },
              },
            },
          ],
        },
        // 위치 정보
        Location: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              format: 'double',
              description: '위도',
              minimum: -90,
              maximum: 90,
            },
            lng: {
              type: 'number',
              format: 'double',
              description: '경도',
              minimum: -180,
              maximum: 180,
            },
            address: {
              type: 'string',
              description: '주소',
            },
          },
          required: ['lat', 'lng'],
        },
        // 참가자 정보
        Participant: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '참가자 ID',
            },
            name: {
              type: 'string',
              description: '참가자 이름',
              maxLength: 50,
            },
            location: {
              $ref: '#/components/schemas/Location',
            },
            joinedAt: {
              type: 'string',
              format: 'date-time',
              description: '참여 시각',
            },
          },
          required: ['id', 'name', 'location'],
        },
        // 장소 정보
        Place: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '장소 ID',
            },
            name: {
              type: 'string',
              description: '장소명',
            },
            category: {
              type: 'string',
              description: '카테고리',
            },
            location: {
              $ref: '#/components/schemas/Location',
            },
            rating: {
              type: 'number',
              format: 'float',
              description: '평점',
              minimum: 0,
              maximum: 5,
            },
            phone: {
              type: 'string',
              description: '전화번호',
            },
            url: {
              type: 'string',
              format: 'url',
              description: '장소 URL',
            },
            distance: {
              type: 'number',
              format: 'float',
              description: '중심점으로부터 거리 (미터)',
            },
            travelTime: {
              type: 'object',
              properties: {
                walking: {
                  type: 'number',
                  description: '도보 소요시간 (분)',
                },
                driving: {
                  type: 'number',
                  description: '차량 소요시간 (분)',
                },
                transit: {
                  type: 'number',
                  description: '대중교통 소요시간 (분)',
                },
              },
            },
          },
          required: ['id', 'name', 'location'],
        },
        // 미팅 세션
        Meeting: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '미팅 세션 ID',
            },
            title: {
              type: 'string',
              description: '미팅 제목',
              maxLength: 100,
            },
            description: {
              type: 'string',
              description: '미팅 설명',
              maxLength: 500,
            },
            participants: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Participant',
              },
              description: '참가자 목록',
            },
            centerLocation: {
              $ref: '#/components/schemas/Location',
            },
            recommendedPlaces: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Place',
              },
              description: '추천 장소 목록',
            },
            status: {
              type: 'string',
              enum: ['waiting', 'in_progress', 'voting', 'completed'],
              description: '미팅 상태',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: '생성 시각',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: '만료 시각',
            },
          },
          required: ['id', 'title', 'participants', 'status', 'createdAt'],
        },
        // 투표 정보
        Vote: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '투표 ID',
            },
            meetingId: {
              type: 'string',
              description: '미팅 세션 ID',
            },
            participantId: {
              type: 'string',
              description: '투표자 ID',
            },
            placeId: {
              type: 'string',
              description: '투표한 장소 ID',
            },
            votedAt: {
              type: 'string',
              format: 'date-time',
              description: '투표 시각',
            },
          },
          required: ['id', 'meetingId', 'participantId', 'placeId', 'votedAt'],
        },
      },
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
        DeviceIdAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Device-ID',
          description: '클라이언트 기기 식별을 위한 고유 ID',
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: '서버 상태 확인',
      },
      {
        name: 'Meetings',
        description: '미팅 세션 관리',
      },
      {
        name: 'Places',
        description: '장소 검색 및 추천',
      },
      {
        name: 'Votings',
        description: '장소 투표 시스템',
      },
      {
        name: 'Kakao',
        description: '카카오 API 통합',
      },
    ],
  },
  apis: [
    './src/routes/*.ts', // 라우터 파일들
  ],
};

const specs = swaggerJsdoc(options);

export default specs;