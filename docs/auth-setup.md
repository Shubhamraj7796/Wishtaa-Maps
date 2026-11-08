# Accounts: how they work, and the dashboard steps for you

Accounts are **optional**. Without any of the settings below the app deploys and works exactly as before, as a guest
(no Sign in button appears). Turning accounts on adds sign-in, sync of small records, and Google Drive linking. It never removes a
feature and never blocks opening local files.

## What is stored where

| Where | What |
| --- | --- |
| **Supabase** (your project) | The sign-in itself, a profile (display name), preferences (a few plain choices such as theme), a list of recent files (name, id, date, "browser" or "Drive", the Drive file id), and which Google account is linked for Drive. |
| **Your Google Drive** | The maps and their pictures (as now). |
| **This browser** | Guest files, the cached copy of Drive maps, and the sign-in (see "Security notes"). |

Map content and pictures are **never** sent to Supabase. Tables: `profiles`, `user_preferences`, `recent_files`, `drive_links`
(`supabase/migrations/0003_accounts.sql`). Every table is owner-only (row-level security), tested in `src/core/auth/rls.test.ts`
against a real Postgres engine.

Sign-in methods (all lead to the **same account for the same verified email**): an emailed 6-digit code, email and password
(with confirmation and "Forgot password"), and Google.

See `docs/drive-sign-in.md` for how Google sign-in and Google Drive fit together, how access is kept alive, and what would need a server.

---

## Part A. Supabase (do these in order)

Numbers match what the app expects. Menu names can differ slightly between Supabase dashboard versions; the setting names are the same.

### 1. Check the project is healthy (it showed "Unhealthy" before)

I could not check this for you: this repository has no Supabase project address or keys in its local `.env` (only Google values), and the
dashboard is yours.

1. Open <https://supabase.com/dashboard> and click your project.
2. Look at the status next to the project name.
   - **Paused**: click **Restore project** and wait a few minutes.
   - **Unhealthy** (or services showing red): go to **Project Settings, General** and click **Restart project**. Wait 5 minutes and reload.
   - Still unhealthy: open **Reports, Database** and **Logs, Postgres** and look for errors (a full disk or a stuck migration are common). If you cannot see why, click **Support** in the dashboard and send them the project reference.
3. Do not continue until the status is **Healthy**.

### 2. Run the database migration

1. Left menu **SQL Editor**, then **New query**.
2. Open `supabase/migrations/0003_accounts.sql` from this repository, copy everything, paste it, click **Run**. It should say "Success. No rows returned".
3. Check: **Table Editor** shows `profiles`, `user_preferences`, `recent_files`, `drive_links`, each with a green "RLS enabled" mark.
4. Check: **Authentication, Policies** lists four policies on each of the three data tables.

`0001_schema.sql` and `0002_rls.sql` are an older plan for storing maps in Supabase. **Do not run them**: accounts do not need them, and
map content is meant to stay in Drive or the browser. If you already ran them, they do no harm.

### 3. Switch on email sign-in (code and password)

1. **Authentication, Sign In / Providers** (older dashboards: **Authentication, Providers**).
2. Under **Email**: turn **Enable Email provider** ON, **Confirm email** ON, **Secure email change** ON.
3. **Minimum password length**: `10`. **Password requirements**: lower case, upper case and digits. (The app shows the same rules.)
4. **Email OTP expiration**: `600` (seconds, 10 minutes). **Email OTP length**: `6`.
5. Under **User Signups**: **Allow new users to sign up** ON, **Allow anonymous sign-ins** OFF.
6. Same page, **Allow manual linking** ON. This is needed for "Link Google" and "Remove" on the Account page.
7. Click **Save**.

### 4. Switch on Google sign-in

1. Same page, open **Google**, turn **Enable Sign in with Google** ON.
2. Paste the **Client ID** and **Client secret** of the same OAuth client used for Drive (Part B, step 1 shows where to find the secret).
3. Leave **Skip nonce checks** OFF. Copy the **Callback URL (for OAuth)** shown, it looks like `https://<project-ref>.supabase.co/auth/v1/callback`. You need it in Part B.
4. **Save**.

### 5. Site address and allowed return addresses

1. **Authentication, URL Configuration**.
2. **Site URL**: `https://maps.wishtaa.com`
3. **Redirect URLs**, click **Add URL** for each:
   - `https://maps.wishtaa.com/**`
   - `http://localhost:5181/**`
   - (optional, for Vercel previews) `https://*-<your-vercel-team>.vercel.app/**`
4. **Save**. Anything not listed is refused, which is what stops a stranger's page receiving a sign-in link.

### 6. Email wording (the code email)

