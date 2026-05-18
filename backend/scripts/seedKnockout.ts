import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// New teams for groups E–H (flagcdn.com ISO2 codes)
const newTeams = [
  // Group E
  { apiId: 90001, code: 'NED', name: 'Países Bajos', nameEn: 'Netherlands', flag: 'https://flagcdn.com/w80/nl.png', group: 'E', odds: 19.0 },
  { apiId: 90002, code: 'BEL', name: 'Bélgica',       nameEn: 'Belgium',     flag: 'https://flagcdn.com/w80/be.png', group: 'E', odds: 34.0 },
  { apiId: 90003, code: 'TUR', name: 'Turquía',        nameEn: 'Turkey',      flag: 'https://flagcdn.com/w80/tr.png', group: 'E', odds: 101.0 },
  { apiId: 90004, code: 'SUI', name: 'Suiza',          nameEn: 'Switzerland', flag: 'https://flagcdn.com/w80/ch.png', group: 'E', odds: 67.0 },
  // Group F
  { apiId: 90005, code: 'CRO', name: 'Croacia',        nameEn: 'Croatia',     flag: 'https://flagcdn.com/w80/hr.png', group: 'F', odds: 81.0 },
  { apiId: 90006, code: 'SWE', name: 'Suecia',         nameEn: 'Sweden',      flag: 'https://flagcdn.com/w80/se.png', group: 'F', odds: 101.0 },
  { apiId: 90007, code: 'AUT', name: 'Austria',        nameEn: 'Austria',     flag: 'https://flagcdn.com/w80/at.png', group: 'F', odds: 101.0 },
  { apiId: 90008, code: 'SCO', name: 'Escocia',        nameEn: 'Scotland',    flag: 'https://flagcdn.com/w80/gb-sct.png', group: 'F', odds: 151.0 },
  // Group G
  { apiId: 90009, code: 'JPN', name: 'Japón',          nameEn: 'Japan',       flag: 'https://flagcdn.com/w80/jp.png', group: 'G', odds: 67.0 },
  { apiId: 90010, code: 'KOR', name: 'Corea del Sur',  nameEn: 'South Korea', flag: 'https://flagcdn.com/w80/kr.png', group: 'G', odds: 401.0 },
  { apiId: 90011, code: 'AUS', name: 'Australia',      nameEn: 'Australia',   flag: 'https://flagcdn.com/w80/au.png', group: 'G', odds: 401.0 },
  { apiId: 90012, code: 'IRN', name: 'Irán',           nameEn: 'Iran',        flag: 'https://flagcdn.com/w80/ir.png', group: 'G', odds: 501.0 },
  // Group H
  { apiId: 90013, code: 'SEN', name: 'Senegal',        nameEn: 'Senegal',     flag: 'https://flagcdn.com/w80/sn.png', group: 'H', odds: 101.0 },
  { apiId: 90014, code: 'CIV', name: 'Costa de Marfil',nameEn: 'Ivory Coast', flag: 'https://flagcdn.com/w80/ci.png', group: 'H', odds: 251.0 },
  { apiId: 90015, code: 'GHA', name: 'Ghana',          nameEn: 'Ghana',       flag: 'https://flagcdn.com/w80/gh.png', group: 'H', odds: 301.0 },
  { apiId: 90016, code: 'EGY', name: 'Egipto',         nameEn: 'Egypt',       flag: 'https://flagcdn.com/w80/eg.png', group: 'H', odds: 251.0 },
];

