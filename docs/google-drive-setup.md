# Google Drive setup

Wishtaa Maps can keep files in the user's own Google Drive. It asks for **one permission only**:
`https://www.googleapis.com/auth/drive.file`, which lets the app see files it created or that the user chose to open
with it. It never gets access to the rest of the Drive. Because this scope is "non-sensitive", Google does not require
an app verification review to publish it.

Nothing secret is stored in the app. The client ID and the API key below are meant to be public, so they are safe to
ship in the browser; they are locked to your website addresses instead.

## 1. Create the Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in with the Google account that should own the project.
2. Top bar, project picker, **New project**. Name it `Wishtaa Maps` and create it. Make sure it is selected.

## 2. Turn on the two APIs

**APIs & Services, Library**, then search for and **Enable**:

- **Google Drive API**
- **Google Picker API**

## 3. OAuth consent screen (Google Auth Platform)

1. **APIs & Services, OAuth consent screen** (or **Google Auth Platform**, **Branding**).
2. User type: **External**.
3. App name `Wishtaa Maps`, your support email, and a developer contact email.
4. App domain: home page `https://maps.wishtaa.com`; add a privacy policy and terms page URL if you have them.
   Under **Authorized domains** add `wishtaa.com`.
5. **Data access / Scopes**: **Add or remove scopes**, tick only
   `.../auth/drive.file` ("See, edit, create and delete only the specific Google Drive files you use with this app"),
   save.
6. **Audience**: while testing, keep **Testing** and add your own Google account under **Test users**.
   When you are ready for everyone, press **Publish app** (no review is needed for this scope).

## 4. Create the OAuth client ID

1. **APIs & Services, Credentials, Create credentials, OAuth client ID**.
2. Application type: **Web application**. Name: `Wishtaa Maps web`.
3. **Authorized JavaScript origins** (exact, no trailing slash):
   - `https://maps.wishtaa.com`
   - `http://localhost:5181`
4. **Authorized redirect URIs**: leave empty (the sign-in uses a popup, not a redirect).
5. Create, then copy the **Client ID** (it ends in `.apps.googleusercontent.com`).

## 5. Create the API key (for the file picker only)

1. **Credentials, Create credentials, API key**. Copy it.
2. Open the key and restrict it:
   - **Application restrictions**: *Websites*, add `https://maps.wishtaa.com/*` and `http://localhost:5181/*`.
   - **API restrictions**: *Restrict key*, tick **Google Picker API** only.

## 6. Add the values to the app

Local: copy `.env.example` to `.env` and fill in (never commit `.env`):

```
VITE_GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIza...
```

Restart `npm run dev`.

Vercel: **Project, Settings, Environment Variables**, add the same two names for **Production**, **Preview** and
**Development**, then **redeploy** (Vite reads them when it builds, so a redeploy is required).

The Picker needs the Google Cloud **project number**; the app takes it from the first digits of the client ID, so there
is nothing else to set.

## 7. Check it works

1. Open the site, **Google Drive** in the sidebar, **Connect Google Drive**, and approve the single permission.
2. A `Wishtaa Maps` folder appears in your Drive.
3. In **All files**, use a file's menu, **Move to Google Drive**. The file shows a Drive badge and a `.wishtaa` file
   appears in the folder.
4. Edit it: the save indicator shows Saving, then Saved, and Drive's copy updates.
5. Turn the network off and edit: the indicator says "Offline - will sync"; turn it on and it catches up.

## Creating files

New mind maps, knowledge bases and folders ask where to save them (**This browser** or **Google Drive**), except where
the place is obvious: on the Google Drive page they are created in the folder you are viewing, and inside a local folder
in All files they are created in that folder. Tick "Don't ask again" to always use one choice; Storage settings has
"Ask me each time" to undo that.

In Drive, a file is created as a `.wishtaa` file at once (so the first autosave updates it instead of making a second
copy) and a folder becomes a real Drive folder. **Choose another folder** uses Google Picker in folder mode; choosing a
folder with Picker is what lets this app (which only has `drive.file` access) create files inside it. If Drive can't be
reached, the new file is kept in this browser and you can retry or keep it there.

## How it behaves

- **Local first.** Every save goes to this browser first, then to Drive, so editing is instant and nothing is lost
  if Drive is slow or offline.
- **Tokens** are held in memory only and renewed silently. Only "a Google account is linked" is remembered, never a
  token. We do not store any Google token in our database.
