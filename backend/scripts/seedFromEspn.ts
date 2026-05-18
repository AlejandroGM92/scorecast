/**
 * seedFromEspn.ts
 * Replaces placeholder WC matches with the real FIFA WC 2026 schedule from ESPN.
 * Safe to run multiple times (idempotent).
 */
import * as dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { MatchPhase, MatchStatus } from '@prisma/client';
import { prisma } from '../src/config/database';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

// ESPN name → our DB nameEn (for teams that need explicit aliasing)
const NAME_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey',
};

function phaseFromDate(dateStr: string): MatchPhase {
  const d = new Date(dateStr);
  const ymd = d.toISOString().slice(0, 10);
  if (ymd <= '2026-06-27') return 'GROUP_STAGE';
  if (ymd <= '2026-07-03') return 'ROUND_OF_32';  // Jun 28 - Jul 3: Dieciseisavos
  if (ymd <= '2026-07-08') return 'ROUND_OF_16';  // Jul 4-8: Octavos
  if (ymd <= '2026-07-11') return 'QUARTER_FINALS';
  if (ymd <= '2026-07-16') return 'SEMI_FINALS';
  if (ymd === '2026-07-18') return 'THIRD_PLACE';
  return 'FINAL';
}

function mapStatus(espnStatusName: string): MatchStatus {
  switch (espnStatusName) {
    case 'STATUS_IN_PROGRESS': return 'LIVE';
    case 'STATUS_HALFTIME':    return 'HALFTIME';
    case 'STATUS_FINAL':       return 'FINISHED';
    case 'STATUS_POSTPONED':   return 'SCHEDULED';
    case 'STATUS_CANCELED':    return 'CANCELLED';
    default:                   return 'SCHEDULED';
  }
}

async function fetchAllFixtures() {
  const client = axios.create({ baseURL: ESPN_BASE, timeout: 15_000 });
  const [r1, r2] = await Promise.all([
    client.get('/scoreboard', { params: { limit: 200, dates: '20260611-20260630' } }),
    client.get('/scoreboard', { params: { limit: 200, dates: '20260701-20260719' } }),
  ]);
  const events = [...(r1.data.events ?? []), ...(r2.data.events ?? [])];

  return events.filter(e => {
    const comps: any[] = e.competitions?.[0]?.competitors ?? [];
    return comps.length === 2 && comps.every((c: any) => {
      const n: string = c.team?.displayName ?? '';
      return n && !n.includes('Winner') && !n.includes('Loser') && !n.includes('Place') && !n.includes('Group') && !n.includes('Round');
    });
  }).map(e => {
    const comp = e.competitions[0];
    const home = comp.competitors.find((c: any) => c.homeAway === 'home');
    const away = comp.competitors.find((c: any) => c.homeAway === 'away');
    return {
      id: parseInt(e.id, 10),
      date: e.date as string,
      statusName: e.status?.type?.name as string,
      venue: (comp.venue?.fullName ?? '') as string,
      city: (comp.venue?.address?.city ?? '') as string,
      home: { name: home.team.displayName as string, abbr: home.team.abbreviation as string, logo: home.team.logo as string, score: home.score as string },
      away: { name: away.team.displayName as string, abbr: away.team.abbreviation as string, logo: away.team.logo as string, score: away.score as string },
    };
  });
}

