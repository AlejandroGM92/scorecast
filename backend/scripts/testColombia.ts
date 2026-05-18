import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const client = axios.create({
  baseURL: 'https://v3.football.api-sports.io',
  headers: {
    'x-apisports-key': process.env.API_FOOTBALL_KEY!,
    'x-apisports-host': 'v3.football.api-sports.io',
  },
  timeout: 10000,
});

async function test() {
  const LEAGUE_ID = 239;   // Liga BetPlay Colombia V3
  const SEASON   = 2025;

  console.log('\n🇨🇴 Testing API-Football — Liga BetPlay Colombia\n');

  // ── 1. Check account status ──────────────────────────────────────────────
  const status = await client.get('/status');
  const acc = status.data.response?.account;
  const sub = status.data.response?.subscription;
  console.log(`Account : ${acc?.firstname} ${acc?.lastname}`);
  console.log(`Plan    : ${sub?.plan}`);
  console.log(`Requests: ${status.data.response?.requests?.current} / ${status.data.response?.requests?.limit_day} hoy\n`);

  // ── 2. Live matches for the league ───────────────────────────────────────
  console.log('📡 Buscando partidos EN VIVO...');
  const liveRes = await client.get('/fixtures', {
    params: { league: LEAGUE_ID, live: 'all' },
  });

  const liveMatches = liveRes.data.response;

  if (liveMatches.length === 0) {
    console.log('ℹ️  No hay partidos en vivo en este momento.\n');
    console.log('📅 Buscando partidos de hoy...');

    const today = new Date().toISOString().split('T')[0];
    const todayRes = await client.get('/fixtures', {
      params: { league: LEAGUE_ID, season: SEASON, date: today },
    });

    const todayMatches = todayRes.data.response;

    if (todayMatches.length === 0) {
      console.log('ℹ️  No hay partidos hoy tampoco. Buscando los próximos...\n');

      const nextRes = await client.get('/fixtures', {
        params: { league: LEAGUE_ID, season: SEASON, next: 5 },
      });

      printMatches(nextRes.data.response, 'PRÓXIMOS PARTIDOS');
    } else {
      printMatches(todayMatches, 'PARTIDOS DE HOY');
    }
  } else {
    printMatches(liveMatches, 'PARTIDOS EN VIVO');

    // ── 3. Goal scorers for each live match ──────────────────────────────
    for (const m of liveMatches) {
      const fixtureId = m.fixture.id;
      console.log(`\n⚽ Eventos — ${m.teams.home.name} vs ${m.teams.away.name}`);

      const eventsRes = await client.get('/fixtures/events', {
        params: { fixture: fixtureId },
      });

      const events = eventsRes.data.response;
      const goals = events.filter((e: any) => e.type === 'Goal');

      if (goals.length === 0) {
        console.log('  Sin goles registrados aún.');
      } else {
        for (const g of goals) {
          const team = g.team.name;
          const scorer = g.player.name;
          const assist = g.assist?.name ? ` (asist. ${g.assist.name})` : '';
          const min = g.time.elapsed + (g.time.extra ? `+${g.time.extra}` : '');
          const icon = g.detail === 'Penalty' ? '⚽🟡' : g.detail === 'Own Goal' ? '⚽🔴' : '⚽';
          console.log(`  ${icon} ${min}' — ${scorer}${assist} (${team})`);
        }
      }
    }
  }

  // ── 4. Flag check ────────────────────────────────────────────────────────
  console.log('\n🏳️ URLs de banderas (primeros 2 equipos):');
  const sample = liveMatches.length > 0 ? liveMatches : [];
  if (sample.length > 0) {
    const m = sample[0];
    console.log(`  ${m.teams.home.name}: ${m.teams.home.logo}`);
    console.log(`  ${m.teams.away.name}: ${m.teams.away.logo}`);
  }

  console.log('\n✅ Test completado.\n');
}

function printMatches(matches: any[], label: string) {
  console.log(`\n── ${label} (${matches.length}) ──`);
  for (const m of matches) {
    const status = m.fixture.status.long;
    const min    = m.fixture.status.elapsed ? ` ${m.fixture.status.elapsed}'` : '';
    const home   = m.teams.home.name;
    const away   = m.teams.away.name;
    const gH     = m.goals.home ?? '-';
    const gA     = m.goals.away ?? '-';
    const date   = new Date(m.fixture.date).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });
    console.log(`  [${m.fixture.id}] ${home} ${gH}–${gA} ${away}  |  ${status}${min}  |  ${date}`);
    console.log(`         🏟 ${m.fixture.venue.name}, ${m.fixture.venue.city}`);
    console.log(`         🏳 Home logo: ${m.teams.home.logo}`);
    console.log(`         🏳 Away logo: ${m.teams.away.logo}`);
  }
}

test().catch((err) => {
  console.error('❌ Error:', err.response?.data || err.message);
  process.exit(1);
});
