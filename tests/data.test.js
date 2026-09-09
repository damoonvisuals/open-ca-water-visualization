import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { boundsFor, searchMaps, validateData } from '../src/data.js';
const catalog = JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url)));
const watersheds = JSON.parse(readFileSync(new URL('../public/data/watersheds.geojson', import.meta.url)));

test('every appendix image has a unique nonempty footprint and a local source image', () => {
  validateData(catalog, watersheds);
  assert.equal(catalog.maps.length, 18);
  assert.equal(watersheds.features.length, 18);
  assert.deepEqual(catalog.maps.map(m => m.page), Array.from({length:18}, (_,i)=>i+14));
  assert.equal(new Set(catalog.maps.map(m=>m.id)).size, 18);
  for (const map of catalog.maps) assert.ok(existsSync(new URL(`../public/${map.image}`, import.meta.url)));
});

test('the two shared maps plus individual maps cover exactly 30 cities, without fabricated duplicates', () => {
  const represented = catalog.maps.flatMap(m=>m.cities);
  assert.equal(represented.length,30);
  assert.equal(new Set(represented).size,30);
  assert.equal(catalog.cities.length,30);
  assert.equal(catalog.maps.find(m=>m.id==='mwd').cities.length,12);
  assert.equal(catalog.maps.find(m=>m.id==='inland-empire').cities.length,3);
  for (const city of catalog.cities) assert.ok(catalog.maps.find(m=>m.id===city.mapId).cities.includes(city.name));
});

test('all polygon rings are closed, finite, and within the western United States', () => {
  for (const feature of watersheds.features) {
    assert.equal(feature.properties.approximate,true);
    for (const polygon of feature.geometry.coordinates) for (const ring of polygon) {
      assert.ok(ring.length>=4);
      assert.deepEqual(ring[0],ring.at(-1));
      for (const [lon,lat] of ring) {
        assert.ok(Number.isFinite(lon) && Number.isFinite(lat));
        assert.ok(lon > -126 && lon < -103 && lat > 31 && lat < 45, `Out-of-region geometry on page ${feature.properties.page}: ${lon}, ${lat}`);
      }
    }
  }
});

test('search finds cities inside shared map records and respects region filters', () => {
  assert.deepEqual(searchMaps(catalog.maps,'  ANAHEIM  ','All regions').map(m=>m.id),['mwd']);
  assert.deepEqual(searchMaps(catalog.maps,'Ontario','Southern California').map(m=>m.id),['inland-empire']);
  assert.equal(searchMaps(catalog.maps,'Ontario','Bay Area').length,0);
  assert.equal(searchMaps(catalog.maps,'','Bay Area').length,4);
  assert.deepEqual(searchMaps(catalog.maps,'San José','All regions').map(m=>m.id),['san-jose']);
});

test('fitting a remote watershed keeps its served city in view', () => {
  const feature = watersheds.features.find(f=>f.properties.page===23);
  const city=catalog.cities.find(c=>c.name==='Oakland');
  const [[west,south],[east,north]]=boundsFor(feature,[city]);
  assert.ok(west<=city.coordinates[0] && east>=city.coordinates[0]);
  assert.ok(south<=city.coordinates[1] && north>=city.coordinates[1]);
  assert.ok(east-west>1, 'Oakland must include its remote Sierra source area');
});

test('every appendix page includes detailed thematic data with historical legend classes', () => {
  const keys = new Set(['high','some','none','agricultural','developed','service','aqueduct','delta']);
  for (const map of catalog.maps) {
    const detail = JSON.parse(readFileSync(new URL(`../public/${map.layers}`, import.meta.url)));
    assert.equal(detail.type, 'FeatureCollection');
    assert.ok(detail.features.length >= 5, map.name);
    for (const feature of detail.features) {
      assert.equal(feature.properties.page, map.page);
      assert.equal(feature.properties.approximate, true);
      assert.ok(keys.has(feature.properties.category));
    }
    const routes = detail.features.find(f=>f.properties.kind==='route');
    // Stockton's source page has no aqueduct layer in its legend or map.
    if (map.page === 31) assert.equal(routes, undefined);
    else {
      assert.equal(routes.geometry.type, 'MultiLineString');
      assert.ok(routes.geometry.coordinates.some(line=>line.length>5), map.name);
      assert.match(routes.properties.direction, /Unassigned/);
      assert.ok(detail.features.some(f=>f.properties.kind==='printed-route-symbol'));
    }
    if (![14].includes(map.page)) assert.ok(detail.features.some(f=>f.properties.category==='service'), map.name);
  }
});

test('Oakland retains local/remote patches, interior holes, and the long aqueduct connection', () => {
  const detail=JSON.parse(readFileSync(new URL('../public/data/maps/page-23.geojson',import.meta.url)));
  const regions=detail.features.filter(f=>['high','some','none'].includes(f.properties.category));
  assert.equal(regions.length,3);
  assert.ok(regions.reduce((n,f)=>n+f.geometry.coordinates.length,0)>100);
  assert.ok(regions.some(f=>f.geometry.coordinates.some(p=>p.length>1)), 'Keep internal holes rather than filling every class solid');
  const route=detail.features.find(f=>f.properties.kind==='route');
  const points=route.geometry.coordinates.flat();
  assert.ok(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))>1, 'Aqueduct spans from East Bay toward the Sierra');
});
