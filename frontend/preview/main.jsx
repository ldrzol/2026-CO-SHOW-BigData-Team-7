import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Preview } from './Preview.jsx'
import CareGuide from '../src/pages/CareGuide.jsx'
import '../src/index.css'
import '../src/App.css'
import '../src/report.css'

if (import.meta.env.DEV) createRoot(document.getElementById('root')).render(<StrictMode><HashRouter><Routes><Route path="/" element={<Navigate to="/analyze" replace />} /><Route path="/analyze" element={<Preview />} /><Route path="/analyze/care" element={<CareGuide />} /></Routes></HashRouter></StrictMode>)
