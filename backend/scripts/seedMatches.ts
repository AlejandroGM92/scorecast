import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const teams = [
  // Group A
  { apiId: 1,  code: 'USA', name: 'Estados Unidos', nameEn: 'United States', flag: 'https://media.api-sports.io/football/teams/1.png',  group: 'A', odds: 51.0 },
  { apiId: 16, code: 'MEX', name: 'México',          nameEn: 'Mexico',        flag: 'https://media.api-sports.io/football/teams/16.png', group: 'A', odds: 81.0 },
  { apiId: 30, code: 'URU', name: 'Uruguay',          nameEn: 'Uruguay',       flag: 'https://media.api-sports.io/football/teams/30.png', group: 'A', odds: 81.0 },
  { apiId: 31, code: 'PAN', name: 'Panamá',           nameEn: 'Panama',        flag: 'https://media.api-sports.io/football/teams/31.png', group: 'A', odds: 1501.0 },
  // Group B
  { apiId: 9,  code: 'ESP', name: 'España',           nameEn: 'Spain',         flag: 'https://media.api-sports.io/football/teams/9.png',  group: 'B', odds: 5.4 },
  { apiId: 26, code: 'ARG', name: 'Argentina',        nameEn: 'Argentina',     flag: 'https://media.api-sports.io/football/teams/26.png', group: 'B', odds: 9.0 },
  { apiId: 34, code: 'MAR', name: 'Marruecos',        nameEn: 'Morocco',       flag: 'https://media.api-sports.io/football/teams/34.png', group: 'B', odds: 51.0 },
  { apiId: 21, code: 'CAN', name: 'Canadá',           nameEn: 'Canada',        flag: 'https://media.api-sports.io/football/teams/21.png', group: 'B', odds: 101.0 },
  // Group C
  { apiId: 2,  code: 'FRA', name: 'Francia',          nameEn: 'France',        flag: 'https://media.api-sports.io/football/teams/2.png',  group: 'C', odds: 6.0 },
  { apiId: 6,  code: 'BRA', name: 'Brasil',           nameEn: 'Brazil',        flag: 'https://media.api-sports.io/football/teams/6.png',  group: 'C', odds: 9.0 },
  { apiId: 27, code: 'COL', name: 'Colombia',         nameEn: 'Colombia',      flag: 'https://media.api-sports.io/football/teams/27.png', group: 'C', odds: 41.0 },
  { apiId: 24, code: 'ECU', name: 'Ecuador',          nameEn: 'Ecuador',       flag: 'https://media.api-sports.io/football/teams/24.png', group: 'C', odds: 101.0 },
  // Group D
  { apiId: 10, code: 'ENG', name: 'Inglaterra',       nameEn: 'England',       flag: 'https://media.api-sports.io/football/teams/10.png', group: 'D', odds: 7.0 },
  { apiId: 25, code: 'GER', name: 'Alemania',         nameEn: 'Germany',       flag: 'https://media.api-sports.io/football/teams/25.png', group: 'D', odds: 13.0 },
  { apiId: 5,  code: 'POR', name: 'Portugal',         nameEn: 'Portugal',      flag: 'https://media.api-sports.io/football/teams/5.png',  group: 'D', odds: 13.0 },
  { apiId: 29, code: 'CHI', name: 'Chile',            nameEn: 'Chile',         flag: 'https://media.api-sports.io/football/teams/29.png', group: 'D', odds: 201.0 },
];

