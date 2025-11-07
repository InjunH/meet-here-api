/**
 * @fileoverview 데이터베이스 마이그레이션 실행 스크립트
 * Drizzle ORM 마이그레이션 파일을 PostgreSQL에 적용
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from 'dotenv';

// 환경 변수 로드
config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not defined in .env file');
  process.exit(1);
}

async function runMigration() {
  console.log('🔄 Starting database migration...');
  console.log(`📍 Database: ${DATABASE_URL.replace(/:[^:]*@/, ':****@')}`);

  // 마이그레이션용 connection (max 1)
  const migrationClient = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    console.log('📂 Reading migration files from ./drizzle');

    await migrate(db, { migrationsFolder: './drizzle' });

    console.log('✅ Migration completed successfully!');

    // 테이블 확인
    console.log('\n📊 Checking created tables...');
    const result = await migrationClient`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;

    console.log('Created tables:');
    result.forEach((row: any) => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ Migration failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await migrationClient.end();
    console.log('\n🔌 Database connection closed');
  }
}

runMigration();
