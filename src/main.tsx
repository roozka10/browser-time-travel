import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import App from './App'

// popup.html declares this class directly so Chrome gets a compact popup before
// JavaScript has a chance to render. This only keeps local development aligned.
document.body.classList.toggle('popup-mode', window.location.pathname.endsWith('/popup.html'))

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
