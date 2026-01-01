const email = process.env.E2E_TEST_USER_EMAIL ?? 'test-procyon@cwchanap.dev';
const password = process.env.E2E_TEST_USER_PASSWORD ?? 'password123';
const username = process.env.E2E_TEST_USER_USERNAME ?? 'test-procyon';
const normalizeEnvValue = value => {
  if (!value) return value;
  return value.trim().replace(/^["']+|["']+$/g, '');
};

const url = normalizeEnvValue(process.env.SUPABASE_URL);
const serviceRoleKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

const isMissing = value => !value || value === 'null' || value === 'undefined';

if (isMissing(url) || isMissing(serviceRoleKey)) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or they are set to "null"/"undefined").'
  );
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

  const userExistsPattern =
    /(?:email|user with this email|user)(?:\s+\w+)*\s+already(?:\s+\w+)*\s+(?:registered|exists)|already(?:\s+\w+)*\s+(?:registered|exists)/i;
  if (userExistsPattern.test(message)) {
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
