import { useEffect, useMemo, useRef } from 'react'
import { useEditor } from '../model/store'
import { computeLayout, formatTime } from '../model/timeline'
import { ASPECTS, AspectId } from '../model/types'
import { PreviewEngine } from '../engine/preview'
import { IconPause, IconPlay, IconSkipBack, IconSkipFwd } from './icons'

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const project = useEditor((s) => s.project)
  const playing = useEditor((s) => s.playing)
  const aspect = project.settings.aspect
  const total = useMemo(() => computeLayout(project).total, [project])
  const empty = project.clips.length === 0 && project.audio.length === 0

  useEffect(() => {
    let engine: PreviewEngine | null = null
    try {
      engine = new PreviewEngine(canvasRef.current!)
    } catch (e) {
      console.error(e)
      useEditor.getState().showToast('미리보기를 시작하지 못했어요 (WebGL2)')
    }
    return () => engine?.dispose()
  }, [])

  return (
    <section className="preview">
      <div className="stage">
        <canvas ref={canvasRef} style={{ aspectRatio: `${ASPECTS[aspect][0]} / ${ASPECTS[aspect][1]}` }} />
        {empty && (
          <div className="empty">
            미디어를 가져와서 타임라인으로 끌어다 놓으세요<br />
            <span style={{ fontSize: 12 }}>Space 재생 · S 분할 · Delete 삭제 · Ctrl+Z 실행 취소</span>
          </div>
        )}
      </div>
      <div className="transport">
        <div className="timecode">
          <Clock /> <span>/ {formatTime(total, project.settings.fps)}</span>
        </div>
        <div className="center">
          <button className="icon-btn" title="처음으로 (Home)" onClick={() => useEditor.getState().setPlayhead(0)}><IconSkipBack size={16} /></button>
          <button className="play-btn" title="재생/일시정지 (Space)" onClick={() => togglePlay()}>
            {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
          </button>
          <button className="icon-btn" title="끝으로 (End)" onClick={() => useEditor.getState().setPlayhead(total)}><IconSkipFwd size={16} /></button>
        </div>
        <div className="right">
          <span className="timecode">비율</span>
          <select
            className="ratio-select"
            value={aspect}
            onChange={(e) => useEditor.getState().updateSettings({ aspect: e.target.value as AspectId })}
          >
            {(Object.keys(ASPECTS) as AspectId[]).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
    </section>
  )
}

function Clock() {
  const t = useEditor((s) => s.playhead)
  const fps = useEditor((s) => s.project.settings.fps)
  return <b>{formatTime(t, fps)}</b>
}

export function togglePlay() {
  const st = useEditor.getState()
  if (st.project.clips.length === 0 && st.project.audio.length === 0) return
  st.setPlaying(!st.playing)
}
