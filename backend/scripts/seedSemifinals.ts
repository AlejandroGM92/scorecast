/**
 * seedSemifinals.ts
 * 1. Marca los 20 partidos COL viejos como COL_LIGA (ya no aparecen en dashboard)
 * 2. Borra el cuadrangular mal sembrado
 * 3. Crea los 4 partidos reales de la semifinal 2026
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../src/config/database';

async function main() {
  console.log('🇨🇴 Configurando semifinales Liga BetPlay 2026...\n');

  // 1. Reclasificar los 20 partidos colombianos viejos como COL_LIGA
  const fixed = await prisma.match.updateMany({
    where: { competition: 'WORLD_CUP', apiFootballId: { gte: 1300000 } },
    data: { competition: 'COL_LIGA' },
  });
  console.log(`  ✓ ${fixed.count} partidos viejos reclasificados como COL_LIGA`);

  // 2. Borrar el cuadrangular mal sembrado (IDs 800100-800200)
  const oldPreds = await prisma.prediction.deleteMany({
    where: { match: { competition: 'COL_LIGA', apiFootballId: { gte: 800100, lte: 800200 } } },
  });
  const oldMatches = await prisma.match.deleteMany({
    where: { competition: 'COL_LIGA', apiFootballId: { gte: 800100, lte: 800200 } },
  });
  console.log(`  ✓ ${oldMatches.count} partidos del cuadrangular incorrecto borrados (${oldPreds.count} predicciones)`);

  // 3. Obtener equipos
  const teams = await prisma.team.findMany({
    where: { code: { in: ['SFE', 'JUN', 'DTO', 'ANA'] } },
    select: { id: true, code: true, name: true },
  });
  const t = Object.fromEntries(teams.map(t => [t.code, t]));

  const missing = ['SFE', 'JUN', 'DTO', 'ANA'].filter(c => !t[c]);
  if (missing.length) {
    console.error(`❌ Equipos no encontrados: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 4. Crear los 4 partidos de la semifinal real
  // Colombia = UTC-5. Horarios en UTC.
  const semifinales = [
    {
      id: 800201,
      home: 'SFE', away: 'JUN',
      // Partido de hoy ya terminado: Santa Fe 1-1 Junior
      dateTime: new Date('2026-05-16T20:00:00Z'),
      scoreHome: 1, scoreAway: 1,
      status: 'FINISHED' as const,
      pointsCalculated: false,
    },
    {
      id: 800202,
      home: 'DTO', away: 'ANA',
      // Partido de hoy ya terminado: Tolima 0-1 Nacional
      dateTime: new Date('2026-05-16T22:30:00Z'),
      scoreHome: 0, scoreAway: 1,
      status: 'FINISHED' as const,
      pointsCalculated: false,
    },
    {
      id: 800203,
      home: 'ANA', away: 'DTO',
      // Sáb 23/5 6:00 PM COL = 23:00 UTC
      dateTime: new Date('2026-05-23T23:00:00Z'),
      scoreHome: null, scoreAway: null,
      status: 'SCHEDULED' as const,
      pointsCalculated: false,
    },
    {
      id: 800204,
      home: 'JUN', away: 'SFE',
      // Sáb 23/5 8:30 PM COL = 01:30 UTC siguiente día
      dateTime: new Date('2026-05-24T01:30:00Z'),
      scoreHome: null, scoreAway: null,
      status: 'SCHEDULED' as const,
      pointsCalculated: false,
    },
  ];

  let created = 0;
  for (const f of semifinales) {
    // Evitar duplicados
    const existing = await prisma.match.findUnique({ where: { apiFootballId: f.id } });
    if (existing) {
      await prisma.match.update({
        where: { id: existing.id },
        data: { status: f.status, scoreHome: f.scoreHome, scoreAway: f.scoreAway, pointsCalculated: f.pointsCalculated },
      });
      console.log(`  ~ Actualizado: ${t[f.home].name} vs ${t[f.away].name}`);
    } else {
      await prisma.match.create({
        data: {
          apiFootballId: f.id,
          matchNumber: f.id,
          phase: 'SEMI_FINALS',
          round: 'Semifinal',
          competition: 'COL_LIGA',
          teamHomeId: t[f.home].id,
          teamAwayId: t[f.away].id,
          dateTime: f.dateTime,
          timezone: 'America/Bogota',
          status: f.status,
          scoreHome: f.scoreHome,
          scoreAway: f.scoreAway,
          pointsCalculated: f.pointsCalculated,
          lastSyncAt: new Date(),
        },
      });
      console.log(`  ✓ Creado: ${t[f.home].name} vs ${t[f.away].name} [${f.status}]`);
      created++;
    }
  }

  console.log(`\n✅ Listo: ${created} partidos de semifinal creados`);
  console.log('   Los partidos de hoy están FINISHED con sus marcadores reales.');
  console.log('   Los del sábado están SCHEDULED para que los usuarios predigan.');
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('❌', e.message); process.exit(1); });
