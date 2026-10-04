import { emotionIcon } from '../lib/report.js'

export default function EmotionIcon({ emotion, size = 28, decorative = false }) {
  const src = emotionIcon(emotion)
  return src ? <img className="emotion-icon" src={src} width={size} height={size} alt={decorative ? '' : emotion} /> : null
}
