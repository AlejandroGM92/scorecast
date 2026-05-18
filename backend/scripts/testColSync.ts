import * as dotenv from 'dotenv';
dotenv.config();

import { syncColombiaFixtures } from '../src/services/colSync.service';

syncColombiaFixtures()
  .then((r) => {
    console.log('\n✅ Resultado del sync:');
    console.log(`  Equipos:   ${r.teamsUpserted}`);
    console.log(`  Creados:   ${r.matchesCreated}`);
    console.log(`  Actualizados: ${r.matchesUpdated}`);
    console.log(`  Pts calculados: ${r.pointsCalculated}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
  });
