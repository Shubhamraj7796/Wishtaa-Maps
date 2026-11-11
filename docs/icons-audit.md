# Icons first: audit of text controls

Rule 8 in `CLAUDE.md`: an icon with a tooltip wherever it can be understood alone; a short word only where it cannot. This file is the working list for the Icons First work. Part 1 is the decision per area (made with the owner on 2026-11-11). Part 2 is the exact list the code scan found today (a control whose visible content is words), so nothing is missed. The scan is a list of places to look at, not of things that must all change.

## Part 1: decisions

| Area | Becomes icon only (tooltip + aria-label) | Keeps a short word, and why |
|---|---|---|
| PDF top bar | Capture area, Split, Markup, View (labels shown at 700 px and wider today) | PDF name drop-down, page number box, zoom percentage: they are content |
| PDF View menu | Whole menu: pages (one, two, first page alone), reading (scrolling, 1-page flipping, right to left), colour swatches, zoom - and +, fit width / page / height, actual size, reset, presentation | Zoom percentage; the one-line explanation when two pages do not fit |
| PDF capture bar | Add as Sub-topic / Next sibling / New branch, Keep capturing | Into: <target name> (it names the topic) |
| PDF selected-markup and lasso bars | Add note, Edit note, Make topic | N chosen |
| PDF markup toolbar | Already icons; moves to the shared tooltip | Flyout labels (Thickness, Strength, Presets, Save current), customise panel (a checklist needs words) |
| PDF '...' menu, name menu | - | Rare commands: keep words (a leading icon is added in step 6) |
| PDF tabs | Close x is already an icon | Tab names are file names |
| Map toolbar and header | Map, Outline, Topic, Sub Topic, Floating, Relationship, Callout, Boundary, Summary: captions go (step 5) | Edit | Read switch: a mode that must be unmistakable; save status and location chips: status, not commands |
| Insert menu | - | Icon above one word in a grid (step 6): eleven different objects, several look alike |
| Quick toolbar, picture bars | Mostly icons already (step 6) | Font family select shows the current value |
| Files browser | Create folder, sort, view (step 6) | Tabs My files / Notes / Resources / Bin |
| Menus: file, account, right-click | - | Rare commands: words with a leading icon |
| Dialogs, sign-in, Preferences, privacy and terms, settings forms | - | Words are needed; primary buttons (Add, Cancel, Save) keep them |

## Part 2: the scan (398 controls with words, 76 files)

Format: `line  element  words`.

### Accounts, sign-in

- `src/app/auth/AccountDrive.tsx`
  - 50  button  void actions.connect()}>Reconnect
  - 51  button  void actions.disconnect()}>Disconnect Google Drive
  - 59  button  (driveAuth.connected() ? void actions.connect() : connectDri
- `src/app/auth/AccountMenu.tsx`
  - 64  button  openAuth(
  - 82  button  setOpen(!open)} aria-haspopup="menu" aria-expanded=
  - 96  button  f.setDialog(
  - 97  button  f.setDialog(
  - 98  button  navigate('/account'))}>
- `src/app/auth/AuthHost.tsx`
  - 21  button  open(
  - 24  button  auth.dismissExpired()} aria-label="Continue without signing 
  - 89  button  done(false)}>Keep them in this browser only
  - 90  button  void add()}>Add my files
- `src/app/auth/DriveDialogs.tsx`
  - 42  button  Not now
  - 43  button  void allow()}>
  - 80  button  Cancel
  - 81  button  void connect()}>
  - 94  button  Done
  - 145  button  void copy()}>
  - 146  button  Cancel
  - 147  button  void retry()}>Try again with
  - 158  button  Cancel
  - 159  button  void retry()}>
  - 177  button  void copy()}>
  - 178  button  Close
  - 179  button  void retry()}>Try again
  - 214  button  void copy(location.href, () => setLinkCopied(true))}>
  - 218  button  choose('device', which === 'pdf' ? pickPdfFromDevice : () =>
  - 222  button  choose('retry')}>Try again
  - 225  button  void pickerDetails(which, reason).then((t) => copy(t, () => 
- `src/app/auth/SignInDialog.tsx`
  - 140  button  void google()} disabled=
  - 170  button  go('password')} className="mt-1 w-full text-center text-sm t
  - 210  button  0 || blocked} onClick=
  - 213  button  go('email')} className="text-brand underline-offset-2 hover:
  - 225  button  void resend('confirm')} disabled=
  - 234  button  go('forgot')} className="text-brand underline-offset-2 hover
  - 235  button  go('email')} className="text-brand underline-offset-2 hover:
  - 238  button  go('signup')} className="mt-1 w-full text-center text-sm tex
  - 256  button  go('password')} className="mt-1 w-full text-center text-sm t
  - 266  button  go('password')}>I confirmed, sign in
  - 267  button  go('email')}>Email me a code
  - 268  button  0 || blocked} onClick=
  - 283  button  go('password')} className="w-full text-center text-sm text-b
  - 290  button  go('password')}>Back to sign in
