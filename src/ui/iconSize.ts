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
/**
 * The look of a floating action button: the brand green (token `brand`) with the token's own ink (`brand-ink`: white in light mode, a dark
 * teal in dark mode, because white on the light dark-mode teal would not pass the contrast check). Hover and pressed are the same green a
 * little darker (brightness 95 % and 90 %: the contrast of the icon stays above 3.5:1); the keyboard focus is the app's global 2 px brand ring with an offset, so it shows on the green.
 */
export const BRAND_FAB = 'border-transparent bg-brand text-brand-ink shadow-lg hover:brightness-95 active:brightness-90'
/** The same for a button that goes through IconButton, whose own colours it has to win over. */
export const BRAND_FAB_ICON = '!border-transparent !bg-brand !text-brand-ink shadow-lg hover:!bg-brand hover:brightness-95 active:brightness-90'
