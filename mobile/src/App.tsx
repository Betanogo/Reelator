import { useEffect, useState } from 'react'
import { useEditor } from '@shared/model/store'
import { Home } from './Home'
import { Editor } from './Editor'
import { onImportProgress } from './platform'
import { closeProject } from './session'
import { pushLayer, back } from './nav'

export default function App() {
  const [screen, setScreen] = useState<'home' | 'editor'>('home')
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useEditor((s) => s.toast)

  useEffect(() => {
    onImportProgress((done, total) => setBusy(total ? `불러오는 중… ${done}/${total}` : null))
  }, [])

  const openEditor = () => {
    setScreen('editor')
    pushLayer(() => {
      closeProject().finally(() => setScreen('home'))
    })
  }

  return (
    <>
      {screen === 'home' ? <Home onOpen={openEditor} setBusy={setBusy} /> : <Editor onClose={back} />}
      {busy && (
        <div className="busy-veil">
          <div><div className="spinner" />{busy}</div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