- `src/app/auth/parts.tsx`
  - 28  button  setShown(!shown)} aria-label=

### App shell, side menu

- `src/app/Shell.tsx`
  - 79  button  f.setDialog(
  - 82  button  f.setDialog(
  - 236  button  setDrawer(false)} />

### Dialogs

- `src/app/Dialogs.tsx`
  - 38  button  Cancel
  - 152  button  Cancel
  - 178  button  Cancel
  - 231  button  Cancel
  - 261  button  OK

### Editor panels, menus and toolbars

- `src/editor/ui/AddPictureMenu.tsx`
  - 78  button  it.source && void startSource(it.source, target,
  - 116  button  Cancel
- `src/editor/ui/BranchControls.tsx`
  - 61  button  A.setBranchScope(id)} className=
  - 91  button  A.resetBranchesToAuto('selection')} className="text-muted ho
  - 111  button  set(
- `src/editor/ui/BranchDirection.tsx`
  - 57  button  !on && A.setBranchDirection(id)} className=
- `src/editor/ui/CanvasTab.tsx`
  - 73  button  Reset moved branches
- `src/editor/ui/ChoiceDropdown.tsx`
  - 76  button  onPick(c.id)} onFocus=
- `src/editor/ui/ClipartPanel.tsx`
  - 37  button  setQuery('')}>
  - 45  button  setCategory(c)} className=
  - 59  button  setColor(c)} className=
  - 72  button  toggleMarkSelected(markFor(n))} className=
- `src/editor/ui/ColorPicker.tsx`
  - 53  button  setOpen((o) => !o)} className=
  - 82  button  Auto
  - 136  button  pick(c)} className=
  - 243  button  void new Dropper().open().then((r) => pick(r.sRGBHex)).catch
  - 265  button  pick(report.suggestion as string)} className="rounded-ui bor
- `src/editor/ui/CropOverlay.tsx`
  - 309  button  rotateBy('left')} className=
  - 312  button  rotateBy('right')} className=
  - 315  button  natural && setRect(fullRect(bounds ?? natural))} className=
  - 319  button  void retake()} className=
  - 335  button  setMore(!more)} className="text-brand underline"> More optio
  - 349  button  (showNotice('Cancelled.', 1500), cancel())} className=
  - 352  button  void confirm()} className=
- `src/editor/ui/DetailsPanel.tsx`
  - 69  button  setPicturePosition(id, p)} className=
  - 79  button  setKeep(!keep)} className=
  - 88  button  applyPictureSizeToAll(id)} className=
  - 89  button  void resetImageSize(id)} className=
  - 90  button  void replaceImage(id)} className=
  - 91  button  showPreview(image.imageId)} className=
  - 92  button  void downloadImage(image.imageId, text)} className=
  - 93  button  startOcr(id)} className=
  - 94  button  removeImage(id)} className=
  - 126  button  removeTagFromSelected(t)} className="grid h-4 w-4 place-item
  - 137  button  toggleTagFilter(tag)} className=
  - 154  button  patchTask(mapDoc, id,
  - 183  button  setTask(mapDoc, id, null)} aria-label="Remove task" title="R
  - 205  button  setTopicLink(id, text)} aria-label="Save link" title="Save l
  - 207  button  setTopicLink(id, '')} aria-label="Remove link" title="Remove
  - 210  button  (linkFrom ? cancelLinkPick() : startLinkPick(id))} aria-pres
  - 213  button  setPicker(true)} className=
  - 221  button  files.open(linkedTo)} className="shrink-0 rounded-ui border 
  - 234  button  = MAX_ATTACHMENTS} onClick=
  - 242  button  void downloadAttachment(f)} className=
  - 243  button  detachFile(id, f.id)} className=
  - 291  button  commit([['', ''], ['', '']])} className=
  - 312  button  = MAX_TABLE_ROWS} onClick=
  - 313  button  = MAX_TABLE_COLS} onClick=
  - 314  button  commit(rows.slice(0, -1))} className=
  - 315  button  commit(rows.map((r) => r.slice(0, -1)))} className=
  - 316  button  commit([])} aria-label="Remove the table" title="Remove the 