New people get the **Confirm signup** email; returning people get **Magic Link**. Both must show the code.

1. **Authentication, Email Templates**.
2. **Magic Link**: Subject `Your Wishtaa Maps sign-in code`. Body:

   ```html
   <h2>Your sign-in code</h2>
   <p>Enter this code in Wishtaa Maps:</p>
   <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
   <p>It works once and expires in 10 minutes. If you did not ask for it, you can ignore this email.</p>
   ```

3. **Confirm signup**: Subject `Welcome to Wishtaa Maps`. Body:

   ```html
   <h2>Welcome to Wishtaa Maps</h2>
   <p>Your sign-in code is:</p>
   <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
   <p>Or confirm your email by opening this link: <a href="{{ .ConfirmationURL }}">Confirm my email</a></p>
   <p>If you did not create an account, you can ignore this email.</p>
   ```

4. **Reset Password**: Subject `Reset your Wishtaa Maps password`. Body:

   ```html
   <h2>Reset your password</h2>
   <p><a href="{{ .ConfirmationURL }}">Choose a new password</a>. The link works once and expires soon.</p>
   <p>If you did not ask for this, you can ignore this email.</p>
   ```

5. Click **Save** on each.

### 7. Your own email sender (custom SMTP)

**Why:** Supabase's built-in mailer is for trying things out. It sends only a handful of emails per hour, may only deliver to your own
team's addresses, and the "from" address is theirs, so codes arrive late or in spam. Real users need your own sender.

1. Create a mailbox/sender `no-reply@wishtaa.com` with an email service. Good choices: **Resend** (free tier, simplest), **Postmark**, **Brevo**, **Amazon SES**.
2. In that service add the domain `wishtaa.com` and publish the DNS records it shows (SPF, DKIM and a DMARC record). Wait until it says **Verified**.
3. Supabase: **Authentication, Emails, SMTP Settings** (older: **Project Settings, Authentication, SMTP Settings**), turn **Enable Custom SMTP** ON.
4. **Sender email** `no-reply@wishtaa.com`, **Sender name** `Wishtaa Maps`, then host, port, username and password from your email service. **Save**.
5. Send yourself a test by signing in with an emailed code.

### 8. Rate limits

1. **Authentication, Rate Limits**.
2. Suggested start: emails sent per hour `30` (raise as you grow), sign-ups and sign-ins per 5 minutes per IP `30`, OTP/magic-link verifications per 5 minutes per IP `30`, token refreshes per 5 minutes per IP `150`.
3. **Save**. The app also makes people wait 30 seconds between code requests for the same address.

### 9. Session safety

1. **Authentication, Sessions** (some plans) and **Authentication, Settings**: turn ON **Detect and revoke potentially compromised refresh tokens**. Keep the **JWT expiry** at the default `3600` seconds.

### 10. CAPTCHA (Cloudflare Turnstile, free)

Do these **in this order**. If you switch CAPTCHA on in Supabase before the site key is deployed, nobody can sign in.

1. <https://dash.cloudflare.com/>, **Turnstile**, **Add widget**. Name `Wishtaa Maps`. Hostnames: `maps.wishtaa.com` and `localhost`. Widget mode **Managed**. Create.
2. Copy the **Site key** (public) and **Secret key** (private).
3. Put the **Site key** in Vercel as `VITE_TURNSTILE_SITE_KEY` (Part C) and **redeploy**.
4. Only then, in Supabase: **Authentication, Attack Protection**, **Enable CAPTCHA protection** ON, provider **Cloudflare Turnstile**, paste the **Secret key**, **Save**.
5. Test sign-in on the live site. If it fails, switch CAPTCHA protection OFF again and check the site key.

---

## Part B. Google Cloud

You already have an OAuth client for Drive (`docs/google-drive-setup.md`). The same client is used for both sign-in and Drive.

### 1. Allow Supabase to receive the Google sign-in

1. <https://console.cloud.google.com/>, pick the Wishtaa project, **APIs & Services, Credentials**.
2. Open your **OAuth 2.0 Client ID** (Web application). Here you can also copy the **Client ID** and **Client secret** for Supabase Part A step 4.
3. **Authorized JavaScript origins**: keep `https://maps.wishtaa.com`, `http://localhost:5181` (and any others already there).
4. **Authorized redirect URIs**: **Add URI**, paste the Supabase **Callback URL** from Part A step 4 (`https://<project-ref>.supabase.co/auth/v1/callback`). **Save**. It can take a few minutes to apply.

### 2. Scopes (keep these only)

1. **Google Auth platform** (older: **OAuth consent screen**), **Data Access**, **Add or remove scopes**.
2. Keep exactly: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, and `.../auth/drive.file`. Remove anything else.

