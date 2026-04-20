#!/usr/bin/env node
/*
 * One-off user provisioning script. Run via Railway CLI:
 *
 *   railway run node server/create-user.js <email> <password> [role] [firstName] [lastName]
 *
 * role defaults to Admin. Existing users (matched by email, case-insensitive)
 * have their password, role, and status overwritten so the same command can be
 * used to reset credentials.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sql } = require('./db');

const BCRYPT_COST = 10;
const VALID_ROLES = ['Admin', 'Manager', 'Staff'];

function validatePasswordPolicy(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one digit';
  return null;
}

async function main() {
  const [, , email, password, roleArg, firstNameArg, lastNameArg] = process.argv;
  if (!email || !password) {
    console.error('Usage: node server/create-user.js <email> <password> [role] [firstName] [lastName]');
    process.exit(1);
  }

  const role = roleArg || 'Admin';
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Expected one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const policyErr = validatePasswordPolicy(password);
  if (policyErr) {
    console.error(`Password rejected: ${policyErr}`);
    process.exit(1);
  }

  const firstName = firstNameArg || 'User';
  const lastName = lastNameArg || '';
  const hash = await bcrypt.hash(password, BCRYPT_COST);

  const existingRows = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1`;
  if (existingRows.length > 0) {
    const id = existingRows[0].id;
    await sql.query(
      `UPDATE users
          SET first_name = $1, last_name = $2, role = $3,
              password = $4, status = 'Active', must_change_password = false,
              password_reset_token = NULL, password_reset_expires = NULL,
              updated_at = NOW()
        WHERE id = $5`,
      [firstName, lastName, role, hash, id],
    );
    console.log(`Updated existing user ${email} (id=${id}) — role=${role}, status=Active`);
    return;
  }

  const id = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await sql.query(
    `INSERT INTO users (id, first_name, last_name, email, role, password, status, must_change_password, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'Active', false, NOW(), NOW())`,
    [id, firstName, lastName, email, role, hash],
  );
  console.log(`Created user ${email} (id=${id}) — role=${role}, status=Active`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[create-user] failed:', err.message);
    process.exit(1);
  });