- `src/editor/ui/Dialogs.tsx`
  - 96  button  void run()} className="flex items-center gap-2 rounded-ui bg
  - 111  button  void navigator.clipboard?.writeText(text).then(() => showNot
- `src/editor/ui/FileLinks.tsx`
  - 98  button  open(file, l.topicId)} className="flex w-full items-center g
- `src/editor/ui/MarkPanel.tsx`
  - 18  button  toggleMarkSelected(mark)} className=
- `src/editor/ui/NotesPanel.tsx`
  - 13  button  e.preventDefault()} onClick=
- `src/editor/ui/ObjectBar.tsx`
  - 26  button  editObject(ref)} className=
  - 29  button  deleteSelectedObject()} className=
  - 32  button  selectObject(null)} className=
  - 46  button  patchObject('relationship', r.id,
  - 54  button  patchObject('relationship', r.id,
  - 76  button  patchObject('boundary', b.id,
  - 84  button  patchObject('boundary', b.id,
- `src/editor/ui/ObjectStyle.tsx`
  - 40  button  onPick(l)} className=
  - 79  button  set(
  - 105  button  set(
- `src/editor/ui/OutlineView.tsx`
  - 109  button  showPreview(image.imageId)} className="grid h-7 w-7 place-it
  - 112  button  void replaceImage(topicId)} className="grid h-7 w-7 place-it
  - 115  button  removeImage(topicId)} className="grid h-7 w-7 place-items-ce
  - 155  button  (readOnly ? toggleFold(row.id) : setCollapsed(mapDoc, [row.i
  - 187  button  openAddPicture(image ?
- `src/editor/ui/Overlays.tsx`
  - 60  button  stepMatch(-1)} className="px-1 text-muted hover:text-ink"> ↑
  - 63  button  stepMatch(1)} className="px-1 text-muted hover:text-ink"> ↓
  - 170  button  setHelp(false)} className="rounded-ui border border-line px-
- `src/editor/ui/PictureChoiceDialog.tsx`
  - 31  button  onChange('compressed')} className=
  - 34  button  onChange('original')} className=
  - 81  button  setZoom(!zoom)} className="mb-1 text-xs text-brand underline
  - 102  button  req.resolve(null)} className=
  - 105  button  req.resolve(
- `src/editor/ui/PictureFormat.tsx`
  - 90  button  setKeep(!keep)} className=
  - 97  button  void resetImageSize(id)} className=
  - 118  button  setConfirm(false)} className="rounded-ui border border-line 
  - 124  button  setConfirm(true)} className=
  - 132  button  setPicturePosition(id, p)} className=
  - 156  button  void replaceImage(id)} className=
  - 160  button  useEditor.setState(
  - 164  button  showPreview(image.imageId)} className=
  - 167  button  void downloadImage(image.imageId, topic.text)} className=
  - 170  button  void copyImage(image.imageId)} className=
  - 173  button  removeImage(id)} className=
- `src/editor/ui/PictureToolbar.tsx`
  - 65  button  showPreview(image.imageId)} className=
  - 68  button  void downloadImage(image.imageId, topic?.text ?? '')} classN
  - 71  button  void replaceImage(id)} className=
  - 74  button  void copyImage(image.imageId)} className=
  - 77  button  removeImage(id)} className=
  - 81  button  setMore(!more)} className=
