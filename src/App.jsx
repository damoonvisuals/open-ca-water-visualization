import { useEffect, useRef, useState } from 'react';
import MapView from './MapView';
import { asset, searchMaps } from './data';

function Drop({ small = false }) {
  return <svg width={small ? 21 : 30} height={small ? 25 : 36} viewBox="0 0 30 36" fill="none" aria-hidden="true"><path d="M15 2C12 8 3 16 3 23a12 12 0 0 0 24 0C27 16 18 8 15 2Z" stroke="currentColor" strokeWidth="2"/><path d="M6 23c4-4 7 4 11 0s6-2 9-1M7 28c4-4 7 4 11 0s5-2 7-1" stroke="currentColor" strokeWidth="1.5"/></svg>;
}
function ReferenceDialog({ mode, close, selected, catalog }) {
  const ref = useRef(null);
  const [tab, setTab] = useState(mode);
  useEffect(() => { ref.current.showModal(); }, []);
  const reportLink = page => `${asset(catalog.report.url)}#page=${page}`;
  return <dialog ref={ref} className="reference-dialog" aria-labelledby="reference-title" onCancel={close} onClick={e => { if (e.target === ref.current) close(); }}>
    <header className="dialog-header"><div><p className="eyebrow">BEHIND THE MAP</p><h2 id="reference-title">Sources & methodology</h2></div><button className="icon-button" onClick={close} aria-label="Close sources and methodology" autoFocus>×</button></header>
    <nav className="dialog-tabs" aria-label="Reference sections">{[['image','Original map'],['methodology','Methodology'],['data','Download data']].map(([id,label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <div className="dialog-content">
      {tab === 'image' && <><div className="image-heading"><div><h3>{selected.name}</h3><p>Appendix A · PDF page {selected.page} · October 2012</p></div><a href={reportLink(selected.page)} target="_blank" rel="noreferrer">Open PDF ↗</a></div><a href={asset(selected.image)} target="_blank" rel="noreferrer" aria-label={`Open full original map for ${selected.name}`}><img className="original-image" src={asset(selected.image)} alt={`Original TNC 2012 appendix map of surface drinking water source watersheds for ${selected.name}, with protection and land-use categories, service areas, and aqueducts.`}/></a><p className="caption">Original map produced for The Nature Conservancy, 2012. The interactive atlas retains these legend categories, pink service areas, red routes, and the direction symbols printed in this map. All traced features remain approximate.</p>{selected.originalInferenceNoted && <p className="info-note">This page lists “TNC inferred” among its sources. The report does not identify which individual boundaries were inferred.</p>}</>}
      {tab === 'methodology' && <><div className="reference-intro"><p className="eyebrow">THE ORIGINAL STUDY</p><h3>From a water source to the land upstream.</h3><p>Kirk Klausmeyer and Katherine Fitzgerald’s <em>Where Does California’s Water Come From?</em> was published by The Nature Conservancy of California in October 2012 (version 1.1).</p></div><ol className="method-steps">{catalog.methodology.map(step => <li key={step.title}><h4>{step.title}</h4><p>{step.text}</p><div>{step.pages.map(page => <a key={page} href={reportLink(page)} target="_blank" rel="noreferrer">PDF p. {page} ↗</a>)}</div></li>)}</ol><div className="limitations"><h3>How to read this atlas</h3><ul>{catalog.limitations.map(note => <li key={note}>{note}</li>)}</ul></div><p className="caption">The 18 appendix pages comprise 15 individual-city maps, two grouped maps covering 15 cities, and one statewide overview. The statewide map is a distinct source image, not a calculated union of the city maps.</p></>}
      {tab === 'data' && <><div className="reference-intro"><p className="eyebrow">A STATIC, OPEN ATLAS</p><h3>The data travels with the map.</h3><p>All watershed geometry, city locations, and source notes are bundled files. There is no application API, database, account, or Mapbox token.</p></div><div className="download-list">
        {[
          [selected.layers,`${selected.name}: detailed map layers`,'Protection, land use, service areas, aqueducts and printed direction symbols · GeoJSON'],
          ['data/watersheds.geojson','Watershed footprints','18 approximate MultiPolygon features · WGS84 GeoJSON'],
          ['data/catalog.json','City & source catalog','30 city markers, 18 map records, citations and methodology · JSON'],
          ['data/registration-quality.json','Georeferencing notes','Landmarks and fit residuals for every appendix map · JSON'],
          ['report.pdf','Original 2012 report','The complete source document · PDF'],
        ].map(([url,title,description]) => <a key={url} href={asset(url)} download><div><strong>{title}</strong><span>{description}</span></div><span aria-hidden="true">↓</span></a>)}
      </div><p className="info-note">{catalog.approximation}</p><h4>Free basemaps</h4><p>The simple basemap ships with the app and uses public-domain <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth</a> boundaries. The optional detailed basemap requests tiles from <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a>, with OpenMapTiles and OpenStreetMap attribution. It requires an internet connection but no key, account, or billable token.</p><p className="caption">Source artwork is credited to The Nature Conservancy. The repository’s software license does not imply a separate license grant for the report or its artwork.</p></>}
    </div>
  </dialog>;
}

export default function App({ catalog, watersheds, basemap }) {
  const initialId = () => {
    const id = new URLSearchParams(location.hash.slice(1)).get('map');
    return catalog.maps.some(map => map.id === id) ? id : 'california';
  };
  const [selectedId, setSelectedId] = useState(initialId);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('All regions');
  const [modal, setModal] = useState(null);
  const [fitRequest, setFitRequest] = useState(0);
  const searchRef = useRef(null);
  const selected = catalog.maps.find(map => map.id === selectedId);
  const results = searchMaps(catalog.maps, query, region);
  function choose(id) {
    setSelectedId(id); setFitRequest(n => n+1);
    if (new URLSearchParams(location.hash.slice(1)).get('map') !== id) history.pushState(null, '', `#map=${id}`);
  }
  useEffect(() => {
    const onHash = () => setSelectedId(initialId());
    window.addEventListener('hashchange', onHash); window.addEventListener('popstate', onHash);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onHash); };
  }, []);
  return <>
    <a className="skip-link" href="#explore">Skip to city search</a>
    <header className="site-header"><a className="brand" href="#map=california" onClick={() => choose('california')}><span className="brand-mark"><Drop small/></span><span>California <strong>Water Atlas</strong></span></a><div className="header-right"><span className="edition">A watershed perspective · 2012</span><button className="text-button" onClick={() => setModal('methodology')}>About the data <span aria-hidden="true">↗</span></button></div></header>
    <main className="atlas-layout">
      <aside className="explorer" id="explore" aria-label="Find a city watershed">
        <div className="explorer-intro"><p className="eyebrow"><span className="tiny-line"/> FOLLOW THE WATER</p><h1>Where does your<br/> <em>water come from?</em></h1><p className="intro-text">Explore the landscapes that supply California’s drinking water, from local streams to distant mountain ranges.</p><div className="stats"><div><strong>30</strong><span>cities represented</span></div><div><strong>18</strong><span>appendix maps</span></div><div><strong>2012</strong><span>report year</span></div></div></div>
        <div className="search-controls"><label className="search-box"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="m12 12 5 5" stroke="currentColor" strokeWidth="1.5"/></svg><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find your city…" aria-label="Search cities"/>{query && <button className="clear-search" onClick={() => { setQuery(''); searchRef.current.focus(); }} aria-label="Clear search">×</button>}</label><label className="region-filter"><span>Region</span><select value={region} onChange={e => setRegion(e.target.value)} aria-label="Filter by region">{['All regions','Bay Area','Central Valley','North Coast','Southern California','Statewide'].map(r => <option key={r}>{r}</option>)}</select></label></div>
        <div className="results-heading"><span>EXPLORE THE APPENDIX</span><span role="status">{results.length} {results.length === 1 ? 'map' : 'maps'}</span></div>
        <div className="city-list" aria-label="Appendix maps">{results.map(entry => <button className={`city-row ${entry.id === selectedId ? 'selected' : ''}`} key={entry.id} onClick={() => choose(entry.id)} aria-pressed={entry.id === selectedId}><span className="row-symbol">{entry.id === 'california' ? '◉' : entry.cities.length > 1 ? '◌' : '○'}</span><span className="row-text"><strong>{entry.name}</strong><span>{entry.cities.length > 1 ? `${entry.cities.length} cities · Shared source map` : entry.region}</span>{query && entry.cities.length > 1 && <small>{entry.cities.filter(c => c.toLowerCase().includes(query.toLowerCase().trim())).join(', ')}</small>}</span><span className="row-arrow" aria-hidden="true">↗</span></button>)}{!results.length && <div className="empty-results"><h3>No matching maps</h3><p>Try another city or broaden the region filter.</p><button onClick={() => { setQuery(''); setRegion('All regions'); }}>Reset filters</button></div>}</div>
        <footer className="explorer-footer"><Drop small/><p>Surface water connects us.<br/><span>Based on research by The Nature Conservancy.</span></p></footer>
      </aside>
      <div className="map-column">
        <MapView catalog={catalog} watersheds={watersheds} basemap={basemap} selected={selected} choose={choose} fitRequest={fitRequest}/>
        <section className="selection-detail" aria-label="Selected watershed details"><div className="detail-main"><div className="detail-eyebrow"><p className="eyebrow">{selected.id === 'california' ? 'THE BIG PICTURE' : 'SELECTED SOURCE MAP'}</p><span>Appendix A · p. {selected.page}</span></div><h2>{selected.name}</h2><p className="detail-description">{selected.description}</p>{selected.cities.length > 1 && <p className="group-members"><strong>Cities:</strong> {selected.cities.join(', ')}</p>}<p className="historical-note">Historical surface-water sources · Approximate boundaries · Includes standby sources</p></div><div className="detail-sources"><p className="eyebrow">{selected.id === 'california' ? 'READ THE LANDSCAPE' : 'SOURCE SYSTEMS SHOWN'}</p>{selected.id === 'california' ? <p className="source-explainer">Choose a city to see how its source watersheds reach far beyond the city itself.</p> : <ul>{selected.sources.map(source => <li key={source}><span/> {source}</li>)}</ul>}<button className="original-button" onClick={() => setModal('image')}><img src={asset(selected.image)} alt=""/><span>View original map<small>Compare with the 2012 appendix</small></span><span aria-hidden="true">↗</span></button></div></section>
      </div>
    </main>
    {modal && <ReferenceDialog key={modal} mode={modal} close={() => setModal(null)} selected={selected} catalog={catalog}/>}
  </>;
}