// Group stage matches for E–H (num 25–48)
const newGroupMatches = [
  // Group E
  { num: 25, homeCode: 'NED', awayCode: 'SUI', date: '2026-06-13T15:00:00-05:00', venue: 'Lumen Field',         city: 'Seattle' },
  { num: 26, homeCode: 'BEL', awayCode: 'TUR', date: '2026-06-13T18:00:00-05:00', venue: 'Arrowhead Stadium',   city: 'Kansas City' },
  { num: 27, homeCode: 'NED', awayCode: 'TUR', date: '2026-06-18T15:00:00-05:00', venue: 'Lumen Field',         city: 'Seattle' },
  { num: 28, homeCode: 'BEL', awayCode: 'SUI', date: '2026-06-18T18:00:00-05:00', venue: 'Arrowhead Stadium',   city: 'Kansas City' },
  { num: 29, homeCode: 'SUI', awayCode: 'TUR', date: '2026-06-24T15:00:00-05:00', venue: 'Lumen Field',         city: 'Seattle' },
  { num: 30, homeCode: 'NED', awayCode: 'BEL', date: '2026-06-24T18:00:00-05:00', venue: 'Arrowhead Stadium',   city: 'Kansas City' },
  // Group F
  { num: 31, homeCode: 'CRO', awayCode: 'SCO', date: '2026-06-14T15:00:00-05:00', venue: 'Allegiant Stadium',   city: 'Las Vegas' },
  { num: 32, homeCode: 'SWE', awayCode: 'AUT', date: '2026-06-14T18:00:00-05:00', venue: 'Gillette Stadium',    city: 'Boston' },
  { num: 33, homeCode: 'CRO', awayCode: 'AUT', date: '2026-06-19T15:00:00-05:00', venue: 'Allegiant Stadium',   city: 'Las Vegas' },
  { num: 34, homeCode: 'SWE', awayCode: 'SCO', date: '2026-06-19T18:00:00-05:00', venue: 'Gillette Stadium',    city: 'Boston' },
  { num: 35, homeCode: 'SCO', awayCode: 'AUT', date: '2026-06-25T15:00:00-05:00', venue: 'Allegiant Stadium',   city: 'Las Vegas' },
  { num: 36, homeCode: 'CRO', awayCode: 'SWE', date: '2026-06-25T18:00:00-05:00', venue: 'Gillette Stadium',    city: 'Boston' },
  // Group G
  { num: 37, homeCode: 'JPN', awayCode: 'IRN', date: '2026-06-15T15:00:00-06:00', venue: 'BC Place',            city: 'Vancouver' },
  { num: 38, homeCode: 'KOR', awayCode: 'AUS', date: '2026-06-15T18:00:00-06:00', venue: 'Estadio Akron',       city: 'Guadalajara' },
  { num: 39, homeCode: 'JPN', awayCode: 'AUS', date: '2026-06-20T15:00:00-06:00', venue: 'BC Place',            city: 'Vancouver' },
  { num: 40, homeCode: 'KOR', awayCode: 'IRN', date: '2026-06-20T18:00:00-06:00', venue: 'Estadio Akron',       city: 'Guadalajara' },
  { num: 41, homeCode: 'AUS', awayCode: 'IRN', date: '2026-06-25T15:00:00-06:00', venue: 'BC Place',            city: 'Vancouver' },
  { num: 42, homeCode: 'JPN', awayCode: 'KOR', date: '2026-06-25T18:00:00-06:00', venue: 'Estadio Akron',       city: 'Guadalajara' },
  // Group H
  { num: 43, homeCode: 'SEN', awayCode: 'EGY', date: '2026-06-16T15:00:00-05:00', venue: 'Lincoln Financial',  city: 'Filadelfia' },
  { num: 44, homeCode: 'CIV', awayCode: 'GHA', date: '2026-06-16T18:00:00-05:00', venue: 'NRG Stadium',         city: 'Houston' },
  { num: 45, homeCode: 'SEN', awayCode: 'GHA', date: '2026-06-21T15:00:00-05:00', venue: 'Lincoln Financial',  city: 'Filadelfia' },
  { num: 46, homeCode: 'CIV', awayCode: 'EGY', date: '2026-06-21T18:00:00-05:00', venue: 'NRG Stadium',         city: 'Houston' },
  { num: 47, homeCode: 'GHA', awayCode: 'EGY', date: '2026-06-26T15:00:00-05:00', venue: 'Lincoln Financial',  city: 'Filadelfia' },
  { num: 48, homeCode: 'SEN', awayCode: 'CIV', date: '2026-06-26T18:00:00-05:00', venue: 'NRG Stadium',         city: 'Houston' },
];