- `src/editor/ui/PicturesSection.tsx`
  - 49  button  void look()} className=
  - 69  button  void apply(step.plan)} className="rounded-ui bg-brand px-3 p
  - 73  button  setStep(
  - 89  button  setStep(
- `src/editor/ui/PopoverRow.tsx`
  - 61  button  setOpen((o) => !o)} className="flex min-w-0 max-w-[13rem] it
- `src/editor/ui/QuickToolbar.tsx`
  - 56  button  setOpen((o) => !o)} className=
  - 160  button  A.nudgeFontSize(-2)} className=
  - 166  button  A.nudgeFontSize(2)} className=
  - 170  button  = 700} aria-label="Bold" title="Bold" onClick=
  - 173  button  void cmdAddImage(primary)} className=
  - 176  button  toggle(look.italic,
  - 179  button  toggle(look.underline,
  - 182  button  toggle(look.strike,
  - 195  button  A.styleSelected(
- `src/editor/ui/ReadModeSwitch.tsx`
  - 25  button  enterEditMode()} title="Edit mode (Alt+R, Option+R on a Mac,
  - 29  button  void enterReadMode()} title="Read mode: nothing can be chang
- `src/editor/ui/ReadPanel.tsx`
  - 17  button  A.togglePanel()} className="grid h-8 w-8 place-items-center 
  - 85  button  followLink(id)} className="flex items-center gap-1.5 rounded
- `src/editor/ui/SaveStatus.tsx`
  - 107  button  void resumePictureUploads()} title=
- `src/editor/ui/SettingsPanel.tsx`
  - 298  button  A.openPanel()} className="absolute right-0 top-1/2 z-20 grid
  - 313  button  A.openPanel()} className="absolute bottom-16 right-10 z-20 h
  - 367  button  pick(t)} className=
  - 389  button  setPinned(!pinned)} className=
  - 403  button  A.closePanel(true)} className="grid h-6 w-6 place-items-cent
- `src/editor/ui/StyleTab.tsx`
  - 55  button  A.nudgeFontSize(-2)} className=
  - 59  button  A.nudgeFontSize(2)} className=
  - 73  button  = 700} aria-label="Bold" title="Bold" onClick=
  - 76  button  A.styleSelected(
  - 79  button  A.styleSelected(
  - 82  button  A.styleSelected(
  - 88  button  A.styleSelected(
- `src/editor/ui/ThemePanel.tsx`
  - 167  button  void save()} className="rounded-ui bg-brand px-3 py-1.5 text
  - 170  button  Cancel
  - 216  button  void saveCurrent()} className="rounded-ui bg-brand px-3 py-1
  - 221  button  setEditing(!editing)} aria-expanded=
  - 224  button  fileRef.current?.click()}> Import theme…
  - 258  button  setRenaming(
  - 261  button  void duplicate(t)}> Duplicate
  - 264  button  download(`$
  - 267  button  void themeRepository.remove(t.id)}> Delete
  - 285  button  void themeRepository.save(t)}> Keep in My themes
  - 288  button  A.removeMapTheme(t.id)}> Remove
  - 327  button  setTab(t)} className=
  - 431  button  A.resetBranchesToAuto('map')} className="text-xs text-muted 
  - 456  button  A.changeSetting('palette', null)} className="text-xs text-mu
- `src/editor/ui/TopicStylePanel.tsx`
  - 64  button  setOpen(!open)} className=
  - 134  button  set(

### Files

- `src/app/FileBrowser.tsx`
  - 179  button  setMenu(!menu)} className="grid h-8 w-8 shrink-0 place-items

### Map header, map toolbar, footer

- `src/app/EditorScreen.tsx`
  - 285  button  1 ? 's' : ''}`} onClick=
  - 304  button  A.zoomBy(0.8)} aria-label="Zoom out" title="Zoom out" classN
  - 308  button  A.zoomBy(1.25)} aria-label="Zoom in" title="Zoom in" classNa

### Markup toolbar

