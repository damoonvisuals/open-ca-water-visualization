import React, { Component, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadAtlas } from './data';
import App from './App';
import './styles.css';

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main className="load-screen"><h1>The atlas couldn’t open.</h1><p>{this.state.error.message}</p><button onClick={() => location.reload()}>Try again</button></main>;
    return this.props.children;
  }
}
function AtlasLoader() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadAtlas(controller.signal).then(setData).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [attempt]);
  if (error) return <main className="load-screen"><p className="eyebrow">CALIFORNIA WATER ATLAS</p><h1>The data couldn’t load.</h1><p role="alert">{error}</p><button onClick={() => { setError(null); setAttempt(n => n + 1); }}>Try again</button></main>;
  if (!data) return <main className="load-screen" role="status"><span className="loading-drop">◒</span><p>Opening the California Water Atlas…</p></main>;
  return <App {...data}/>;
}
createRoot(document.getElementById('root')).render(<StrictMode><ErrorBoundary><AtlasLoader/></ErrorBoundary></StrictMode>);
