const normalizeEnvValue = value => {
  if (!value) return value;
  return value.trim().replace(/^["']+|["']+$/g, '');
};

const email =
  normalizeEnvValue(process.env.E2E_TEST_USER_EMAIL) ??
  'test-procyon@cwchanap.dev';
const password =
  normalizeEnvValue(process.env.E2E_TEST_USER_PASSWORD) ?? 'password123';
const username =
  normalizeEnvValue(process.env.E2E_TEST_USER_USERNAME) ?? 'test-procyon';

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
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
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
    const updated = await updateExistingUser(headers);
    if (updated) {
      console.log('updated');
      return;
    }
    console.log('exists');
    return;
  }

  console.error(`create failed: ${response.status} ${message}`);
  process.exit(1);
}

async function updateExistingUser(headers) {
  const listResponse = await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
    headers,
  });

  if (!listResponse.ok) {
    return false;
  }

  const listBody = await listResponse.json().catch(() => null);
  const users = listBody?.users ?? [];
  const existingUser = users.find(
    user => user?.email?.toLowerCase() === email.toLowerCase()
  );
  if (!existingUser?.id) {
    return false;
  }

  const updateResponse = await fetch(
    `${url}/auth/v1/admin/users/${existingUser.id}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { username },
      }),
    }
  );

  return updateResponse.ok;
}

createUser().catch(error => {
  console.error('create failed:', error?.message || error);
  process.exit(1);
});
