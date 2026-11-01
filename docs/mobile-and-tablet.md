# Wishtaa Maps on phones and tablets

Wishtaa Maps is a web app. It runs in the browser on any phone, tablet or computer, and it can also be **installed**, so it opens in its own window, starts fast, and opens with no connection.

This page says what works where, what does not, and how it was checked. "Checked" means checked in a real browser or by automatic tests; nothing here has been tried yet on a physical iPhone, iPad or Android device unless it says so.

## Install

| Where | How |
|---|---|
| **Android, Chrome or Edge** | Preferences, then **Install app**, then **Install Wishtaa Maps**. Or the browser menu, then Install app. |
| **Desktop Chrome or Edge** | The install icon in the address bar, or Preferences, then Install app. |
| **iPhone and iPad, Safari** | Tap **Share**, then **Add to Home Screen**. (Safari has no install button the app can use, so Preferences explains the steps.) |
| **Firefox** | Firefox does not install web apps on phones or on Windows and Mac. Use it as a normal page. |

Everything is feature-detected: where a browser cannot do something, that part is simply not offered and the rest works as before.

## Opening with no connection

After the app has been opened once with a connection, a copy of the app itself (its page, scripts and styles, about 1.7 MB) is kept on the device. Then:

- the app opens with no connection (measured: about 0.2 s from the saved copy), and so does any map saved **in this browser**;
- a map saved in **Google Drive** opens from this device if it has been opened here before. Edits are kept here and go to Drive when the connection is back (the existing "Offline - will sync" behaviour, unchanged);
- the first time, with no connection and nothing saved, you see a short "You are offline" page;
- clipart icons you have not used yet are not saved ahead of time; they are saved the first time they are shown.

**What is never kept by the app copy:** anything from Google. Google Drive, Google sign-in and every other address that is not this site go straight to the network. Nothing from them, and no sign-in token, is ever read, saved or cached by the service worker. This is checked by tests and in a real browser.

## Updates

A new version is downloaded in the background. It does **not** replace the one you are using by itself. When it is ready a bar says **Update available - reload**. **Reload** saves the map that is open, then switches to the new version. **Later** hides the bar. The app also checks for a new version each time you come back to it and once an hour, so nobody stays on an old version for days.

If you ever want to force it, a hard refresh still works: **Ctrl+Shift+R** (Cmd+Shift+R on a Mac) is left to the browser. The Read / Edit switch is **Alt+R** (Option+R on a Mac).

## Share a picture into the app

**Android, Chrome (installed app): works.** In any app (Photos, Files, a screenshot preview), choose **Share**, then **Wishtaa Maps**. The app opens with **Add this picture**:

1. choose the map (or **A new map**),
2. choose the topic, and whether the picture goes on that topic or as a new subtopic under it,
3. the map opens and the usual crop step appears, then **Compressed** or **Original**.

Several pictures can be shared at once; they become subtopics, one after another. Only pictures are accepted.

**iPhone and iPad: not available.** Apple does not let a web app appear in the Share sheet. On iOS and iPadOS use **Add picture**, then **Choose from Photos** (or **Take photo**) inside the app. A screenshot is added the same way: take it, then choose it from Photos.

**Desktop:** no share target. Drag a picture onto a topic, paste with Ctrl+V, or use **Add picture**.

## What works on each device

| | Android (Chrome) | iPhone / iPad (Safari) | Desktop (Chrome, Edge, Firefox) |
|---|---|---|---|
| Install | yes | Add to Home Screen | Chrome, Edge: yes |
| Opens offline | yes | yes, once installed or opened | yes |
| Maps saved in this browser | yes | yes, see the limit below | yes |
| Google Drive sign-in and sync | yes | yes (a pop-up window is used) | yes |
| Share a picture into the app | **yes** | **no** | no |
| Take photo / Choose from Photos | yes | yes | choose a file |
| Capture screen | no (browser does not allow) | no | yes |
| Paste an image button | yes | limited, ask once | yes |
| Touch controls (big targets, bottom sheets) | automatic | automatic | optional in Preferences |

## Known limits

- **Browser storage can be cleared.** Maps saved in "This browser" live in the browser's storage. The app asks the browser to keep it, but Safari on iPhone and iPad can clear storage for sites not used for about a week unless the app is **added to the Home Screen**. Save important maps to Google Drive, or use **Download as a single file**.
- **Share-target needs the installed app** on Android. Before installing, "Wishtaa Maps" does not appear in the Share sheet.
- **Pictures are limited per map:** a warning at 400 pictures or 250 MB, a stop at 2,000 pictures or 1 GB.
- **Big maps on slow tablets.** A map with hundreds of pictures drawn all at once at a very low zoom is the slowest case; see `docs/pictures.md` for the numbers.
- **Google sign-in in an installed app** uses a pop-up. If a pop-up is blocked, allow it for the site and try again.
- **Icons for clipart** need a connection the first time each icon is used.
- **PDFs** open in a sheet along the bottom (not beside the map), with 44 px markup tools. Very large PDFs (near the 50 MB limit) are
  slower to open on a tablet, and scrolling a long PDF very fast shows pages after a moment. Once a pen has touched the screen, fingers
  scroll and do not draw. See `docs/pdf-source-panel.md` for the numbers; they were not measured on a real tablet.

## How it was checked

Automatic tests cover: the service worker (what it intercepts and what it never touches, offline pages, updates waiting for you, shared pictures), the manifest and its icons, the update bar, the install button states, and the Add this picture flow.

Checked in a real browser (Chromium, production build): the manifest has no errors and the only installability message was the one that comes from the test browser being a private window; the app opens offline (home, file list, and a map made earlier); a request to Google carrying a sign-in token went to the network and nothing from it was kept; a new build produced the Update bar, left the old version running until Reload was pressed, and then switched; a simulated Android share (the same form post the system sends) opened Add this picture and then the crop step.

**Not checked on a physical device:** installing from the Android menu, a real Share sheet, Safari on iPhone and iPad, and Add to Home Screen. These are listed for testing in the release notes.
