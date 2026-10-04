import { useSearchParams } from 'react-router-dom'
import ReportView from '../components/ReportView.jsx'
import useReportData from '../hooks/useReportData.js'
import { previousPeriod } from '../lib/report.js'

export default function Analyze() {
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind') === 'week' ? 'week' : 'month'
  const candidate = params.get('anchor')
  const anchor = candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) ? candidate : previousPeriod(kind)
  const data = useReportData()
  return <ReportView key={`${kind}-${anchor}`} {...data} kind={kind} anchor={anchor} onPeriodChange={(nextKind, nextAnchor) => setParams({ kind: nextKind, anchor: nextAnchor })} />
}
