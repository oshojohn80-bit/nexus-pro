import { GoogleAuth } from 'google-auth-library';

const GOOGLE_CLOUD_SCOPE =
  'https://www.googleapis.com/auth/cloud-platform';

export function getIntegrationStatus() {
  const configured = Boolean(
    process.env.GCP_WORKLOAD_IDENTITY_PROVIDER
  );

  return {
    configured,
    mode: configured ? 'WIF_CONFIGURED' : 'NOT_CONNECTED',
    project_id: process.env.ANDROID_ENTERPRISE_PROJECT_ID || null,
    note: configured
      ? 'Workload Identity Federation is configured. Google authorization must still be verified.'
      : 'Waiting for Render Workload Identity Federation configuration.'
  };
}

export async function getAndroidManagementAuthClient() {
  const auth = new GoogleAuth({
    scopes: [GOOGLE_CLOUD_SCOPE]
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
