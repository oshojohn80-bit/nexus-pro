/**
 * Integration boundary for Google Android Management API.
 * Implement only after the Google Cloud project, API access, enterprise binding,
 * service-account permissions, and production eligibility are confirmed.
 * Do not simulate live enrollment or telemetry in this adapter.
 */
export function getIntegrationStatus() {
  return {
    configured: Boolean(process.env.ANDROID_ENTERPRISE_PROJECT_ID &&
      process.env.ANDROID_ENTERPRISE_SERVICE_ACCOUNT_JSON),
    mode: 'NOT_CONNECTED',
    note: 'Android Management API adapter requires approved Google Cloud configuration.'
  };
}