// Group stage matches (Jun 11 – Jun 28, 2026)
const matchDefs = [
  // Group A
  { num: 1,  homeCode: 'MEX', awayCode: 'URU', date: '2026-06-11T18:00:00-06:00', venue: 'SoFi Stadium', city: 'Los Angeles' },
  { num: 2,  homeCode: 'USA', awayCode: 'PAN', date: '2026-06-12T15:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { num: 3,  homeCode: 'MEX', awayCode: 'PAN', date: '2026-06-16T15:00:00-06:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { num: 4,  homeCode: 'USA', awayCode: 'URU', date: '2026-06-17T18:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { num: 5,  homeCode: 'PAN', awayCode: 'URU', date: '2026-06-22T15:00:00-06:00', venue: 'Estadio Azteca', city: 'Ciudad de México' },
  { num: 6,  homeCode: 'USA', awayCode: 'MEX', date: '2026-06-22T18:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  // Group B
  { num: 7,  homeCode: 'ESP', awayCode: 'MAR', date: '2026-06-12T18:00:00-05:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { num: 8,  homeCode: 'ARG', awayCode: 'CAN', date: '2026-06-13T15:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { num: 9,  homeCode: 'ESP', awayCode: 'CAN', date: '2026-06-17T15:00:00-06:00', venue: 'SoFi Stadium', city: 'Los Angeles' },
  { num: 10, homeCode: 'ARG', awayCode: 'MAR', date: '2026-06-18T18:00:00-05:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  { num: 11, homeCode: 'CAN', awayCode: 'MAR', date: '2026-06-22T15:00:00-06:00', venue: 'BC Place', city: 'Vancouver' },
  { num: 12, homeCode: 'ESP', awayCode: 'ARG', date: '2026-06-22T18:00:00-05:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  // Group C
  { num: 13, homeCode: 'FRA', awayCode: 'COL', date: '2026-06-13T18:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { num: 14, homeCode: 'BRA', awayCode: 'ECU', date: '2026-06-14T15:00:00-06:00', venue: 'SoFi Stadium', city: 'Los Angeles' },
  { num: 15, homeCode: 'FRA', awayCode: 'ECU', date: '2026-06-18T15:00:00-05:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { num: 16, homeCode: 'BRA', awayCode: 'COL', date: '2026-06-19T18:00:00-05:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  { num: 17, homeCode: 'COL', awayCode: 'ECU', date: '2026-06-23T15:00:00-06:00', venue: 'Estadio BBVA', city: 'Monterrey' },
  { num: 18, homeCode: 'FRA', awayCode: 'BRA', date: '2026-06-23T18:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  // Group D
  { num: 19, homeCode: 'ENG', awayCode: 'CHI', date: '2026-06-14T18:00:00-05:00', venue: 'Hard Rock Stadium', city: 'Miami' },
  { num: 20, homeCode: 'GER', awayCode: 'POR', date: '2026-06-15T15:00:00-06:00', venue: 'SoFi Stadium', city: 'Los Angeles' },
  { num: 21, homeCode: 'ENG', awayCode: 'POR', date: '2026-06-19T15:00:00-05:00', venue: 'AT&T Stadium', city: 'Dallas' },
  { num: 22, homeCode: 'GER', awayCode: 'CHI', date: '2026-06-20T18:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
  { num: 23, homeCode: 'CHI', awayCode: 'POR', date: '2026-06-24T15:00:00-06:00', venue: 'SoFi Stadium', city: 'Los Angeles' },
  { num: 24, homeCode: 'ENG', awayCode: 'GER', date: '2026-06-24T18:00:00-05:00', venue: 'MetLife Stadium', city: 'Nueva York' },
];

async function seed() {
  console.log('🌱 Seeding teams and group stage matches...\n');

  // Upsert teams
  for (const t of teams) {
    await prisma.team.upsert({
      where: { code: t.code },
      update: {},
      create: {
        apiFootballId: t.apiId,
        code: t.code,
        name: t.name,
        nameEn: t.nameEn,
        flag: t.flag,
        group: t.group,
        championOdds: t.odds,
      },
    });
    process.stdout.write(`  ✓ ${t.name} (Grupo ${t.group})\n`);
  }

  console.log(`\n✅ ${teams.length} equipos creados`);

  // Fetch team IDs from DB
  const dbTeams = await prisma.team.findMany({ select: { id: true, code: true } });
  const teamMap = Object.fromEntries(dbTeams.map((t) => [t.code, t.id]));

  // Create matches
  let created = 0;
  for (const m of matchDefs) {
    const homeId = teamMap[m.homeCode];
    const awayId = teamMap[m.awayCode];
    if (!homeId || !awayId) { console.warn(`  ⚠ Team not found for match ${m.num}`); continue; }

    await prisma.match.upsert({
      where: { apiFootballId: 900000 + m.num },
      update: {},
      create: {
        apiFootballId: 900000 + m.num,
        phase: 'GROUP_STAGE',
        matchNumber: m.num,
        round: `Grupo`,
        teamHomeId: homeId,
        teamAwayId: awayId,
        dateTime: new Date(m.date),
        venue: m.venue,
        city: m.city,
        timezone: 'America/Mexico_City',
        status: 'SCHEDULED',
      },
    });
    created++;
  }

  console.log(`✅ ${created} partidos de fase de grupos creados\n`);
  console.log('🎉 ¡Listo! Abre http://localhost:5175 para ver los partidos.');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
