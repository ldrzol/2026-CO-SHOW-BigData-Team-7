import { Navigate, useLocation } from 'react-router-dom'
export default function LegacyReport() {
  const { search } = useLocation()
  return <Navigate to={`/analyze${search}`} replace />
}