### 3. Publish the consent screen

While it says **Testing**, only the test users you list can sign in. To open it to everyone:

1. **Branding**: App name `Wishtaa Maps`, user support email, app logo (optional), **Application home page** `https://maps.wishtaa.com`, **Privacy policy link** `https://maps.wishtaa.com/privacy`, **Terms of service link** `https://maps.wishtaa.com/terms` (these pages are step 3 of the build, after your "go"), **Authorized domains** `wishtaa.com`, developer contact email.
2. Google asks you to prove you own `wishtaa.com`: open <https://search.google.com/search-console>, add the property `wishtaa.com`, and verify it with a DNS record.
3. **Audience**: **User type External**, then **Publish app** and confirm **In production**.
4. With only these scopes (none are "sensitive" or "restricted") Google does not need to review the app before it is public. Adding a logo triggers a short branding check.

---

## Part C. Vercel

1. <https://vercel.com/>, open the project, **Settings, Environment Variables**.
2. Add each of these for **Production, Preview and Development**:
   - `VITE_SUPABASE_URL` = Supabase **Project Settings, API, Project URL**
   - `VITE_SUPABASE_ANON_KEY` = Supabase **Project Settings, API, anon public** key (the long `eyJ…` one that says *anon*)
   - `VITE_TURNSTILE_SITE_KEY` = the Turnstile **Site key** (part A step 10)
3. **Never** add the `service_role` key as a `VITE_` variable. It is not used by the app.
4. **Deployments**, the latest one, **⋯, Redeploy**, untick "Use existing Build Cache". The Sign in button appears once the first two are present.

## Part D. Local development

Put the same `VITE_…` values in `.env` (never commit it) and run `npm run dev -- --port 5181`.

---

## Test it

1. Reload the site: a **Sign in** button appears top right.
2. **Email code**: enter your address, **Continue**, type the 6 digits from the email.
3. **Google**: **Sign in with Google**, pick the account, you return signed in.
4. **Password**: **Use a password instead**, **Create an account**, open the confirmation email, sign in. Then **Forgot password?** and reset it.
5. **Same account**: sign in with a code, then with Google using the same address. **Account** should list both methods, and Supabase **Authentication, Users** should show **one** user.
6. Turn the network off: the app keeps working; turn it on: nothing is lost.

## Security notes (read once)

- **Where the sign-in is kept.** Supabase's browser library stores the session in this browser's `localStorage`. A web page cannot hold a sign-in in an unreadable (HttpOnly) cookie without a server, so a script running inside the page (XSS) could read it. Mitigations in place: the access token lives 1 hour; refresh tokens rotate and a reused one revokes the session; the app shows no HTML from untrusted sources without sanitising it; the service worker never reads or stores sign-in traffic; **Sign out of all devices** ends every session. Recommended next: a Content-Security-Policy header (not added yet because it needs testing against pdf.js, OCR and Google's scripts).
- **Public values.** The anon key is public by design. Only row-level security protects data, and every table is owner-only (tested).
- **PKCE.** Sign-in with Google uses the PKCE flow with a per-browser secret and state, so a stolen redirect cannot be redeemed elsewhere.
- **Shared computers.** Files saved as "This browser" belong to the browser profile, not to an account. Anyone using the same browser profile can see them. Use separate browser profiles for separate people. Signing out removes the Google Drive access and the cached Drive list; guest files stay.
- **CAPTCHA** protects sign-up and code requests from bots. The app waits 30 seconds between code requests per address.

## Restricting sign-ups to some email domains later

Any valid email may sign up today. To restrict: in `0003_accounts.sql` the last block (commented) adds an `allowed_email_domains` table and a
trigger. Uncomment it, run it in the SQL Editor, then `insert into public.allowed_email_domains values ('example.com');`. While the table is
empty everything is allowed. To switch back to "anyone", `delete from public.allowed_email_domains;`.

## Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| No Sign in button | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing in Vercel, or no redeploy after adding them. |
| "redirect_uri_mismatch" from Google | The Supabase callback URL is not in the OAuth client's Authorized redirect URIs (Part B step 1). |
| After Google, back to the site but signed out | The site is not in Supabase **Redirect URLs** (Part A step 5). |
| Email codes never arrive | Still on the built-in mailer, or the sender domain is not verified (Part A step 7). Check spam. |
| "The security check did not pass" | Turnstile site key missing or hostname not listed in the widget; or CAPTCHA was enabled in Supabase before the key was deployed. |
| "Linking another sign-in method is not switched on" | Part A step 3, **Allow manual linking**. |
| Two Supabase users for one person | **Confirm email** is OFF. Turn it on (linking by email only happens for verified addresses). |
