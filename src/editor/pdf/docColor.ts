/**
 * Document colour: how the PAGES look on screen (Light, Dark, Grey, Sepia). It is display only: a CSS filter on the page picture, nothing
 * else. The PDF file, the markup in the map, captured pictures, "Add as topic" pictures and "Download PDF with markup" are all drawn or
 * built from the PDF itself and never see it. Markup is drawn above the page picture, so it keeps its own colours.
 */
export type DocColor = 'light' | 'dark' | 'grey' | 'sepia'

export const DOC_COLORS: readonly DocColor[] = ['light', 'dark', 'grey', 'sepia']

export const DOC_COLOR_LABEL: Record<DocColor, string> = { light: 'Light', dark: 'Dark', grey: 'Grey', sepia: 'Sepia' }

/** The colour of the paper behind the picture (what shows before a page is drawn). */
export const PAPER: Record<DocColor, string> = { light: '#ffffff', dark: '#121212', grey: '#ffffff', sepia: '#f4ecd8' }

/** Dark inverts the page picture and turns the hue back half way round, so colours stay roughly themselves on a dark page. */
const FILTER: Record<DocColor, string | undefined> = {
  light: undefined,
  dark: 'invert(1) hue-rotate(180deg)',
  grey: 'grayscale(1)',
  sepia: 'sepia(0.75) contrast(0.95)',
}

export const docFilter = (c: DocColor | undefined): string | undefined => FILTER[c ?? 'light']

export const isDocColor = (v: unknown): v is DocColor => typeof v === 'string' && (DOC_COLORS as readonly string[]).includes(v)
