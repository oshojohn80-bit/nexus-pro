import { GoogleAuth } from 'google-auth-library';

const ANDROID_MANAGEMENT_SCOPE =
  'https://www.googleapis.com/auth/androidmanagement';

function getCredentials() {
  const raw = process.env.ANDROID_ENTERPRISE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error('Android Enterprise service account credentials are not configured.');
  }

  const credentials = JSON.parse(raw);

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Service account credentials are incomplete.');
  }

  return credentials;
}

export function getIntegrationStatus() {
  const configured = Boolean(
    process.env.ANDROID_ENTERPRISE_PROJECT_ID &&
    process.env.ANDROID_ENTERPRISE_SERVICE_ACCOUNT_JSON
  );

  return {
    configured,
    mode: configured ? 'CREDENTIALS_CONFIGURED' : 'NOT_CONNECTED',
    project_id: process.env.ANDROID_ENTERPRISE_PROJECT_ID || null,
    note: configured
      ? 'Credentials are configured. Enterprise authorization and API access still need verification.'
      : 'Google Android Management API credentials are incomplete.'
  };
}

export async function getAndroidManagementAuthClient() {
  const auth = new GoogleAuth({
    credentials: getCredentials(),
    scopes: [ANDROID_MANAGEMENT_SCOPE]
  });

  return auth.getClient();
}

export async function getAndroidManagementAccessToken() {
  const client = await getAndroidManagementAuthClient();
  const token = await client.getAccessToken();

  if (!token.token) {
    throw new Error('Unable to obtain Google access token.');
  }

  return token.token;
}
