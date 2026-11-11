import type { ComponentType, ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }
export type CustomIcon = ComponentType<IconProps>

/**
 * The icons lucide does not have (page layouts, fit modes, and a few topic actions), drawn to match it: a 24 x 24 box, the current text
 * colour, round line ends, and the same stroke width (1.9 unless the caller says otherwise). Keep any new icon here to these rules, so
 * every icon of the app reads as one set (rule 8, icons first).
 */
function make(name: string, body: ReactNode): CustomIcon {
  const C: CustomIcon = ({ size = 24, strokeWidth = 1.9, className, ...rest }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...rest}>
      {body}
    </svg>
  )
  C.displayName = name
  return C
}

/** One page: a tall page with two lines of text. */
export const PageOne = make('PageOne', (
  <>
    <rect x="6.5" y="3" width="11" height="18" rx="1.5" />
    <path d="M9.5 8h5M9.5 12h5" />
  </>
))

/** Two pages side by side, like an open book. */
export const PageTwo = make('PageTwo', (
  <>
    <rect x="2.5" y="4.5" width="9" height="15" rx="1.5" />
    <rect x="12.5" y="4.5" width="9" height="15" rx="1.5" />
    <path d="M5 9.5h4M15 9.5h4" />
  </>
))

/** The first page alone: an empty (dashed) place on the left, the first page on the right, then the pairs. */
export const PageFirstAlone = make('PageFirstAlone', (
  <>
    <rect x="2.5" y="4.5" width="9" height="15" rx="1.5" strokeDasharray="2 1.6" opacity="0.85" />
    <rect x="12.5" y="4.5" width="9" height="15" rx="1.5" />
    <path d="M15 9.5h4" />
  </>
))

/** Scrolling: a page with an up-and-down arrow beside it. */
export const Scrolling = make('Scrolling', (
  <>
    <rect x="3.5" y="4" width="11" height="16" rx="1.5" />
    <path d="M19 5v14M19 5l-2 2.2M19 5l2 2.2M19 19l-2-2.2M19 19l2-2.2" />
  </>
))

/** 1-page flipping: a page and a curved arrow turning it by one. */
export const FlipOne = make('FlipOne', (
  <>
    <rect x="3.5" y="7" width="10" height="14" rx="1.5" />
    <path d="M10 4.5c4.5-.5 8.5 1.6 9.5 6M19.5 10.5l-2.4-2M19.5 10.5l1.8-2.6" />
  </>
))

/** Right-to-left reading: a spread with an arrow under it pointing left (the first page is on the right). */
export const RightToLeft = make('RightToLeft', (
  <>
    <rect x="3.5" y="3" width="8" height="10" rx="1.4" />
    <rect x="12.5" y="3" width="8" height="10" rx="1.4" />
    <path d="M20.5 18.5h-17M3.5 18.5l3-3M3.5 18.5l3 3" />
  </>
))

/** Fit width: the two sides of the window with an arrow across. */
export const FitWidth = make('FitWidth', (
  <>
    <path d="M3.5 4v16M20.5 4v16" />
    <path d="M7.5 12h9M7.5 12l2.6-2.6M7.5 12l2.6 2.6M16.5 12l-2.6-2.6M16.5 12l-2.6 2.6" />
  </>
))

/** Fit page: a whole page inside corner marks. */
export const FitPage = make('FitPage', (
  <>
    <path d="M3.5 8.5v-5h5M15.5 3.5h5v5M20.5 15.5v5h-5M8.5 20.5h-5v-5" />
    <rect x="9" y="8" width="6" height="8" rx="0.8" />
  </>
))

/** Fit height: the top and bottom of the window with an arrow between. */
export const FitHeight = make('FitHeight', (
  <>
    <path d="M4 3.5h16M4 20.5h16" />
    <path d="M12 7.5v9M12 7.5l-2.6 2.6M12 7.5l2.6 2.6M12 16.5l-2.6-2.6M12 16.5l2.6-2.6" />
  </>
))

/** Actual size: 1 : 1 inside a frame. */
export const ActualSize = make('ActualSize', (
  <>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.2" />
    <path d="M6.6 11l1.7-1.2v5.4M15.7 11l1.7-1.2v5.4" />
    <path d="M12 11.4v.01M12 14.2v.01" strokeWidth="2.3" />
  </>
))

/** Presentation: a screen with a play mark. */
export const Presentation = make('Presentation', (
  <>
    <rect x="2.5" y="3.5" width="19" height="12.5" rx="1.8" />
    <path d="M12 16v4M8 20.5h8" />
    <path d="M10.3 7.3v4.4l3.9-2.2z" />
  </>
))

/** A new topic after the one that is chosen: a topic above, a dashed new one below. */
export const SiblingAfter = make('SiblingAfter', (
  <>
    <rect x="2.5" y="3.5" width="11" height="6" rx="1.4" />
    <rect x="2.5" y="14.5" width="11" height="6" rx="1.4" strokeDasharray="2.4 2.2" />
    <path d="M19.5 12v6M16.5 15h6" />
  </>
))

/** A new branch: a centre dot with a line out to two topics. */
export const NewBranch = make('NewBranch', (
  <>
    <circle cx="4.5" cy="12" r="2" />
    <path d="M6.5 12H10M10 6.2v11.6M10 6.2h4.5M10 17.8h4.5" />
    <rect x="14.5" y="3.5" width="7" height="5.4" rx="1.3" />
    <rect x="14.5" y="15.1" width="7" height="5.4" rx="1.3" />
  </>
))

/** Make a topic: a topic box with a plus. */
export const NewTopic = make('NewTopic', (
  <>
    <rect x="2.5" y="7" width="12" height="10" rx="2" />
    <path d="M19 8.5v7M15.5 12h7" />
  </>
))

export const CUSTOM_ICONS = {
  pageOne: PageOne,
  pageTwo: PageTwo,
  pageFirstAlone: PageFirstAlone,
  scrolling: Scrolling,
  flipOne: FlipOne,
  rightToLeft: RightToLeft,
  fitWidth: FitWidth,
  fitPage: FitPage,
  fitHeight: FitHeight,
  actualSize: ActualSize,
  presentation: Presentation,
  siblingAfter: SiblingAfter,
  newBranch: NewBranch,
  newTopic: NewTopic,
} as const
