import { SVGProps } from 'react'

export * from '@shared/components/icons'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 22, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  )
}

export const IconBack = (p: P) => <Svg {...p}><path d="m15 5-7 7 7 7" /></Svg>
export const IconCheck = (p: P) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
export const IconCopy = (p: P) => <Svg {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Svg>
export const IconAdjust = (p: P) => <Svg {...p}><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></Svg>
export const IconScreen = (p: P) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6v6H9z" /></Svg>
export const IconLeft = (p: P) => <Svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>
export const IconRight = (p: P) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
export const IconRatio = (p: P) => <Svg {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10v4M17 10v4" /></Svg>
export const IconPalette = (p: P) => <Svg {...p}><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.6-1.3-.6-2.1 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4c0-4.9-4-8.8-9-8.8z" /><circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="10" cy="7.5" r="1" fill="currentColor" /><circle cx="14.5" cy="7.5" r="1" fill="currentColor" /></Svg>
export const IconMore = (p: P) => <Svg {...p}><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></Svg>
export const IconShare = (p: P) => <Svg {...p}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></Svg>
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>
export const IconFade = (p: P) => <Svg {...p}><path d="M3 19 9 7h6l6 12" /></Svg>