// Round of 16 — Dieciseisavos de final (Jul 1–4, 2026)
// Projected bracket: best team from each group based on odds
// 1A=USA  2A=MEX | 1B=ESP  2B=ARG | 1C=FRA  2C=BRA | 1D=ENG  2D=GER
// 1E=NED  2E=BEL | 1F=CRO  2F=SWE | 1G=JPN  2G=KOR | 1H=SEN  2H=CIV
const r16Matches = [
  { num: 49, homeCode: 'USA', awayCode: 'ARG', date: '2026-07-01T15:00:00-05:00', venue: 'MetLife Stadium',    city: 'Nueva York',  label: 'R16 · 1A vs 2B' },
  { num: 50, homeCode: 'FRA', awayCode: 'GER', date: '2026-07-01T19:00:00-05:00', venue: 'AT&T Stadium',       city: 'Dallas',      label: 'R16 · 1C vs 2D' },
  { num: 51, homeCode: 'NED', awayCode: 'SWE', date: '2026-07-02T15:00:00-05:00', venue: 'Hard Rock Stadium',  city: 'Miami',       label: 'R16 · 1E vs 2F' },
  { num: 52, homeCode: 'JPN', awayCode: 'CIV', date: '2026-07-02T19:00:00-06:00', venue: 'Estadio Azteca',     city: 'Ciudad de México', label: 'R16 · 1G vs 2H' },
  { num: 53, homeCode: 'ESP', awayCode: 'MEX', date: '2026-07-03T15:00:00-05:00', venue: 'SoFi Stadium',       city: 'Los Angeles', label: 'R16 · 1B vs 2A' },
  { num: 54, homeCode: 'ENG', awayCode: 'BRA', date: '2026-07-03T19:00:00-05:00', venue: 'MetLife Stadium',    city: 'Nueva York',  label: 'R16 · 1D vs 2C' },
  { num: 55, homeCode: 'CRO', awayCode: 'BEL', date: '2026-07-04T15:00:00-06:00', venue: 'Estadio BBVA',       city: 'Monterrey',   label: 'R16 · 1F vs 2E' },
  { num: 56, homeCode: 'SEN', awayCode: 'KOR', date: '2026-07-04T19:00:00-05:00', venue: 'AT&T Stadium',       city: 'Dallas',      label: 'R16 · 1H vs 2G' },
];

async function seed() {
  console.log('🌱 Seeding groups E–H + Dieciseisavos...\n');

  // 1. Upsert new teams
  for (const t of newTeams) {
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
  console.log(`\n✅ ${newTeams.length} equipos nuevos`);

  // 2. Fetch all team IDs
  const dbTeams = await prisma.team.findMany({ select: { id: true, code: true } });
  const teamMap = Object.fromEntries(dbTeams.map((t) => [t.code, t.id]));

  // 3. Group stage matches E–H
  let created = 0;
  for (const m of newGroupMatches) {
    const homeId = teamMap[m.homeCode];
    const awayId = teamMap[m.awayCode];
    if (!homeId || !awayId) { console.warn(`  ⚠ Equipo no encontrado: partido ${m.num}`); continue; }

    await prisma.match.upsert({
      where: { apiFootballId: 900000 + m.num },
      update: {},
      create: {
        apiFootballId: 900000 + m.num,
        phase: 'GROUP_STAGE',
        matchNumber: m.num,
        round: 'Grupo',
        teamHomeId: homeId,
        teamAwayId: awayId,
        dateTime: new Date(m.date),
        venue: m.venue,
        city: m.city,
        timezone: 'America/Mexico_City',
        status: 'SCHEDULED',
      },
    });
    process.stdout.write(`  ✓ ${m.homeCode} vs ${m.awayCode}\n`);
    created++;
  }
  console.log(`\n✅ ${created} partidos de fase de grupos (E–H)`);

  // 4. Round of 16
  let r16created = 0;
  for (const m of r16Matches) {
    const homeId = teamMap[m.homeCode];
    const awayId = teamMap[m.awayCode];
    if (!homeId || !awayId) { console.warn(`  ⚠ Equipo no encontrado: R16 partido ${m.num}`); continue; }

    await prisma.match.upsert({
      where: { apiFootballId: 900000 + m.num },
      update: {},
      create: {
        apiFootballId: 900000 + m.num,
        phase: 'ROUND_OF_16',
        matchNumber: m.num,
        round: 'Dieciseisavos',
        teamHomeId: homeId,
        teamAwayId: awayId,
        dateTime: new Date(m.date),
        venue: m.venue,
        city: m.city,
        timezone: 'America/Mexico_City',
        status: 'SCHEDULED',
      },
    });
    process.stdout.write(`  ✓ ${m.label} — ${m.homeCode} vs ${m.awayCode}\n`);
    r16created++;
  }
  console.log(`\n✅ ${r16created} partidos de Dieciseisavos`);
  console.log('\n🎉 ¡Listo! Ahora hay 8 grupos y fase eliminatoria.');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
