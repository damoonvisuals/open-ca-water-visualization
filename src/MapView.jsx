import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, NavigationControl, Popup, ScaleControl, Source } from 'react-map-gl/maplibre';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { asset, boundsFor } from './data';
import { LEGEND, regionColor } from './layers';

maplibregl.setWorkerUrl(workerUrl);
const stateLabels = [ ['CALIFORNIA',-119.6,36.1], ['NEVADA',-116.6,39.3], ['OREGON',-120.6,43.5], ['UTAH',-111.6,39.4], ['ARIZONA',-111.6,34.4], ['COLORADO',-105.8,39.1], ['WYOMING',-107.3,43], ['NEW MEXICO',-105.8,34.5], ['IDAHO',-114.7,44] ];
export default function MapView({ catalog, watersheds, basemap, selected, choose, fitRequest }) {
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [renderedRoutes, setRenderedRoutes] = useState(0);
  const [detailed, setDetailed] = useState(false);
  const [basemapError, setBasemapError] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [compare, setCompare] = useState(false);
  const [popup, setPopup] = useState(null);
  const [hover, setHover] = useState(false);
  const [thematic, setThematic] = useState(null);
  const [layerError, setLayerError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [hidden, setHidden] = useState([]);
  const [legendOpen, setLegendOpen] = useState(true);
  const cache = useRef(new globalThis.Map());
  const layers = thematic?.page === selected.page ? thematic.data : null;
  useEffect(() => {
    const controller = new AbortController();
    setLayerError(null);
    setRendered(false);
    const cached = cache.current.get(selected.page);
    if (cached) {
      setThematic({ page: selected.page, data: cached });
      return () => controller.abort();
    }
    fetch(asset(selected.layers), { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid layer data');
      cache.current.set(selected.page, data);
      setThematic({ page: selected.page, data });
    }).catch(error => { if (error.name !== 'AbortError') setLayerError(error.message); });
    return () => controller.abort();
  }, [selected.page, retry]);
  const available = new Set(layers?.features.map(f => f.properties.category));
  const visibleFilter = ['!', ['in', ['get', 'category'], ['literal', hidden]]];
  function toggleLayer(id) {
    setHidden(values => values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
    setPopup(null);
  }
  const feature = watersheds.features.find(f => f.properties.page === selected.page);
  const cities = catalog.cities.filter(c => selected.id === 'california' || c.mapId === selected.id);
  const basicStyle = useMemo(() => ({ version: 8, sources: { geography: { type: 'geojson', data: basemap, attribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a>' } }, layers: [
    { id: 'ocean', type: 'background', paint: { 'background-color': '#dce9e8' } },
    { id: 'land', type: 'fill', source: 'geography', paint: { 'fill-color': '#f1f0e8' } },
    { id: 'borders', type: 'line', source: 'geography', paint: { 'line-color': '#b7beb3', 'line-width': 1, 'line-dasharray': [3,2] } }
  ] }), [basemap]);
  const otherFeatures = useMemo(() => ({ type: 'FeatureCollection', features: watersheds.features.filter(f => f.properties.page !== 14 && f.properties.page !== selected.page) }), [watersheds, selected.page]);
  function fit() {
    mapRef.current?.fitBounds(boundsFor(feature, cities), { padding: window.innerWidth > 760 && legendOpen ? { top: 70, left: 75, bottom: 45, right: 285 } : 50, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 850, maxZoom: 10 });
  }
  useEffect(() => { setRendered(false); if (ready) fit(); setPopup(null); }, [selected.id, ready, fitRequest]); // Fit only when the chosen footprint changes.
  useEffect(() => {
    setRendered(false);
    if (!detailed) return;
    const timer = setTimeout(() => {
      if (!mapRef.current?.isStyleLoaded()) { setBasemapError(true); setDetailed(false); }
    }, 12000);
    return () => clearTimeout(timer);
  }, [detailed]);
  const mapClick = event => {
    const pages = [...new Set((event.features || []).map(f => f.properties.page))];
    const category = event.features?.find(f => f.properties.category)?.properties.category;
    if (pages.length) setPopup({ longitude: event.lngLat.lng, latitude: event.lngLat.lat, pages, category });
    else setPopup(null);
  };
  return <section className="map-stage" aria-label="Interactive watershed map">
    <div className="map-options">
      <label className="compare-toggle"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)}/> Compare footprints</label>
      <div className="segmented" aria-label="Basemap style"><button aria-pressed={!detailed} onClick={() => { setDetailed(false); setBasemapError(false); }}>Simple</button><button aria-pressed={detailed} onClick={() => { setDetailed(true); setBasemapError(false); }}>Detailed</button></div>
    </div>
    <div className="map-canvas" data-testid="map-canvas" data-watersheds-visible={rendered} data-layers-page={layers ? selected.page : ''} data-rendered-routes={renderedRoutes}>
      {webglError ? <div className="map-unavailable" role="alert"><h3>Interactive maps need WebGL.</h3><p>You can still explore every city and view its original appendix map below.</p></div> : <Map
        ref={mapRef} mapLib={maplibregl} initialViewState={{ longitude: -116, latitude: 38, zoom: 4.5 }}
        mapStyle={detailed ? 'https://tiles.openfreemap.org/styles/positron' : basicStyle}
        onLoad={() => setReady(true)} onIdle={() => {
          const map = mapRef.current;
          setRenderedRoutes(map?.getLayer('aqueduct-lines') ? map.queryRenderedFeatures({ layers: ['aqueduct-lines'] }).length : 0);
          setRendered(Boolean(map?.getLayer('thematic-regions') && map.queryRenderedFeatures({ layers: ['thematic-regions', 'aqueduct-lines', 'aqueduct-symbols'] }).length));
        }} onError={event => {
          if (/webgl|gpu|context/i.test(event.error?.message || '')) setWebglError(true);
          else if (detailed) { setBasemapError(true); setDetailed(false); }
        }}
        interactiveLayerIds={[...(compare ? ['other-fill'] : []), ...(layers ? ['thematic-regions', 'aqueduct-hit', 'aqueduct-symbols'] : [])]}
        onClick={mapClick} onMouseMove={e => setHover(Boolean(e.features?.length))} onMouseLeave={() => setHover(false)}
        cursor={hover ? 'pointer' : 'grab'} minZoom={2} maxZoom={13} dragRotate={false} touchPitch={false} attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" showCompass={false}/><ScaleControl position="bottom-left" unit="imperial"/>
        {!detailed && stateLabels.map(([name,longitude,latitude]) => <Marker key={name} longitude={longitude} latitude={latitude}><span className="state-label">{name}</span></Marker>)}
        {compare && <Source id="other-watersheds" type="geojson" data={otherFeatures}><Layer id="other-fill" type="fill" paint={{ 'fill-color': '#7e8d9c', 'fill-opacity': .09 }}/><Layer id="other-outline" type="line" paint={{ 'line-color': '#71808d', 'line-width': 1, 'line-opacity': .55 }}/></Source>}
        <Source id="selected-watershed" type="geojson" data={feature}>
          <Layer id="watershed-fill" type="fill" paint={{ 'fill-color': '#439b7d', 'fill-opacity': layers ? 0 : .12 }}/>
          <Layer id="watershed-outline" type="line" paint={{ 'line-color': '#26735b', 'line-width': .6, 'line-opacity': .3 }}/>
        </Source>
        {layers && <Source id="thematic-map" type="geojson" data={layers} tolerance={0}>
          <Layer id="thematic-regions" type="fill" filter={['all', ['==', ['get', 'kind'], 'region'], visibleFilter]} paint={{ 'fill-color': regionColor, 'fill-opacity': .94 }}/>
          <Layer id="aqueduct-symbols" type="fill" filter={['all', ['==', ['get', 'kind'], 'printed-route-symbol'], visibleFilter]} paint={{ 'fill-color': '#ff2922', 'fill-opacity': 1 }}/>
          <Layer id="aqueduct-lines" type="line" filter={['all', ['==', ['get', 'kind'], 'route'], visibleFilter]} layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#ff2922', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 8, 2, 12, 2.6] }}/>
          <Layer id="aqueduct-hit" type="line" filter={['all', ['==', ['get', 'kind'], 'route'], visibleFilter]} paint={{ 'line-color': '#ff2922', 'line-width': 14, 'line-opacity': 0 }}/>
        </Source>}
        {catalog.cities.map(city => {
          const active = selected.id === 'california' || city.mapId === selected.id;
          return <Marker key={city.name} longitude={city.coordinates[0]} latitude={city.coordinates[1]} anchor="center"><button className={`city-pin ${active ? 'active' : ''}`} aria-label={`Explore ${city.name}`} title={city.name} onClick={e => { e.stopPropagation(); choose(city.mapId); }}><span/>{selected.id !== 'california' && active && <span className="pin-label">{city.name}</span>}</button></Marker>;
        })}
        {popup && <Popup longitude={popup.longitude} latitude={popup.latitude} closeOnClick={false} onClose={() => setPopup(null)} maxWidth="280px"><p className="eyebrow">2012 APPENDIX MAP</p>{popup.category && <div className="category-popup"><strong>{LEGEND.find(item => item.id === popup.category)?.label}</strong><p>{popup.category === 'aqueduct' ? 'Red routes and direction symbols traced from the source map. Flow direction is only shown where the original includes an arrow.' : 'Approximate region reconstructed from the original map’s color.'}</p></div>}{popup.pages.map(page => {
          const entry = catalog.maps.find(m => m.page === page);
          return <button className="popup-choice" key={page} onClick={() => choose(entry.id)}>{entry.name} <span>→</span></button>;
        })}</Popup>}
      </Map>}
      {!ready && !webglError && <div className="map-loading" role="status">Drawing the watershed map…</div>}
      <div className="map-label"><span className="live-dot"/> 2012 source watersheds <span className="approx-badge">Approximate</span></div>
      <button className="fit-button" onClick={fit} disabled={!ready} title="Fit selected watershed" aria-label="Fit selected watershed">⌖</button>
      {!layers && <div className="thematic-status" role="status">{layerError ? <><span>Map detail couldn’t load ({layerError}).</span><button onClick={() => setRetry(n => n + 1)}>Retry layers</button></> : 'Loading protection regions and aqueducts…'}</div>}
      {basemapError && <div className="map-notice" role="status">Detailed tiles are unavailable. Showing the bundled basemap. <button onClick={() => setBasemapError(false)} aria-label="Dismiss basemap notice">×</button></div>}
    </div>
    <aside className={`theme-legend ${legendOpen ? '' : 'collapsed'}`} aria-label="Map legend">
      <button className="legend-heading" onClick={() => setLegendOpen(value => !value)} aria-expanded={legendOpen}><span>Surface Drinking Water Sources<small>by Level of Protection</small></span><span aria-hidden="true">{legendOpen ? '−' : '+'}</span></button>
      {legendOpen && <div className="legend-body">
        <div className="legend-classes">{LEGEND.filter(item => item.id !== 'delta' || available.has('delta')).map(item => <label key={item.id} className={!available.has(item.id) ? 'legend-unavailable' : ''}>
          <input type="checkbox" checked={!hidden.includes(item.id)} onChange={() => toggleLayer(item.id)} disabled={!available.has(item.id)} aria-label={`Show ${item.label}`}/>
          {item.id === 'aqueduct' ? <svg className="legend-route" viewBox="0 0 34 18" aria-hidden="true"><path d="M1 13C10-8 20 27 33 5" fill="none" stroke={item.color} strokeWidth="2.8"/><path d="m24 6 9-1-2 8" fill="none" stroke={item.color} strokeWidth="2"/></svg> : <i className={`legend-swatch swatch-${item.id}`} style={{ backgroundColor: item.color }}/>}
          <span>{item.label}{layers && !available.has(item.id) && <small>Not shown on this map</small>}</span>
        </label>)}</div>
        <p className="legend-caption">Reconstructed from the 2012 artwork. Red arrows retain the directions printed in the source.</p>
        {compare && <span className="legend-comparison"><i className="legend-other"/> Other footprints</span>}
        <a className="legend-download" href={asset(selected.layers)} download>Download these map layers ↓</a>
      </div>}
    </aside>
  </section>;
}
