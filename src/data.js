export const asset = path => `${import.meta.env.BASE_URL}${path}`;

export function boundsFor(feature, cities = []) {
  const points = feature.geometry.coordinates.flat(2).concat(cities.map(city => city.coordinates));
  return [[Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1]))],
    [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]];
}

export function searchMaps(maps, query, region) {
  const q = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return maps.filter(map => (region === 'All regions' || map.region === region) &&
    [map.name, ...map.cities].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q));
}

export function validateData(catalog, watersheds) {
  if (!Array.isArray(catalog.maps) || !Array.isArray(catalog.cities) || watersheds.type !== 'FeatureCollection') {
    throw new Error('The atlas data has an unexpected format.');
  }
  for (const map of catalog.maps) {
    const feature = watersheds.features.find(f => f.properties.page === map.page);
    if (!feature || feature.geometry.type !== 'MultiPolygon' || !feature.geometry.coordinates.length) {
      throw new Error(`The watershed for ${map.name} is missing.`);
    }
  }
}

export async function loadAtlas(signal) {
  const values = await Promise.all(['catalog.json', 'watersheds.geojson', 'basemap.geojson'].map(async file => {
    const response = await fetch(asset(`data/${file}`), { signal });
    if (!response.ok) throw new Error(`Could not load ${file} (HTTP ${response.status}).`);
    return response.json();
  }));
  validateData(values[0], values[1]);
  return { catalog: values[0], watersheds: values[1], basemap: values[2] };
}
