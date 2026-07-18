import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { LeagueProvider } from './contexts/LeagueContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LeagueProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LeagueProvider>
    </BrowserRouter>
  </React.StrictMode>
)
