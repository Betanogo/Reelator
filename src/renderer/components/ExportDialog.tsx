import { useRef, useState } from 'react'
import { useEditor } from '../model/store'
import { computeLayout, formatShort } from '../model/timeline'
import { frameSize } from '../model/types'
import { ExportProgress, exportProject } from '../engine/exporter'
import { IconClose, IconExport, IconFolder } from './icons'

type Phase = 'setup' | 'running' | 'done' | 'error'

const RESOLUTIONS: [number, string][] = [[720, '720p'], [1080, '1080p (권장)'], [1440, '2K'], [2160, '4K']]

export function ExportDialog({ onClose }: { onClose(): void }) {
  const project = useEditor((s) => s.project)
  const [shortSide, setShortSide] = useState(1080)
  const [fps, setFps] = useState(project.settings.fps)
  const [quality, setQuality] = useState<'high' | 'medium' | 'small'>('high')
  const [phase, setPhase] = useState<Phase>('setup')
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState('')
  const [outPath, setOutPath] = useState('')
  const cancelled = useRef(false)

  const [w, h] = frameSize(project.settings.aspect, shortSide)
  const total = computeLayout(project).total

  const start = async () => {
    useEditor.getState().setPlaying(false)
    const path = await window.reelator.exportSaveDialog(project.name || 'Reelator')
    if (!path) return
    setOutPath(path)
    cancelled.current = false
    setPhase('running')
    setProgress(null)
    try {
      const r = await exportProject(project, { outPath: path, shortSide, fps, quality }, setProgress, () => cancelled.current)
      if (r === 'cancelled') { setPhase('setup'); return }
      setPhase('done')
    } catch (e) {
      setError((e as Error).message)
      setPhase('error')
    }
  }

  const pct = progress ? (progress.frame / progress.total) * 100 : 0

  return (
    <div className="overlay">
      <div className="dialog">
        <div className="dhead">
          내보내기
          {phase !== 'running' && <button className="icon-btn" onClick={onClose}><IconClose size={16} /></button>}
        </div>

        {phase === 'setup' && (
          <>
            <div className="dbody">
              <div className="row">
                <label>해상도</label>
                <select className="select" value={shortSide} onChange={(e) => setShortSide(Number(e.target.value))}>
                  {RESOLUTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="row">
                <label>프레임</label>
                <select className="select" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                  {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
                </select>
              </div>
              <div className="row">
                <label>화질</label>
                <select className="select" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
                  <option value="high">높음</option>
                  <option value="medium">보통</option>
                  <option value="small">작은 용량</option>
                </select>
              </div>
              <div className="info-list" style={{ marginTop: 14 }}>
                <span>출력 크기</span><span>{w} × {h}</span>
                <span>길이</span><span>{formatShort(total)}</span>
                <span>형식</span><span>MP4 (H.264 + AAC)</span>
              </div>
            </div>
            <div className="dfoot">
              <button className="btn" onClick={onClose}>취소</button>
              <button className="btn primary" onClick={start}><IconExport size={15} /> 내보내기</button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <>
            <div className="dbody">
              <div style={{ fontSize: 12.5 }}>렌더링 중… 창을 닫지 마세요</div>
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
              <div className="export-meta">
                <span>{Math.floor(pct)}% · {progress ? `${progress.frame}/${progress.total} 프레임` : '준비 중'}</span>
                <span>{progress ? `남은 시간 약 ${formatShort(Math.max(0, progress.eta))} · ${progress.fps.toFixed(1)} fps` : ''}</span>
              </div>
            </div>
            <div className="dfoot">
              <button className="btn" onClick={() => { cancelled.current = true }}>취소</button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="dbody">
              <div style={{ fontSize: 13 }}>✅ 내보내기가 끝났어요.</div>
              <div className="hint" style={{ marginTop: 10, wordBreak: 'break-all' }}>{outPath}</div>
            </div>
            <div className="dfoot">
              <button className="btn" onClick={() => window.reelator.showInFolder(outPath)}><IconFolder size={15} /> 폴더에서 보기</button>
              <button className="btn primary" onClick={onClose}>닫기</button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="dbody">
              <div className="error-box">{error}</div>
            </div>
            <div className="dfoot">
              <button className="btn" onClick={() => setPhase('setup')}>다시 시도</button>
              <button className="btn primary" onClick={onClose}>닫기</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
