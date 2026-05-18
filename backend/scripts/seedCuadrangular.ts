/**
 * seedCuadrangular.ts
 * Elimina partidos COL viejos y crea los 6 partidos del Cuadrangular Final
 * con fechas futuras para testing del sistema de puntos.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../src/config/database';

// Equipos del cuadrangular final típico de la Liga BetPlay
const TEAMS = ['ANA', 'MIL', 'ACA', 'JUN']; // Nacional, Millonarios, América, Junior

// Partidos: cada equipo juega vs los otros 2 veces (casa y visita) → 12 partidos
// Formato simplificado: 6 partidos (todos vs todos, 1 vez)
const FIXTURES = [
  { home: 'ANA', away: 'MIL', days: 7  },  // Nacional vs Millonarios
  { home: 'ACA', away: 'JUN', days: 7  },  // América vs Junior
  { home: 'MIL', away: 'ACA', days: 14 },  // Millonarios vs América
  { home: 'JUN', away: 'ANA', days: 14 },  // Junior vs Nacional
  { home: 'ANA', away: 'ACA', days: 21 },  // Nacional vs América
  { home: 'JUN', away: 'MIL', days: 21 },  // Junior vs Millonarios
];

async function main() {
  console.log('🇨🇴 Seeding Cuadrangular Final Liga BetPlay...\n');

  // 1. Borrar partidos COL viejos (terminados)
  const oldMatches = await prisma.match.findMany({
    where: { competition: 'COL_LIGA' },
    select: { id: true, _count: { select: { predictions: true } } },
  });
  const totalPreds = oldMatches.reduce((s, m) => s + m._count.predictions, 0);
  if (totalPreds > 0) {
    console.log(`  Borrando ${totalPreds} predicciones sobre partidos COL anteriores...`);
    await prisma.prediction.deleteMany({ where: { matchId: { in: oldMatches.map(m => m.id) } } });
  }
  if (oldMatches.length > 0) {
    console.log(`  Borrando ${oldMatches.length} partidos COL anteriores...`);
    await prisma.match.deleteMany({ where: { id: { in: oldMatches.map(m => m.id) } } });
  }

  // 2. Obtener los teams del cuadrangular
  const teams = await prisma.team.findMany({
    where: { code: { in: TEAMS } },
    select: { id: true, code: true, name: true },
  });

  if (teams.length < TEAMS.length) {
    const found = teams.map(t => t.code);
    const missing = TEAMS.filter(c => !found.includes(c));
    console.error(`❌ Equipos no encontrados en DB: ${missing.join(', ')}`);
    console.error('   Ejecuta primero: npm run seed y luego el sync de Colombia');
    process.exit(1);
  }

  const teamMap = Object.fromEntries(teams.map(t => [t.code, t.id]));
  const now = new Date();

  // 3. Crear los 6 partidos del cuadrangular
  let created = 0;
  let fakeId = 800100; // rango para COL cuadrangular (fuera del rango WC 760000 y COL 1316000)

  for (const f of FIXTURES) {
    const matchDate = new Date(now);
    matchDate.setDate(matchDate.getDate() + f.days);
    matchDate.setUTCHours(22, 0, 0, 0); // 10pm UTC = 5pm Colombia

    await prisma.match.create({
      data: {
        apiFootballId: fakeId++,
        matchNumber:   fakeId,
        phase:         'GROUP_STAGE',
        round:         'Cuadrangular Final',
        competition:   'COL_LIGA',
        teamHomeId:    teamMap[f.home],
        teamAwayId:    teamMap[f.away],
        dateTime:      matchDate,
        timezone:      'America/Bogota',
        status:        'SCHEDULED',
        lastSyncAt:    new Date(),
      },
    });

    const homeTeam = teams.find(t => t.code === f.home)!;
    const awayTeam = teams.find(t => t.code === f.away)!;
    console.log(`  ✓ ${homeTeam.name} vs ${awayTeam.name} — en ${f.days} días`);
    created++;
  }

  console.log(`\n✅ Cuadrangular creado: ${created} partidos listos para predecir y testear`);
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('❌', e.message); process.exit(1); });
