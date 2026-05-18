import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const championOdds: Record<string, number> = {
  ESP: 5.4,
  FRA: 6.0,
  ENG: 7.0,
  ARG: 9.0,
  BRA: 9.0,
  GER: 13.0,
  POR: 13.0,
  NED: 19.0,
  NOR: 26.0,
  BEL: 34.0,
  COL: 41.0,
  USA: 51.0,
  MAR: 51.0,
  JPN: 67.0,
  SUI: 67.0,
  CRO: 81.0,
  MEX: 81.0,
  URU: 81.0,
  ECU: 101.0,
  SEN: 101.0,
  SWE: 101.0,
  TUR: 101.0,
  AUT: 101.0,
  CAN: 101.0,
  PAR: 151.0,
  BIH: 151.0,
  SCO: 151.0,
  CIV: 251.0,
  EGY: 251.0,
  CZE: 301.0,
  ALG: 301.0,
  GHA: 301.0,
  AUS: 401.0,
  KOR: 401.0,
  IRN: 501.0,
  TUN: 501.0,
  COD: 501.0,
  KSA: 501.0,
  QAT: 751.0,
  RSA: 1001.0,
  IRQ: 1001.0,
  NZL: 1001.0,
  PAN: 1501.0,
  CPV: 1501.0,
  CUW: 1501.0,
  UZB: 2001.0,
  JOR: 2001.0,
  HAI: 2501.0,
};

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create admin user and its own token in a specific order
  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@scorecast.app',
      passwordHash,
      role: 'ADMIN',
    },
  });

  const adminToken = await prisma.invitationToken.create({
    data: {
      code: 'SC26-ADMIN',
      maxUses: 1,
      description: 'Admin token',
      createdById: admin.id,
    },
  });

  // Update admin with token
  await prisma.user.update({
    where: { id: admin.id },
    data: { invitationTokenId: adminToken.id },
  });

  console.log('✅ Admin user created');

  // 2. Create sample invitation tokens
  await prisma.invitationToken.createMany({
    data: [
      {
        code: 'SC26-DEMO1',
        maxUses: 10,
        description: 'Demo token (10 uses)',
        createdById: admin.id,
      },
      {
        code: 'SC26-DEMO2',
        maxUses: 5,
        expiresAt: new Date('2026-08-01'),
        description: 'Demo token (5 uses, expires Aug 1)',
        createdById: admin.id,
      },
      {
        code: 'SC26-OPEN',
        maxUses: -1,
        description: 'Open token (unlimited)',
        createdById: admin.id,
      },
    ],
  });

  console.log('✅ Invitation tokens created');

  // 3. System configuration
  await prisma.systemConfig.createMany({
    data: [
      { key: 'tournament_started', value: 'false', description: 'Has the tournament started?' },
      { key: 'current_phase', value: 'GROUP_STAGE', description: 'Current tournament phase' },
      { key: 'auto_sync_enabled', value: 'true', description: 'Auto-sync with API enabled' },
      { key: 'prediction_deadline_minutes', value: '20', description: 'Minutes before match to close predictions' },
      { key: 'champion_locked', value: 'false', description: 'Champion prediction locked' },
    ],
  });

  console.log('✅ System configuration created');

  console.log('\n🎉 Seeding completed!');
  console.log('\n🔑 Login credentials:');
  console.log('   Email: admin@scorecast.app');
  console.log('   Password: admin123');
  console.log('\n🎫 Invitation tokens:');
  console.log('   SC26-ADMIN (1 use)');
  console.log('   SC26-DEMO1 (10 uses)');
  console.log('   SC26-DEMO2 (5 uses, expires Aug 1)');
  console.log('   SC26-OPEN (unlimited)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
