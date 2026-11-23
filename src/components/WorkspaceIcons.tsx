import type { ReactNode } from 'react';

type IconProps = { size?: number };

function RoundedIcon({ size = 16, children }: IconProps & { children: ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export function NotebookIcon(props: IconProps) {
  return <RoundedIcon {...props}><rect x="5" y="3.5" width="14" height="17" rx="3" fill="currentColor" fillOpacity=".16" /><path d="M9 3.5v17m3.5-12h3.5m-3.5 4h3.5" /></RoundedIcon>;
}

export function LassoIcon(props: IconProps) {
  return <RoundedIcon {...props}><rect x="4" y="4.5" width="16" height="11" rx="5.5" strokeDasharray="3.2 2.5" fill="currentColor" fillOpacity=".16" /><path d="M12 15.5c0 2.7-2 4.3-4.5 4.3" /></RoundedIcon>;
}

export function LaserIcon(props: IconProps) {
  return <RoundedIcon {...props}><circle cx="16.5" cy="7.5" r="4.8" fill="var(--icon-danger, #ef4444)" fillOpacity=".16" stroke="none" /><circle cx="16.5" cy="7.5" r="2.4" fill="var(--icon-danger, #ef4444)" stroke="none" /><path d="M4.5 19.5 13 11" /><path d="m13 11 1.8-1.8" stroke="var(--icon-danger, #ef4444)" /></RoundedIcon>;
}

export function ThicknessIcon(props: IconProps) {
  return <RoundedIcon {...props}><rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" fillOpacity=".16" stroke="none" /><path d="M6 7h12" strokeWidth="1.3" /><path d="M6 12h12" /><path d="M6 17h12" strokeWidth="2.8" /></RoundedIcon>;
}

export function PenTiltIcon(props: IconProps) {
  return <RoundedIcon {...props}><path d="M4.5 19.5h15m-11 0L17 6.5" /><path fill="currentColor" fillOpacity=".16" d="M8.5 19.5h3.7a5.5 5.5 0 0 0-2-4.2Z" /></RoundedIcon>;
}

export function FitPageIcon(props: IconProps) {
  return <RoundedIcon {...props}><rect x="7" y="5" width="10" height="14" rx="2.5" fill="currentColor" fillOpacity=".16" /><path d="M3.5 8V6A2.5 2.5 0 0 1 6 3.5h2m12.5 4.5V6A2.5 2.5 0 0 0 18 3.5h-2M3.5 16v2A2.5 2.5 0 0 0 6 20.5h2M20.5 16v2a2.5 2.5 0 0 1-2.5 2.5h-2" /></RoundedIcon>;
}

export function EraseDocumentIcon(props: IconProps) {
  return <RoundedIcon {...props}><path d="M7 3.5h7l4 4V18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" fill="currentColor" fillOpacity=".16" /><path d="M14 4v4h4" /><path d="m9 11 5 5m0-5-5 5" stroke="var(--icon-danger, #ef4444)" /></RoundedIcon>;
}

function PdfArrow({ size, direction }: IconProps & { direction: 'in' | 'out' }) {
  return <RoundedIcon size={size}><path d="M10 3.5h6l4 4V18a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" fill="currentColor" fillOpacity=".16" /><path d="M16 4v4h4" /><path d={direction === 'in' ? 'M3 13h12m-3-3 3 3-3 3' : 'M15 13H3m3-3-3 3 3 3'} /></RoundedIcon>;
}

export function PdfImportIcon(props: IconProps) { return <PdfArrow {...props} direction="in" />; }
export function PdfExportIcon(props: IconProps) { return <PdfArrow {...props} direction="out" />; }
