import { getDB, initializeDB, schema } from './src/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { env } from './src/env';

async function migrateBetterAuthUsers() {
  // Initialize DB
  initializeDB();

  const db = getDB();

  console.log('Starting Better Auth to users table migration...');

  // Get all users from Better Auth table
  const betterAuthUsers = await db.select().from(schema.user).execute();

  console.log(`Found ${betterAuthUsers.length} users in Better Auth table`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const betterAuthUser of betterAuthUsers) {
    // Check if user already exists in new users table
    const existingUsers = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, betterAuthUser.email))
      .execute();

    if (existingUsers.length > 0) {
      console.log(`User ${betterAuthUser.email} already exists in users table, skipping`);
      skippedCount++;
      continue;
    }

    // Skip users without passwords (they might have used OAuth)
    if (!betterAuthUser.password) {
      console.log(`User ${betterAuthUser.email} has no password, skipping`);
      skippedCount++;
      continue;
    }

    // The password in Better Auth table should already be bcrypt-hashed since we configured it to use bcrypt
    // But let's verify it's a bcrypt hash (starts with $2b$ or $2a$)
    let passwordHash = betterAuthUser.password;
    if (!passwordHash.startsWith('$2a$') && !passwordHash.startsWith('$2b$')) {
      console.log(`User ${betterAuthUser.email} password doesn't look like bcrypt hash, re-hashing`);
      // If it's not bcrypt, hash it with bcrypt
      passwordHash = await bcrypt.hash(betterAuthUser.password, env.BCRYPT_SALT_ROUNDS);
    }

    // Create user in new table
    await db.insert(schema.users).values({
      email: betterAuthUser.email,
      username: betterAuthUser.username || betterAuthUser.name || betterAuthUser.email.split('@')[0],
      passwordHash,
    });

    console.log(`Migrated user ${betterAuthUser.email}`);
    migratedCount++;
  }

  console.log(`Migration complete: ${migratedCount} users migrated, ${skippedCount} users skipped`);

  // Optional: Clean up old tables after migration (uncomment when ready)
  // console.log('Cleaning up old Better Auth tables...');
  // await db.delete(schema.verification).execute();
  // await db.delete(schema.account).execute();
  // await db.delete(schema.session).execute();
  // await db.delete(schema.user).execute();
  // console.log('Old tables cleaned up');
}

// Run if this file is executed directly
if (import.meta.main) {
  migrateBetterAuthUsers().catch(console.error);
}