async function main() {
  console.log('🌍 Seeding WC 2026 from ESPN...\n');

  // 1. Count existing WC placeholder matches (apiFootballId 900001–999999)
  const placeholders = await prisma.match.findMany({
    where: { apiFootballId: { gte: 900000, lte: 999999 } },
    select: { id: true, _count: { select: { predictions: true } } },
  });
  const totalPreds = placeholders.reduce((s, m) => s + m._count.predictions, 0);
  console.log(`  Found ${placeholders.length} placeholder matches with ${totalPreds} predictions`);

  if (totalPreds > 0) {
    console.log('  ⚠️  Deleting predictions on placeholder matches...');
    await prisma.prediction.deleteMany({ where: { matchId: { in: placeholders.map(m => m.id) } } });
  }
  if (placeholders.length > 0) {
    console.log('  🗑️  Deleting placeholder matches...');
    await prisma.match.deleteMany({ where: { id: { in: placeholders.map(m => m.id) } } });
  }

  // 2. Fetch real schedule from ESPN
  console.log('\n  📡 Fetching WC 2026 schedule from ESPN...');
  const fixtures = await fetchAllFixtures();
  console.log(`  📦 ${fixtures.length} fixtures found\n`);

  // 3. Build team map: nameEn (lowercase) → team id
  const dbTeams = await prisma.team.findMany({ select: { id: true, nameEn: true, code: true } });
  const teamMap = new Map<string, string>();
  for (const t of dbTeams) {
    teamMap.set(t.nameEn.toLowerCase(), t.id);
    teamMap.set(t.code.toLowerCase(), t.id);
  }

  const usedCodes = new Set(dbTeams.map(t => t.code));
  let teamsCreated = 0;

  async function resolveTeam(espnName: string, espnAbbr: string, espnLogo: string): Promise<string | null> {
    const normalized = NAME_ALIAS[espnName] ?? espnName;
    const key = normalized.toLowerCase();

    if (teamMap.has(key)) return teamMap.get(key)!;
    // Try abbreviation
    if (teamMap.has(espnAbbr.toLowerCase())) return teamMap.get(espnAbbr.toLowerCase())!;

    // Create new team
    let code = espnAbbr.toUpperCase().substring(0, 3);
    if (usedCodes.has(code)) {
      for (let i = 1; i < 10; i++) {
        const c = code.substring(0, 2) + i;
        if (!usedCodes.has(c)) { code = c; break; }
      }
    }
    usedCodes.add(code);

    const created = await prisma.team.create({
      data: {
        code,
        name: normalized,
        nameEn: normalized,
        flag: espnLogo,
        championOdds: 0,
        apiFootballId: Math.floor(Math.random() * 100000) + 800000, // placeholder int
      },
    });
    teamMap.set(key, created.id);
    teamMap.set(code.toLowerCase(), created.id);
    console.log(`  + Team created: ${normalized} [${code}]`);
    teamsCreated++;
    return created.id;
  }

  // 4. Upsert matches
  let created = 0;
  let updated = 0;

  for (const f of fixtures) {
    const homeId = await resolveTeam(f.home.name, f.home.abbr, f.home.logo);
    const awayId = await resolveTeam(f.away.name, f.away.abbr, f.away.logo);
    if (!homeId || !awayId) continue;

    const existing = await prisma.match.findUnique({ where: { apiFootballId: f.id } });
    const status = mapStatus(f.statusName);
    const isActive = status === 'LIVE' || status === 'HALFTIME' || status === 'FINISHED';
    const phase = phaseFromDate(f.date);

    if (existing) {
      await prisma.match.update({
        where: { id: existing.id },
        data: {
          status,
          scoreHome: isActive ? parseInt(f.home.score, 10) : null,
          scoreAway: isActive ? parseInt(f.away.score, 10) : null,
          lastSyncAt: new Date(),
        },
      });
      updated++;
    } else {
      await prisma.match.create({
        data: {
          apiFootballId: f.id,
          matchNumber: f.id,
          phase,
          round: phase.replace(/_/g, ' '),
          teamHomeId: homeId,
          teamAwayId: awayId,
          dateTime: new Date(f.date),
          venue: f.venue.substring(0, 100) || null,
          city: f.city.substring(0, 50) || null,
          timezone: 'UTC',
          status,
          scoreHome: isActive ? parseInt(f.home.score, 10) : null,
          scoreAway: isActive ? parseInt(f.away.score, 10) : null,
          lastSyncAt: new Date(),
        },
      });
      created++;
    }
  }

  console.log('\n✅ Seed completo:');
  console.log(`  Equipos creados: ${teamsCreated}`);
  console.log(`  Partidos creados: ${created}`);
  console.log(`  Partidos actualizados: ${updated}`);
  console.log(`  Total WC 2026: ${created + updated} partidos`);
}

main()
  .then(() => { process.exit(0); })
  .catch(e => { console.error('❌', e.message); process.exit(1); });
