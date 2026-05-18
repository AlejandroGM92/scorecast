import * as dotenv from 'dotenv';
dotenv.config();
import { syncColombiaAllEspn } from '../src/services/colEspnSync.service';

syncColombiaAllEspn()
  .then(r => {
    console.log('\n✅ Resultado:');
    console.log('  Actualizados:   ', r.updated);
    console.log('  No encontrados: ', r.notFound);
    console.log('  Pts calculados: ', r.pointsCalculated);
    process.exit(0);
  })
  .catch(e => { console.error('❌', e.message); process.exit(1); });
