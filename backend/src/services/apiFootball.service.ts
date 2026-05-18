import axios, { AxiosInstance } from 'axios';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface ApiFootballResponse<T> {
  get: string;
  parameters: Record<string, unknown>;
  errors: unknown[];
  results: number;
  paging: { current: number; total: number };
  response: T[];
}

class ApiFootballService {
  private client: AxiosInstance;
  private readonly dailyLimit = 100;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.API_FOOTBALL_BASE_URL,
      headers: {
        'x-apisports-key': process.env.API_FOOTBALL_KEY!,
        'x-apisports-host': 'v3.football.api-sports.io',
      },
      timeout: 10000,
    });
  }

  async checkDailyLimit(): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usage = await prisma.apiUsageLog.findUnique({
      where: { endpoint_date: { endpoint: 'DAILY_TOTAL', date: today } },
    });

    return (usage?.requestCount || 0) < this.dailyLimit;
  }

  async getRemainingRequests(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usage = await prisma.apiUsageLog.findUnique({
      where: { endpoint_date: { endpoint: 'DAILY_TOTAL', date: today } },
    });

    return this.dailyLimit - (usage?.requestCount || 0);
  }

  private async logApiUsage(endpoint: string, statusCode: number, responseTime: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upsertData = { requestCount: { increment: 1 }, statusCode, responseTime };

    await prisma.apiUsageLog.upsert({
      where: { endpoint_date: { endpoint, date: today } },
      update: upsertData,
      create: { endpoint, date: today, requestCount: 1, statusCode, responseTime },
    });

    await prisma.apiUsageLog.upsert({
      where: { endpoint_date: { endpoint: 'DAILY_TOTAL', date: today } },
      update: { requestCount: { increment: 1 } },
      create: { endpoint: 'DAILY_TOTAL', date: today, requestCount: 1, statusCode: 200 },
    });
  }

  async getLiveMatches(): Promise<any[]> {
    if (!(await this.checkDailyLimit())) {
      logger.warn('⚠️ API daily limit reached');
      return [];
    }

    const startTime = Date.now();

    try {
      const response = await this.client.get<ApiFootballResponse<any>>('/fixtures', {
        params: {
          league: process.env.WORLD_CUP_LEAGUE_ID,
          season: process.env.WORLD_CUP_SEASON,
          live: 'all',
        },
      });

      await this.logApiUsage('/fixtures/live', response.status, Date.now() - startTime);
      return response.data.response;
    } catch (error: any) {
      await this.logApiUsage('/fixtures/live', error.response?.status || 500, Date.now() - startTime);
      logger.error('❌ Error fetching live matches', error.message);
      return [];
    }
  }

  async getFixtures(params: Record<string, string | number>): Promise<any[]> {
    if (!(await this.checkDailyLimit())) {
      throw new Error('API daily limit exceeded');
    }

    const startTime = Date.now();

    try {
      const response = await this.client.get<ApiFootballResponse<any>>('/fixtures', {
        params: {
          league: process.env.WORLD_CUP_LEAGUE_ID,
          season: process.env.WORLD_CUP_SEASON,
          ...params,
        },
      });

      await this.logApiUsage('/fixtures', response.status, Date.now() - startTime);
      return response.data.response;
    } catch (error: any) {
      await this.logApiUsage('/fixtures', error.response?.status || 500, Date.now() - startTime);
      throw error;
    }
  }

  async getMatchStatistics(fixtureId: number): Promise<any> {
    if (!(await this.checkDailyLimit())) {
      throw new Error('API daily limit exceeded');
    }

    const startTime = Date.now();

    try {
      const response = await this.client.get<ApiFootballResponse<any>>('/fixtures/statistics', {
        params: { fixture: fixtureId },
      });

      await this.logApiUsage('/fixtures/statistics', response.status, Date.now() - startTime);
      return response.data.response[0];
    } catch (error: any) {
      await this.logApiUsage('/fixtures/statistics', error.response?.status || 500, Date.now() - startTime);
      throw error;
    }
  }

  async getLeagueLiveAndToday(leagueId: number, season: number): Promise<{ live: any[]; today: any[] }> {
    const startTime = Date.now();
    try {
      const [liveRes, todayRes] = await Promise.all([
        this.client.get<ApiFootballResponse<any>>('/fixtures', {
          params: { league: leagueId, live: 'all' },
        }),
        this.client.get<ApiFootballResponse<any>>('/fixtures', {
          params: { league: leagueId, season, date: new Date().toISOString().split('T')[0] },
        }),
      ]);
      await this.logApiUsage(`/fixtures/league/${leagueId}`, 200, Date.now() - startTime);
      return { live: liveRes.data.response, today: todayRes.data.response };
    } catch (error: any) {
      await this.logApiUsage(`/fixtures/league/${leagueId}`, error.response?.status || 500, Date.now() - startTime);
      throw error;
    }
  }

  async getFixtureEvents(fixtureId: number): Promise<any[]> {
    const startTime = Date.now();
    try {
      const response = await this.client.get<ApiFootballResponse<any>>('/fixtures/events', {
        params: { fixture: fixtureId },
      });
      await this.logApiUsage('/fixtures/events', response.status, Date.now() - startTime);
      return response.data.response;
    } catch (error: any) {
      await this.logApiUsage('/fixtures/events', error.response?.status || 500, Date.now() - startTime);
      return [];
    }
  }

  async getTeams(): Promise<any[]> {
    const startTime = Date.now();

    try {
      const response = await this.client.get<ApiFootballResponse<any>>('/teams', {
        params: {
          league: process.env.WORLD_CUP_LEAGUE_ID,
          season: process.env.WORLD_CUP_SEASON,
        },
      });

      await this.logApiUsage('/teams', response.status, Date.now() - startTime);
      return response.data.response;
    } catch (error: any) {
      await this.logApiUsage('/teams', error.response?.status || 500, Date.now() - startTime);
      throw error;
    }
  }
}

export default new ApiFootballService();
