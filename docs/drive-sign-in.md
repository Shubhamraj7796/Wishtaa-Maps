# Google sign-in and Google Drive together

Two separate things, joined into one flow:

| | **Identity** (who you are) | **Drive access** (what the app may touch) |
| --- | --- | --- |
| Provided by | Supabase Auth, Google provider | Google Identity Services token flow (`src/core/drive/auth.ts`) |
| Scopes | `openid`, `email`, `profile` | only `drive.file` |
| Result | a Wishtaa Maps account | a 1-hour access token, kept **in memory only** |

`drive.file` means the app can only see files it created or that you picked with it. It cannot list or read the rest of your Drive.

## The flows

**Rule: Drive is always linked to the same Google account you signed in with.**

**Sign in with Google (automatic).** The Google button shows, before it leaves, *"This also connects your Google Drive. Allow Wishtaa Maps to
create and open only the files it creates or you pick."* Google then shows **one** consent screen (account chooser, then the identity and the
`drive.file` permission together). The Drive permission is requested in that same sign-in (`scopes: drive.file`), and Supabase hands the
resulting Google access token back to the page, so Drive connects **with no extra window and no click** and the page says *"Google Drive
connected as name@gmail.com."* If that token is missing (the Drive box was unticked) or unusable, one clear button asks for it instead
("Allow Google Drive?", already set to the same address): browsers only open Google's window from a click, so that fallback cannot be
automatic.

**Checked every time.** Whenever a Drive token is obtained, the app reads the Drive account's email (Drive `about.get`) and compares it
with the required account (Gmail addresses are compared the way Google does: dots, `+tag` and `googlemail.com` are ignored). On a mismatch
the token is **discarded and revoked**, nothing is linked or saved, and the person sees *"This Drive belongs to other@gmail.com. Please use the
same Google account you signed in with (name@gmail.com)."* with **Try again**, which asks Google for the right account with no chooser. If the
address cannot be read at all, the token is not kept either (a display name is never trusted).

**Email code or password.** "Connect Google Drive" requires the same address when the account email is a Gmail address (no chooser, address
suggested, same mismatch check). If the account email is not a Gmail address it may or may not be a Google account, so Google's account chooser
is shown, **any** Google account may be used, and the choice is saved in the account (`drive_links`) with a plain note if it differs from the
sign-in email.

**Remembered.** The account records which Google address is linked and its status (`drive_links`: `connected`, `needs_reconnect`,
`disconnected`). Never a token. On a new device the same address is suggested.

**Sign out / someone else signs in on the same browser.** Sign-out forgets the Drive access (token and linked-account note; Google's
permission itself is not revoked, so signing back in needs no new consent) and removes the cached copies of Drive maps from this browser
without touching Drive. A map with edits not yet sent is never dropped: it stays as a file saved in this browser. Guest files ("This
browser") are untouched. If a different person signs in without the first person having signed out, the same clean-up runs first. Signing
out is not "disconnect Drive": the account keeps its Drive link record.

## When Google or the browser gets in the way

- **Window closed, or "Access blocked / app not verified / not a test user".** A dialog explains that the app is probably still being approved by Google and the account has not been added yet, shows who to contact (`VITE_SUPPORT_EMAIL`, else "the person who gave you this link"), and has **Copy details** (what happened, signed-in address, requested scope, client id prefix, browser, time: never a token) and **Try again**. Closing the window on the very first connect shows this too, because Google's error page can only be seen by closing it, and the app cannot tell the two apart.
- **Pop-up blocked.** A dialog offers **Open Google sign-in**, which opens the window as a direct click.

## Keeping access alive (`src/core/drive/renewal.ts`)

Tokens last about an hour. The app renews them with no window and no question (`prompt: none`):

- about 50 minutes after each token was issued (10 minutes before it would stop working);
- when the tab becomes visible or focused again after being away, and when the network returns;
- after a reload, once, as soon as the page can.

If the browser refuses to open Google's window without a click (this is the usual obstacle), the renewal waits for **your next click or key
press** and does it then, still silently. **Only** when Google itself says you must confirm *and* the old token has stopped working does the
bar "Google Drive needs you to sign in again" appear. Once it is showing, the app stops trying in the background (no windows flashing).

## What cannot be done without a server (honest limits)

The token flow used here **never gives the app a refresh token**. So the app cannot renew access while no tab is open, and silent renewal
depends on the browser and on you still being signed in to Google. It can still fail, and then you see "Reconnect", when:

- you signed out of Google or Google wants you to confirm (new device, security check, password change);
- the browser blocks third-party sign-in windows or cookies (Safari's tracking prevention, Firefox strict mode, some Chrome settings, an installed iPhone web app);
- the Google OAuth consent screen is still in **Testing** mode (Google ends such sessions after 7 days): publish it (`docs/auth-setup.md`, Part B step 3).

I could not test real Google behaviour from here; the logic is covered with a stand-in for Google's script (`renewal.test.ts`). Please
watch for the Reconnect bar over the first week of real use; if it appears often, that tells us a server is worth building.

## Plan: permanent Drive access with a server (not built)

1. **Flow.** Use Google's *code* model (`initCodeClient`, popup) with `access_type=offline` and `prompt=consent`. The browser receives a one-time `code` and posts it, with the Supabase sign-in, to a Vercel function `api/drive/connect`. The function exchanges the code at Google (using the OAuth **client secret**, which only the server holds) and gets a refresh token.
2. **Storage.** Table `drive_tokens(user_id, ciphertext, key_version, created_at)` with RLS that grants clients **nothing** (only the server's service key reads it). The refresh token is encrypted with AES-256-GCM; the key lives in a Vercel secret (or Supabase Vault / a cloud KMS), with a version number for rotation.
3. **Use.** `api/drive/token` checks the Supabase sign-in, decrypts the refresh token, asks Google for a 1-hour access token and returns only that. The browser keeps using the token in memory exactly as today, so nothing else in the app changes. Renewal becomes a plain call that works from any browser, with no windows.
4. **Removal.** Disconnect, sign-out of all devices and account deletion revoke the token with Google and delete the row. Logs never contain tokens or file names.

**Cost.** Roughly 30 token calls per active user per day (every ~50 minutes while a tab is open), each a few milliseconds of compute. 1,000 daily users is about 900,000 calls a month (inside Vercel's included amounts); 10,000 daily users is about 9 million, a few dollars a month on a paid plan. Supabase storage is negligible. Build and review time: about 3 to 5 days including tests and a security review.

**Risk.** A stored refresh token is a long-lived key to a person's `drive.file` files (only the ones this app made or opened, never the whole Drive). A leak of the database **and** the encryption key would expose those files, so key handling, least-privilege access, rotation and incident steps matter more than the code. The privacy policy must say the token is stored encrypted and is deleted on disconnect or account deletion. Google also ends an unused refresh token after 6 months.

**Recommendation.** Do it only if the Reconnect bar still shows up too often after a week or two of real use, and after the consent screen is published.
