/**
 * One size for every icon control (rule 8, icons first): the icon, the box it sits in, and the touch target. Menus and bars use these and
 * nothing else, so the same icon looks the same wherever it appears.
 */
export const ICON_PX = 20
/** The box of an icon button on a pointer device and on a touch screen (touch targets are at least 44 px). */
export const BOX_PX = 36
export const TOUCH_PX = 44
/** The Tailwind classes that give a control that box (square, with the touch size on a touch screen). */
export const ICON_BOX = 'h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11'
/** The look of the chosen option: a highlighted background, never a tick and words. */
export const SELECTED = 'bg-brand/20 text-ink ring-1 ring-brand/60'
export const UNSELECTED = 'text-muted hover:bg-bg hover:text-ink'
