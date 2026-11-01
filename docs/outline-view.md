# Outline view

The Outline is the same map as an indented list. It is **a second view of the same data, never a copy**.

## What it shows
- Every topic is one row: a fold arrow, a bullet, its marks and number, and its text in an editable box.
- **Pictures are shown.** A topic with a picture shows it under its text, in proportion: at most **320 px wide** on a desktop, and the **full width of the row on a phone** (a narrow list). A very tall picture is limited to 420 px high and is not stretched.
- A topic with **only a picture** shows the grey word *Picture* in its text box, and an empty topic shows *Empty topic*. These are hints, not text: nothing is stored.
- If the topic also has text, the text comes first and the picture is below it.
- A topic holds **one picture** (that is how the map is stored). To show several pictures, add them as topics: adding several at once already makes one subtopic for each.
- A line break inside a topic (for example the central topic of IND AS 116, "IND AS 116" and "Leases") is shown here as a space: "IND AS 116 Leases". The box has one line, and looking at a topic never changes its stored text.

## Pictures use the same pipeline as the map
- Small version first (about 256 px); the full picture only when it is shown large (over about 300 px of screen), and only once the list has stopped moving, a few at a time.
- While scrolling the small version is used. Pictures far from the screen are not read or decoded.
- The decoded pictures share the map's memory budget (150 MB desktop, 60 MB phone and tablet), least recently used first.
- **Only the rows near the screen are drawn** (the window plus about one screen either side). Every row's height is known from the picture's proportions and the list width, so scrolling needs no measuring. A 500-picture map draws at most about 9 rows.

## Working with a picture
- **Click the picture** to select its topic and open it larger (the same preview as in the map): zoom with + and -, scroll to move around it, previous and next with the arrow keys, **Esc** closes.
- In **Edit mode** the preview also has **Replace**, **Crop again** (while the original is still held in this session), **Resize** (opens the picture settings) and **Delete picture**.
- The selected row has an **Add picture** (or **Replace picture**) button. It opens the same *Add picture* menu as everywhere, so the **Compressed or Original** choice and "don't ask again" work the same.
- The picture itself shows **Replace** and **Delete** buttons when its row is selected.
- In **Read mode** the pictures show and open in the preview, with none of the editing buttons.
- Each of these is **one undo step**, and Undo and Redo reach the map as well.

## Map and Outline stay together
- **Order.** The outline lists the children of each topic in their stored order. Switching views never reorders anything. Reordering (Alt+Up, Alt+Down), indenting (Tab), outdenting (Shift+Tab), adding (Enter) and deleting in the outline are the same commands as in the map.
- **Branch direction** (Balanced, Clockwise, Reverse) only changes where the **map** draws the main topics. The outline always shows the logical order, whatever direction is chosen.
- **Edits.** Text, adding and deleting topics, moving, folding, notes, tags and pictures change the one document, so both views update at once.
- **Folding.** The fold state is shared. Folding a branch in the outline folds it in the map, and the other way round.
- **Selection.** Selecting a topic in the map selects it in the outline and scrolls to it. Selecting or typing in a row of the outline selects it in the map, and going back to the map brings it into view.
- **Scroll position.** The outline remembers where it was scrolled to for each file when you switch to the map and back.
- **Saving.** Autosave, the Saved indicator and Read mode are the same in both views.

## Not in the outline
- Dragging a row to reorder it (use Alt+Up and Alt+Down).
- More than one picture on a topic.
