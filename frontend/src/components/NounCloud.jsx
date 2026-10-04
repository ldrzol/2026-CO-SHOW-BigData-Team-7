import { useEffect, useMemo, useState } from 'react'
import { cloudLayout } from '../lib/cloudLayout.js'

export default function NounCloud({ diaries, onSelect }) {
  const [result, setResult] = useState({ state: 'loading', words: [] })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let worker
    try {
      worker = new Worker(new URL('../lib/nounCloud.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }) => setResult(data)
      worker.onerror = () => setResult({ state: 'error', words: [] })
      worker.postMessage(diaries.map(({ diaryDate, body }) => ({ diaryDate, body })))
    } catch {
      // 브라우저가 Worker를 지원하지 않을 때도 추정 단어를 보여주지 않습니다.
      queueMicrotask(() => setResult({ state: 'error', words: [] }))
    }
    return () => worker?.terminate()
  }, [diaries, attempt])
  const layout = useMemo(() => cloudLayout(result.words), [result.words])
  if (result.state === 'loading') return <p className="analyze__empty" role="status">기록 속 단어를 모으고 있어요…</p>
  if (result.state === 'error') return <div role="status"><p className="analyze__empty">단어를 불러오지 못했어요.</p><button className="analyze__ghost" onClick={() => { setResult({ state: 'loading', words: [] }); setAttempt((n) => n + 1) }}>다시 불러오기</button></div>
  if (!result.words.length) return <p className="analyze__empty">표시할 단어가 없어요.</p>
  return <div className="cloud" style={{ aspectRatio: `${layout.width} / ${layout.height}` }} aria-label="자주 나온 명사">
    {layout.words.map((w) => <button key={w.word} className="cloud__word" style={{ left: `${w.x / layout.width * 100}%`, top: `${w.y / layout.height * 100}%`, fontSize: `${w.size / layout.width * 100}cqw` }} aria-label={`${w.word} · ${w.count}번 나온 기록 보기`} onClick={() => onSelect(w)}>{w.word}</button>)}
  </div>
}
