import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testApi() {
  console.log('🔍 Consultando fixtures del Mundial 2026...\n');

  try {
    const response = await axios.get('https://v3.football.api-sports.io/fixtures', {
      headers: {
        'x-apisports-key': process.env.API_FOOTBALL_KEY!,
        'x-apisports-host': 'v3.football.api-sports.io',
      },
      params: {
        league: process.env.WORLD_CUP_LEAGUE_ID,
        season: process.env.WORLD_CUP_SEASON,
      },
    });

    const fixtures = response.data.response;
    console.log(`✅ API respondió correctamente`);
    console.log(`📊 Total fixtures encontrados: ${fixtures.length}\n`);

    if (fixtures.length === 0) {
      console.log('⚠️  Aún no hay fixtures cargados para el Mundial 2026');
      return;
    }

    // Group by round
    const byRound: Record<string, any[]> = {};
    fixtures.forEach((f: any) => {
      const round = f.league.round;
      if (!byRound[round]) byRound[round] = [];
      byRound[round].push(f);
    });

    console.log('📅 Partidos por fase:\n');
    Object.entries(byRound).forEach(([round, matches]) => {
      console.log(`  ${round}: ${matches.length} partidos`);
    });

    console.log('\n⚽ Primeros 5 partidos:');
    fixtures.slice(0, 5).forEach((f: any) => {
      const date = new Date(f.fixture.date).toLocaleDateString('es-ES');
      console.log(`  ${date} | ${f.teams.home.name} vs ${f.teams.away.name} | ${f.fixture.status.short}`);
    });

    // Check remaining API calls
    const remaining = response.headers['x-ratelimit-requests-remaining'];
    console.log(`\n📈 Requests restantes hoy: ${remaining}`);

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testApi();
