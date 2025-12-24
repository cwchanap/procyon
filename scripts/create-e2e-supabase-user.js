const email = process.env.E2E_TEST_USER_EMAIL ?? 'test-procyon@cwchanap.dev';
const password = process.env.E2E_TEST_USER_PASSWORD ?? 'password123';
const username = process.env.E2E_TEST_USER_USERNAME ?? 'test-procyon';
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

async function createUser() {
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    }),
  });

  const bodyText = await response.text();
  if (response.ok) {
    console.log('created');
    return;
  }

  let message = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    message = parsed.msg || parsed.message || parsed.error || message;
  } catch {
    // ignore parse errors
  }

  if (/already (registered|exists)|user already exists/i.test(message)) {
    console.log('exists');
    return;
  }

  console.error(`create failed: ${response.status} ${message}`);
  process.exit(1);
}

createUser().catch(error => {
  console.error('create failed:', error?.message || error);
  process.exit(1);
});
