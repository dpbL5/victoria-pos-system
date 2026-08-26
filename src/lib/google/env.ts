// ── Cấu hình Google OAuth2 — server-side env ─────
export function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  return {
    clientId: clientId || '',
    clientSecret: clientSecret || '',
    redirectUri: `${appUrl || 'http://localhost:3000'}/api/google/callback`,
    isConfigured: Boolean(clientId && clientSecret && appUrl),
  }
}
