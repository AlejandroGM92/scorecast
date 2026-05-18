import * as dotenv from 'dotenv';
dotenv.config();

import { syncWorldCupScores } from '../src/services/wcSync.service';

syncWorldCupScores()
  .then((r) => {
    console.log('\n✅ Resultado del sync Mundial:');
    console.log(`  Actualizados:    ${r.matchesUpdated}`);
    console.log(`  No encontrados:  ${r.matchesNotFound}`);
    console.log(`  Pts calculados:  ${r.pointsCalculated}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
  });