- `src/editor/markup/MarkupToolbar.tsx`
  - 209  button  choose(key2 === 'shapes' ? shape : t, key2 ?? styleKey, e)} 
  - 214  button  openFlyout(key2 ?? (styleKey as StyleKey), key2 === 'shapes'
  - 222  button  (x.onClick(), setFlyout(null))} className=
  - 227  button  setPlace(
  - 233  button  setFlyout(flyout?.key === 'settings' ? null :
  - 257  button  !dragged.current && (setIdleFolded(false), setPlace(
  - 267  button  (setFlyout(null), setPlace(
  - 303  button  setFlyout(flyout?.key === 'more' ? null :
  - 365  button  onTool(s)} className=
  - 373  button  onStyle(key,
  - 405  button  onSavePreset(key)} className="rounded border border-line px-
  - 412  button  onStyle(key, p)} className="grid h-10 min-w-10 place-items-c
  - 416  button  onRemovePreset?.(key, i)} className="absolute -right-1 -top-
- `src/editor/markup/ToolSettings.tsx`
  - 68  button  move(i, -1)} className="grid h-7 w-7 place-items-center roun
  - 71  button  move(i, 1)} className="grid h-7 w-7 place-items-center round
  - 89  button  Reset to defaults
- `src/editor/markup/layers.tsx`
  - 422  button  Cancel

### Other

- `src/app/DriveOpenDialog.tsx`
  - 242  button  void chooseFolder()}> Choose folder…
  - 246  button  setFolder(null)}> Use Wishtaa Maps
  - 271  button  Cancel
  - 274  button  void run(items,
  - 322  button  Convert into this browser instead
  - 327  button  void r.retry?.()}> Retry
  - 338  button  Close
- `src/app/DriveUi.tsx`
  - 30  button  setHidden(false)} className="shrink-0 rounded-ui bg-brand px
  - 41  button  void choose(choice)} className=
  - 82  button  void actions.connect()} className="shrink-0 rounded-ui bg-br
  - 86  button  driveAuth.dismissMessage()} aria-label="Dismiss" title="Dism
  - 116  button  void actions.disconnect()}>Disconnect
  - 123  button  void actions.connect()}>
  - 136  button  setPrefs(
  - 145  button  Close
- `src/app/ErrorBoundary.tsx`
  - 60  button  this.setState(
  - 64  button  void recoverFromStaleBuild(() => location.reload()).then((r)
  - 68  button  (this.setState(
  - 72  button  void this.copy()}>
- `src/app/PictureStorage.tsx`
  - 112  button  void pictureSync.syncNow()}> Sync now
  - 116  button  void resumePictureUploads()}>
  - 120  button  pictureSync.pause()}> Pause
- `src/app/PwaUi.tsx`
  - 26  button  void reload()} className=
  - 29  button  setHidden(true)} className=
  - 52  button  void promptInstall().then((r) => setNote(r === 'accepted' ? 
- `src/app/RecoverDialog.tsx`
  - 70  button  void driveRepository.recoverableDelete(fileId, v.key).then((
  - 73  button  void restore(v)}> Restore this version
- `src/app/SharedPictures.tsx`
  - 141  button  Cancel
  - 144  button  void submit()}> Continue
- `src/app/createFlow.tsx`
  - 374  button  Cancel
  - 375  button  Create
  - 399  button  Cancel
- `src/app/importFlow.tsx`
  - 186  button  Import to this browser instead
  - 231  button  Cancel
  - 234  button  Choose file…
  - 268  button  onOpen(m.record)} > Open
  - 322  button  Close
- `src/app/pages/Account.tsx`
  - 45  button  Save name
  - 69  button  Save password
  - 70  button  Cancel
  - 99  button  setChanging(true)}>
  - 100  button  void remove('email')}>Remove
  - 113  button  void remove('google')}>Remove
  - 115  button  void step.run(() => auth.linkGoogle())}>Link Google
  - 132  button  void auth.signOut().then(() => f.notify('Signed out. Files s
  - 133  button  setConfirmAll(true)}>Sign out of all devices
  - 139  button  void step.run(async () => (await auth.signOut(
  - 140  button  setConfirmAll(false)}>Cancel
  - 189  button  setOpen(true)}>Delete my account…
  - 198  button  void go()}>Delete my account
  - 199  button  (setOpen(false), setTyped(''))}>Cancel
  - 225  button  open(
- `src/app/pages/Drive.tsx`
  - 55  button  void actions.connect()}>
  - 71  button  make('map')}>
  - 72  button  make('kb')}>
  - 73  button  make('folder')}>
  - 74  button  importer.pick(
  - 83  button  setTrail(trail.slice(0, i + 1))} className="rounded px-1 hov
  - 87  button  void load()} aria-label="Refresh" title="Refresh" className=
  - 119  button  setTrail([...trail,
  - 121  button  void actions.openDriveFile(it.id)} aria-label=
  - 146  button  void actions.openFromGoogleDrive()}>
  - 149  button  void actions.disconnect()}>Disconnect
  - 174  button  void actions.connect()} className=
