# "Continua con Google" — attivazione (18/11/2026)

The app and the web shop show the button only when the Google provider is on in Supabase. Nothing secret goes in
the repository: the Client secret is pasted only in the Supabase dashboard.

1. **Google Cloud Console** → APIs & Services → OAuth consent screen: app name "CASA & TE", support email, logo
   optional, scopes `email`, `profile`, `openid`. Publish the app (until then only test users can sign in).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI: `https://kejjinbapxnjbceirrtv.supabase.co/auth/v1/callback`
   (for production, the production project's URL + `/auth/v1/callback`).
3. **Supabase → Authentication → Providers → Google**: enable, paste Client ID and Client secret, save.
4. **Supabase → Authentication → URL Configuration → Redirect URLs**: add `casate://auth/callback` (phone app) and
   the shop's addresses (`https://www.casaete.top/**`, the preview `https://design-lime.casate-shop.pages.dev/**`).
5. Open the sign-in page: "Continua con Google" appears. iOS later: Apple requires "Sign in with Apple" too.

Legal: new customers coming from Google accept the terms through the line under the button
("Continuando accetti le Condizioni…"), not through the checkbox of the email sign-up — to be confirmed by the lawyer.
