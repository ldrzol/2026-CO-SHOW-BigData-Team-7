import { useEffect, useRef } from 'react'
import { characterLayers, loadImage, paint, thumbLayers } from '../lib/character.js'

// tab, file 을 주면 그 파츠 하나만 썸네일로, 없으면 캐릭터 전신을 그려요
function CharacterCanvas({ character, tab, file, className }) {
  const ref = useRef(null)
  const size = tab ? 120 : 400

  useEffect(() => {
    let alive = true // 빠르게 바꿀 때 늦게 끝난 옛날 그림이 덮어쓰지 않도록
    const layers = tab ? thumbLayers(character, tab, file, size) : characterLayers(character)
    Promise.all(layers.map((l) => loadImage(l.file)))
      .then((imgs) => alive && paint(ref.current, layers, imgs))
      .catch(console.error)
    return () => {
      alive = false
    }
  }, [character, tab, file, size])

  return <canvas ref={ref} width={size} height={size} className={className} />
}

export default CharacterCanvas