- `src/app/pages/Files.tsx`
  - 61  button  f.restore(ids))}>
  - 62  button  f.setDialog(
  - 66  button  f.setDialog(
  - 72  button  f.trash(ids))}>
  - 231  button  f.setDialog(
- `src/app/pages/Home.tsx`
  - 44  button  void drive.openDriveFile(r.drive_file_id as string)} classNa
  - 98  button  f.open(last)} className="flex w-full max-w-xl items-center g
- `src/app/pages/Kb.tsx`
  - 53  button  void f.openSampleKb()} className="rounded-ui bg-brand px-3 p
  - 54  button  setBannerGone('1')} aria-label="Dismiss" title="Dismiss" cla
- `src/app/pages/ResetPassword.tsx`
  - 43  button  open(
  - 44  button  navigate('/home')}>Go to the app
  - 56  button  Save new password
- `src/app/ui.tsx`
  - 69  button  onChange(t.id)} className=
  - 88  button  onChange(c.id)} className=
  - 118  button  onChange(
  - 133  button  onChange(v)} className=
- `src/editor/canvas/TopicView.tsx`
  - 179  button  e.stopPropagation()} onClick=
- `src/ui/IconButton.tsx`
  - 33  button  (tip.onPointerEnter(e), rest.onPointerEnter?.(e))} onPointer
  - 73  button  (tip.onPointerEnter(e), rest.onPointerEnter?.(e))} onPointer

### PDF panel

- `src/editor/pdf/CaptureBar.tsx`
  - 50  button  Cancel (Esc)
  - 56  button  Change
  - 64  button  setCaptureMode(m.id)}>
  - 74  button  setMenu(!menu)}> …
- `src/editor/pdf/LassoLayer.tsx`
  - 184  button  m.color.toLowerCase() === c)} aria-label=
  - 193  button  deleteManyMarkup(ids)}>
- `src/editor/pdf/OutlineDialog.tsx`
  - 80  button  setMode(m)} className=
  - 110  button  Cancel
  - 113  button  Add to map
- `src/editor/pdf/PasswordDialog.tsx`
  - 33  button  answerPassword(null)}> Cancel
  - 36  button  Open
- `src/editor/pdf/PdfBar.tsx`
  - 52  button  setMenu(menu === 'source' ? null : 'source')} className="fle
  - 59  MenuItem  (openPdfTab(s.id), close())} active=
  - 67  MenuItem  Open a PDF from this device…
  - 68  MenuItem  void openPdfFromDrive())}>Open a PDF from Google Drive…
  - 75  MenuItem  unsplitPdf())}>One PDF (merge the split view)
  - 80  MenuItem  splitPdf(s.id, 'right'))}> Split view with
  - 85  MenuItem  setPdfSync(!panel.sync))}>
  - 88  MenuItem  setPdfOutlineColumn(!panel.outlineColumn))}>
  - 92  MenuItem  void downloadMarkedPdf(source.id))}>Download PDF with markup
  - 93  MenuItem  void saveCopyToDrive(source.id))}>Save copy to Google Drive
  - 99  MenuItem  Start an outline from this PDF…
  - 100  MenuItem  void removePdfFromDevice(source.hash))}>Remove from this dev
  - 101  MenuItem  removePdfSource(source.id))}>Remove from this map
  - 110  button  chooseLayout(source.id,
  - 116  button  setPdfTool(tool === 'capture' ? 'select' : 'capture')}>
  - 122  button  (other ? unsplitPdf() : second && splitPdf(second, 'right'))
  - 128  button  setPdfMarkupBar(!markupBar)}>
  - 134  button  setPdfFocusMode(true)}>
  - 140  button  setMenu(menu === 'more' ? null : 'more')}>
  - 147  MenuItem  Open a PDF from this device…
  - 148  MenuItem  void openPdfFromDrive())}>Open a PDF from Google Drive…
  - 155  MenuItem  unsplitPdf())}>One PDF (merge the split view)
  - 157  MenuItem  second && splitPdf(second, 'right'))}>
  - 162  MenuCheck  setPdfSync(!panel.sync)}> Sync scrolling
  - 166  MenuItem  setPdfFocusMode(true))}>Focus mode (hide every control)
  - 167  MenuItem  setPdfFocusMode(true))}>Focus mode
  - 169  MenuCheck  setPdfThumbs(!thumbs)}> Page thumbnails
  - 174  MenuItem  setPdfTab(panel.tab === 'markup' ? 'pages' : 'markup'))}>
  - 177  MenuCheck  setShowHidden(!showHidden)}> Show
  - 192  MenuItem  setPdfOutlineColumn(!panel.outlineColumn))}>
  - 194  MenuItem  Close the PDF (it stays in the map)
  - 195  MenuItem  setPdfSize(nextSize(size)))}>
  - 196  MenuItem  setPdfCollapsed(true))}>Hide the PDF panel (the PDF stays op
  - 201  button  setPdfSize(nextSize(size))} >
  - 234  button  turnPdf(-1)} disabled=
  - 241  button  turnPdf(1)} disabled=