- **Conflicts.** Before each upload the file's version in Drive is compared with the last one seen. If it changed
  elsewhere, nothing is overwritten and you choose: *Keep mine*, *Keep Drive's*, or *Save a copy*.
- **Sign-in lapses or access is removed.** A bar asks you to reconnect; local copies stay safe. Disconnecting revokes
  the token with Google.
- **Drive full.** The status shows "Not saved" with the reason; the local copy is kept.
- **Delete forever** sends the Drive copy to Drive's own bin (recoverable there). Moving to our bin does not touch Drive.
- **`.wishtaa` format**: JSON with `app`, `version`, `type`, `name`, the map, and any pictures and attachments, so a
  file opens complete on another device. Files from a newer version are refused with a clear message.

## Troubleshooting

| Message | Likely cause |
|---|---|
| "Google Drive is not set up for this site yet" | `VITE_GOOGLE_CLIENT_ID` missing in that build (add it, redeploy) |
| Google shows `Error 400: origin_mismatch` | The site address is not in **Authorized JavaScript origins** |
| Google shows "Access blocked: app has not completed verification" | Consent screen is in Testing and your account is not a test user |
| "Choosing files from Drive needs a Google API key" | `VITE_GOOGLE_API_KEY` missing |
| Picker opens blank or errors | Picker API not enabled, or the key's website restriction does not include the site |
| Sign-in window closes immediately | Pop-up blocker: allow pop-ups for the site |

## Open from Google Drive (.wishtaa and .emmx)

There is one action, **Open from Google Drive**, on Home, All files, the Google Drive page, the New file dialog and the command palette.
It uses the Google Picker (My Drive, Shared with me, Recent, shared drives; folders can be browsed; several files can be chosen) and the
scope stays `drive.file`: choosing a file in the Picker is what gives the app access to that one file.

**The Picker cannot filter by file extension, so we list all files and validate on selection.** Drive gives a file uploaded from a computer
an unpredictable type (`application/octet-stream`, `application/zip`, `application/x-zip-compressed`, a vendor type, or none at all), so any
type filter hides some `.emmx` files. The Picker is therefore built with **no type filter**: every file is listed, folders can be browsed
(`setIncludeFolders(true)`, `setSelectFolderEnabled(false)`), and the tabs My Drive, Shared with me, Recent and Shared drives are kept. No text
query is set either (it would stop folder browsing). The Picker title tells people: "Tip: type .emmx or .wishtaa in the search box to narrow the
list." Every pick is then checked:

1. By **name**: `.wishtaa` or `.emmx`, any capitals.
2. If the name says neither, by **content**, after turning away obviously different types (PDF, pictures, Google Docs, Word/Excel/PowerPoint,
   plain text, HTML) and files over 50 MB without downloading them: a ZIP with a `document.xml` at its top level is an `.emmx`; JSON that says it
   is `wishtaa-maps` and has a version is a `.wishtaa`.
3. Anything else is refused with "This file isn't a .wishtaa or .emmx mind map", and nothing is imported. The other files picked at the same
   time are still opened.

Under `drive.file`, a file chosen in the Picker is granted to the app for that session, so the download (`files.get` with `alt=media`) works for
it. This is the one place files are chosen from Drive (Home, All files, the Google Drive page, the New file dialog and the command palette all use it).

**New file type.** New `.wishtaa` files in Drive are created with the type `application/vnd.wishtaa.map+json`, so the Picker can show
them precisely. Files made earlier are stored as `application/json`; they still open and save as before and are **not rewritten** just to
change their type.

**Opening an .emmx.** It is downloaded (with progress), imported with the normal importer (you see the report and the placeholder-text option),
and saved as a NEW `.wishtaa` in `Wishtaa Maps` in your Drive (or a folder you choose with Choose folder). The original `.emmx` is only ever read:
never modified, moved, renamed, deleted or saved to. The new file records where it came from in Drive properties and in its local record:
`sourceFileId`, `sourceName`, `sourceModifiedTime`, `importedAt`. Choosing an `.emmx` that already has a converted copy asks whether to open
that copy (the default) or import again, and says if the `.emmx` changed after it was converted.

The new file goes in `Wishtaa Maps` by default. Creating it next to the original (in the original's folder) was **not** tried: with the
`drive.file` scope that is likely not allowed for a folder the app did not create, so the default folder stays.
