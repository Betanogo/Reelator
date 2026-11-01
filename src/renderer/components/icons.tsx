import { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 18, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  )
}

export const IconPlay = (p: P) => <Svg {...p}><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" /></Svg>
export const IconPause = (p: P) => <Svg {...p}><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></Svg>
export const IconUndo = (p: P) => <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>
export const IconRedo = (p: P) => <Svg {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Svg>
export const IconSplit = (p: P) => <Svg {...p}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></Svg>
export const IconTrash = (p: P) => <Svg {...p}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></Svg>
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const IconMinus = (p: P) => <Svg {...p}><path d="M5 12h14" /></Svg>
export const IconMedia = (p: P) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3z" fill="currentColor" /></Svg>
export const IconTransition = (p: P) => <Svg {...p}><path d="M4 5h7v14H4zM13 5h7v14h-7z" /><path d="m9 12 6 0M13 9.5 15.5 12 13 14.5" /></Svg>
export const IconFilter = (p: P) => <Svg {...p}><circle cx="9" cy="10" r="5.5" /><circle cx="15" cy="10" r="5.5" /><circle cx="12" cy="15" r="5.5" /></Svg>
export const IconText = (p: P) => <Svg {...p}><path d="M5 6V4h14v2M12 4v16M9 20h6" /></Svg>
export const IconSticker = (p: P) => <Svg {...p}><path d="M20 12a8 8 0 1 1-8-8h3l5 5z" /><path d="M15 4v5h5" /><path d="M9 14.5c1.5 1.5 4.5 1.5 6 0" /><circle cx="9.5" cy="10" r=".6" fill="currentColor" /></Svg>
export const IconEffect = (p: P) => <Svg {...p}><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></Svg>
export const IconExport = (p: P) => <Svg {...p}><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></Svg>
export const IconFolder = (p: P) => <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>
export const IconSave = (p: P) => <Svg {...p}><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M7 3v5h8V3M7 21v-7h10v7" /></Svg>
export const IconClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
export const IconMusic = (p: P) => <Svg {...p}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></Svg>
export const IconImage = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></Svg>
export const IconVolume = (p: P) => <Svg {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></Svg>
export const IconMute = (p: P) => <Svg {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="m17 9 5 6M22 9l-5 6" /></Svg>
export const IconFit = (p: P) => <Svg {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Svg>
export const IconReset = (p: P) => <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Svg>
export const IconSkipBack = (p: P) => <Svg {...p}><path d="M19 5v14L8 12z" fill="currentColor" stroke="none" /><path d="M5 5v14" /></Svg>
export const IconSkipFwd = (p: P) => <Svg {...p}><path d="M5 5v14l11-7z" fill="currentColor" stroke="none" /><path d="M19 5v14" /></Svg>
