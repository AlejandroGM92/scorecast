import axios from 'axios';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

export interface EspnTeam {
  id: string;
  displayName: string;
  abbreviation: string;
  logo: string;
}

export interface EspnCompetitor {
  id: string;
  homeAway: 'home' | 'away';
  score: string;
  team: EspnTeam;
}

export interface EspnFixture {
  id: string;
  date: string;
  status: {
    clock: number;
    displayClock: string;
    type: {
      name: string;   // STATUS_SCHEDULED | STATUS_IN_PROGRESS | STATUS_HALFTIME | STATUS_FINAL | STATUS_POSTPONED | STATUS_CANCELED
      state: string;  // pre | in | post
      completed: boolean;
      description: string;
    };
  };
  venue?: {
    fullName: string;
    address?: { city?: string; country?: string };
  };
  competitors: EspnCompetitor[];
  notes: Array<{ type: string; text: string }>;
}

class EspnFootballService {
  private client = axios.create({ baseURL: ESPN_BASE, timeout: 10_000 });

  private parseFixtures(events: any[]): EspnFixture[] {
    return events
      .filter(e => {
        // Skip placeholder fixtures (TBD teams like "Group A Winner")
        const comps: any[] = e.competitions?.[0]?.competitors ?? [];
        return comps.length === 2 && comps.every((c: any) => c.team?.displayName && !c.team.displayName.includes('Winner') && !c.team.displayName.includes('Place') && !c.team.displayName.includes('Loser') && !c.team.displayName.includes('Group'));
      })
      .map(e => {
        const comp = e.competitions[0];
        return {
          id: e.id,
          date: e.date,
          status: e.status,
          venue: comp.venue,
          competitors: comp.competitors.map((c: any) => ({
            id: c.id,
            homeAway: c.homeAway,
            score: c.score,
            team: {
              id: c.team.id,
              displayName: c.team.displayName,
              abbreviation: c.team.abbreviation,
              logo: c.team.logo ?? '',
            },
          })),
          notes: comp.notes ?? [],
        };
      });
  }

  async getFixturesByDateRange(from: string, to: string): Promise<EspnFixture[]> {
    const res = await this.client.get('/scoreboard', {
      params: { limit: 200, dates: `${from}-${to}` },
    });
    return this.parseFixtures(res.data.response ?? res.data.events ?? []);
  }

  async getAllWorldCupFixtures(): Promise<EspnFixture[]> {
    // WC 2026: June 11 – July 19
    const chunks = await Promise.all([
      this.getFixturesByDateRange('20260611', '20260630'),
      this.getFixturesByDateRange('20260701', '20260719'),
    ]);
    return chunks.flat();
  }

  async getLiveFixtures(): Promise<EspnFixture[]> {
    const res = await this.client.get('/scoreboard');
    const events: any[] = res.data.events ?? [];
    const live = events.filter(e =>
      e.status?.type?.state === 'in' ||
      ['STATUS_IN_PROGRESS', 'STATUS_HALFTIME'].includes(e.status?.type?.name)
    );
    return this.parseFixtures(live);
  }

  async getTodayFixtures(): Promise<EspnFixture[]> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return this.getFixturesByDateRange(today, today);
  }
}

export default new EspnFootballService();