- `src/editor/pdf/PdfPanel.tsx`
  - 160  button  setPdfCollapsed(false)}>
  - 184  button  setPdfFocusMode(false)} className="absolute left-1/2 top-0 z
  - 211  button  setPdfDrawer(true)}>
  - 223  button  setPdfDrawer(false)}>
  - 405  button  setPdfTab('pages')}>
  - 450  button  input.current?.click()}> Reopen PDF
  - 454  button  (setBusy(true), void refetchFromDrive(source.id).finally(() 
  - 498  button  Open
- `src/editor/pdf/SelectionBar.tsx`
  - 67  button  done('topic')}>Add as topic
  - 68  button  done('sub')}>Add as sub-topic
  - 69  button  mark('highlight')}>
  - 73  button  mark('underline')}>Underline
  - 74  button  mark('strike')}>Strike
- `src/editor/pdf/SourceBadge.tsx`
  - 7  button  e.stopPropagation()} onDoubleClick=
- `src/editor/pdf/Tabs.tsx`
  - 60  button  (showing ? focusPdfPane(id) : openPdfTab(id))} title=
  - 63  button  closePdfTab(id)}>
  - 71  button  setMenu(!menu)}>
  - 101  button  (pickPdfFromDevice(), onClose())}>From this device…
  - 102  button  (void openPdfFromDrive(), onClose())}>From Google Drive…
  - 106  button  (openPdfTab(s.id), onClose())}>
  - 111  button  void pdfStore.get(d.hash).then((bytes) =>
- `src/editor/pdf/Thumbs.tsx`
  - 51  button  setPdfPage(n)} className=
- `src/editor/pdf/ViewMenu.tsx`
  - 63  button  setOpen(!open)} className=
  - 99  button  set(
  - 108  button  set(
  - 111  button  set(
  - 114  button  set(
  - 124  button  set(
  - 134  button  (resetPdfLayout(sourceId), setOpen(false))} className=
- `src/editor/pdf/tools.tsx`
  - 27  button  updateMarkup(id,
  - 36  button  (updateMarkup(id,
  - 41  button  (setNote(m.note ?? ''), setNoting(true))}>
  - 46  button  topicFromMarkup(id)}> Make topic
  - 50  button  deleteMarkup(id)}>
  - 53  button  selectMarkup(null)}>
  - 85  button  sendHighlightsToOutline(source.id)}> Send all highlights to 
  - 113  button  topicFromMarkup(m.id)}> Make topic
  - 119  button  deleteMarkup(m.id)}>

### Picture viewer

- `src/editor/viewer/PictureViewer.tsx`
  - 274  button  showPreview(null)} className=
  - 279  button  step(-1)} className=
  - 281  button  step(1)} className=
  - 283  button  zoomBy(-1)} className=
  - 285  button  zoomBy(1)} className=
  - 302  button  rotatePicture(mapDoc, topicId, -90)}>
  - 305  button  rotatePicture(mapDoc, topicId, 90)}>
  - 308  button  flipPicture(mapDoc, topicId, 'x')}>
  - 312  button  setPermanent(true)}> Make permanent…
  - 350  button  setMarkId(null)}> Done
  - 412  button  Cancel
  - 415  button  void go()}>

### Preferences

- `src/app/PreferencesDialog.tsx`
  - 116  button  Close

### Read mode toolbar

- `src/app/ReadToolbar.tsx`
  - 59  button  void refresh()} className="flex items-center gap-1.5 rounded

