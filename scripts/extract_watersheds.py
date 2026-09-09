"""Digitize the appendix's thematic regions and aqueduct artwork as static GeoJSON.

The PDF is a raster source, not authoritative GIS. Retain the visible categories,
small patches, internal holes, and red direction symbols. Never infer a direction
from a skeleton's arbitrary vertex order. Run from any directory; see README.
"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
import pymupdf
from PIL import Image
from pyproj import Transformer
from shapely.geometry import Polygon, MultiPolygon, mapping
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public'
SCALE = 2.5
CONTROL_SCALE = 1.2
# PDF map frame is x=36..576, y=36..504 points; trim its black border.
FRAME = (91, 91, 1439, 1259)
PALETTE = {
    'high': ('High level of protection', '#668f76'),
    'some': ('Some protection', '#88cb66'),
    'none': ('No known protection', '#d4edb6'),
    'agricultural': ('Agricultural', '#9c9c9c'),
    'developed': ('Developed', '#343434'),
    'service': ('Water Provider Service Area', '#ffb2b2'),
    'aqueduct': ('Aqueducts', '#ff2922'),
    'delta': ('Sacramento–San Joaquin Delta', '#3898ff'),
}
registrations = json.loads((ROOT / 'scripts/registrations.json').read_text())['pages']
to_projected = Transformer.from_crs(4326, 5070, always_xy=True)
to_geo = Transformer.from_crs(5070, 4326, always_xy=True)


def registration(page):
    controls = registrations[str(page)]
    if isinstance(controls, str):
        controls = registrations[controls]
    xy = np.array([[v[0], v[1], 1] for v in controls], float)
    projected = np.array([to_projected.transform(v[2], v[3]) for v in controls])
    matrix = np.linalg.lstsq(xy, projected, rcond=None)[0]
    errors = np.linalg.norm(xy @ matrix - projected, axis=1)
    return controls, matrix, errors


def project(points, matrix):
    p = np.asarray(points, dtype=float).reshape(-1, 2)
    # Input is relative to the cropped high-resolution map, controls to full page.
    p += [FRAME[0], FRAME[1]]
    p *= CONTROL_SCALE / SCALE
    projected = np.column_stack([p, np.ones(len(p))]) @ matrix
    lon, lat = to_geo.transform(projected[:, 0], projected[:, 1])
    return np.round(np.column_stack([lon, lat]), 6).tolist()


def contours_geometry(mask, matrix, min_area=2, tolerance=.4):
    contours, hierarchy = cv2.findContours(mask.astype('uint8'), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    polys, retained = [], []
    if hierarchy is None:
        return MultiPolygon([]), retained
    for i, contour in enumerate(contours):
        if hierarchy[0][i][3] != -1 or cv2.contourArea(contour) < min_area:
            continue
        outer = cv2.approxPolyDP(contour, tolerance, True).reshape(-1, 2)
        if len(outer) < 3:
            continue
        holes = []
        child = hierarchy[0][i][2]
        while child >= 0:
            if cv2.contourArea(contours[child]) >= min_area:
                hole = cv2.approxPolyDP(contours[child], tolerance, True).reshape(-1, 2)
                if len(hole) >= 3:
                    holes.append(project(hole, matrix))
            child = hierarchy[0][child][0]
        geom = Polygon(project(outer, matrix), holes).buffer(0)
        parts = list(geom.geoms) if geom.geom_type == 'MultiPolygon' else [geom]
        polys.extend(orient(p, sign=1) for p in parts if not p.is_empty)
        retained.append((contour, i))
    # Raster regions can touch at corners; dissolve/repair into valid GeoJSON.
    geom = unary_union(polys)
    if geom.is_empty:
        return MultiPolygon([]), retained
    return MultiPolygon(list(geom.geoms) if geom.geom_type == 'MultiPolygon' else [geom]), retained


def classify(rgb):
    a = rgb.astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    green = (g > r + 8) & (g > b + 10) & (g > 65)
    neutral = (a.max(axis=2) - a.min(axis=2) < 14) & (g > 30) & (g < 190)
    # Restrict neutral colors to green-containing source components: terrain,
    # river labels and city labels are not agricultural/developed regions.
    union = cv2.morphologyEx((green | neutral).astype('uint8'), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(union, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    envelope = np.zeros(green.shape, np.uint8)
    for c in contours:
        if cv2.contourArea(c) < 5:
            continue
        x, y, w, h = cv2.boundingRect(c)
        local = np.zeros((h, w), np.uint8)
        cv2.drawContours(local, [c - [x, y]], -1, 1, -1)
        if np.count_nonzero(green[y:y+h, x:x+w] & (local > 0)) >= 5:
            cv2.drawContours(envelope, [c], -1, 1, -1)
    # Lab chroma separates the green classes despite hillshade/lightness shifts.
    colors = np.array([[[102, 143, 118], [136, 203, 102], [212, 237, 182]]], np.uint8)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(float)
    references = cv2.cvtColor(colors, cv2.COLOR_RGB2LAB).astype(float)[0]
    distances = np.stack([np.sum(((lab - ref) * [.7, 1, 1])**2, axis=2) for ref in references])
    nearest = distances.argmin(axis=0)
    masks = {key: green & (nearest == index) for index, key in enumerate(['high', 'some', 'none'])}
    masks['agricultural'] = neutral & (envelope > 0) & (g >= 102)
    masks['developed'] = neutral & (envelope > 0) & (g < 102)
    masks['service'] = (r > 195) & (r > g + 32) & (g > 90) & (g < 215) & (np.abs(g-b) < 24)
    orange_marker = (r > 160) & (r > g + 40) & (g > b + 18) & (g > 65)
    # Glossy city dots are compact orange blobs, unlike red aqueduct strokes.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(orange_marker.astype('uint8'))
    marker_area = np.zeros(green.shape, np.uint8)
    for label in range(1, count):
        x, y, w, h, area = stats[label]
        if 5 <= w <= 32 and 5 <= h <= 32 and .5 < w/h < 2 and area > 12 and area/(w*h) > .35:
            cv2.circle(marker_area, (x + w//2, y + h//2), int(max(w, h)*1.1), 1, -1)
    marker_area = cv2.dilate(marker_area, np.ones((5, 5), np.uint8)) > 0
    masks['aqueduct'] = (r > 165) & (g < 145) & (r > g + 80) & (r > b + 75) & (np.abs(g-b) < 45) & ~marker_area
    # JPEG fringes around red lines must not become pink service regions.
    route_fringe = cv2.dilate(masks['aqueduct'].astype('uint8'), np.ones((3, 3), np.uint8)) > 0
    masks['service'] &= ~route_fringe & ~marker_area
    masks['delta'] = (r < 110) & (b > 200) & (g < 190) & (b > g + 50)
    return masks, envelope


def skeletonize(mask):
    """Zhang–Suen thinning; avoids inventing straight connectors between gaps."""
    im = np.pad(mask.astype(np.uint8), 1)
    for _ in range(80):
        changed = False
        for step in [0, 1]:
            p = im[1:-1, 1:-1]
            ns = [im[:-2, 1:-1], im[:-2, 2:], im[1:-1, 2:], im[2:, 2:], im[2:, 1:-1], im[2:, :-2], im[1:-1, :-2], im[:-2, :-2]]
            count = sum(ns)
            transitions = sum(((ns[i] == 0) & (ns[(i+1) % 8] == 1)).astype(np.uint8) for i in range(8))
            if step == 0:
                condition = (ns[0]*ns[2]*ns[4] == 0) & (ns[2]*ns[4]*ns[6] == 0)
            else:
                condition = (ns[0]*ns[2]*ns[6] == 0) & (ns[0]*ns[4]*ns[6] == 0)
            remove = (p == 1) & (count >= 2) & (count <= 6) & (transitions == 1) & condition
            if remove.any():
                p[remove] = 0
                changed = True
        if not changed:
            break
    return im[1:-1, 1:-1]


def routes_geometry(mask, matrix):
    pixels = set(map(tuple, np.argwhere(skeletonize(mask))))
    neighbors = {}
    for y, x in pixels:
        ns = []
        for dy, dx in [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]:
            q = (y+dy, x+dx)
            if q not in pixels:
                continue
            # Don't create triangular junctions at a single staircase corner.
            if dx and dy and ((y, x+dx) in pixels or (y+dy, x) in pixels):
                continue
            ns.append(q)
        neighbors[(y, x)] = ns
    visited, lines = set(), []
    starts = sorted(pixels, key=lambda p: (len(neighbors[p]) == 2, p))
    for start in starts:
        for neighbor in neighbors[start]:
            edge = frozenset([start, neighbor])
            if edge in visited:
                continue
            path = [start, neighbor]
            visited.add(edge)
            while len(neighbors[path[-1]]) == 2:
                next_point = next(n for n in neighbors[path[-1]] if n != path[-2])
                edge = frozenset([path[-1], next_point])
                if edge in visited:
                    break
                visited.add(edge)
                path.append(next_point)
            if len(path) < 3:
                continue
            points = np.array([[x, y] for y, x in path], np.float32)
            points = cv2.approxPolyDP(points, .4, False).reshape(-1, 2)
            lines.append(project(points, matrix))
    return {'type': 'MultiLineString', 'coordinates': lines}


def extract(number, doc):
    page = doc[number - 1]
    legend_text = page.get_text()
    pix = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE))
    im = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
    # Keep a higher-quality source preview, retaining the original legend.
    im.save(OUT / f'appendix/page-{number}.webp', quality=90)
    # Remove vector labels without erasing underlying raster map artwork.
    page.add_redact_annot(pymupdf.Rect(36, 36, 576, 504), fill=False)
    page.apply_redactions(images=0, graphics=0, text=0)
    clean = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE))
    clean_image = Image.frombytes('RGB', [clean.width, clean.height], clean.samples)
    cropped = np.asarray(clean_image.crop(FRAME))
    masks, envelope = classify(cropped)
    original_masks, _ = classify(np.asarray(im.crop(FRAME)))
    # The PDF's red direction arrows are font glyphs (often extracted as 'E').
    # Preserve them from the original render rather than the text-cleaned render.
    masks['aqueduct'] = original_masks['aqueduct']
    masks['delta'] = original_masks['delta']
    if 'Sacramento-San Joaquin Delta' not in legend_text:
        masks['delta'][:] = False
    if 'Aqueducts' not in legend_text:
        masks['aqueduct'][:] = False
    if 'Water Provider Service Area' not in legend_text:
        masks['service'][:] = False
    controls, matrix, errors = registration(number)
    features, summary = [], {}
    review = np.full(cropped.shape, 246, dtype=np.uint8)
    for category, mask in masks.items():
        geometry, retained = contours_geometry(mask, matrix, min_area=1 if category in ['aqueduct', 'delta'] else 2)
        if geometry.is_empty:
            continue
        name, color = PALETTE[category]
        symbol = category == 'aqueduct'
        features.append({'type': 'Feature', 'id': f'{number}-{category}-regions', 'properties': {
            'page': number, 'category': category, 'label': name, 'kind': 'printed-route-symbol' if symbol else 'region',
            'approximate': True, 'source': f'Appendix A, PDF page {number}',
            **({'direction': 'Only the arrow shapes printed in the source are retained; vertex order does not encode flow.'} if symbol else {}),
        }, 'geometry': mapping(geometry)})
        summary[category] = {'polygons': len(geometry.geoms), 'classifiedPixels': int(mask.sum())}
        review[mask] = tuple(int(color[i:i+2], 16) for i in [1, 3, 5])
    # Pink service areas and red aqueducts do not become watershed boundaries.
    footprint, _ = contours_geometry(envelope, matrix, min_area=5, tolerance=.45)
    routes = routes_geometry(masks['aqueduct'], matrix)
    if routes['coordinates']:
        features.append({'type': 'Feature', 'id': f'{number}-aqueduct-lines', 'properties': {
            'page': number, 'category': 'aqueduct', 'label': 'Aqueducts', 'kind': 'route', 'approximate': True,
            'direction': 'Unassigned. Read the preserved printed arrow symbols, not coordinate order.',
        }, 'geometry': routes})
    collection = {'type': 'FeatureCollection', 'features': features}
    (OUT / f'data/maps/page-{number}.geojson').write_text(json.dumps(collection, separators=(',', ':')) + '\n')
    Image.fromarray(review).save(OUT / f'appendix/tracing-{number}.webp', quality=90)
    overlay = {'type': 'Feature', 'id': f'page-{number}', 'properties': {'page': number, 'approximate': True,
        'method': 'High-resolution raster segmentation; 0.45-pixel outline simplification',
        'registrationRmseMeters': round(float(np.sqrt(np.mean(errors**2))))}, 'geometry': mapping(footprint)}
    qa = {'page': number, 'components': len(footprint.geoms), 'controlPoints': controls,
        'fitResidualMeters': [round(float(e)) for e in errors], 'renderScale': SCALE, 'categories': summary,
        'routeSegments': len(routes['coordinates']),
        'note': 'Fit residuals measure agreement with approximate controls, not boundary accuracy. Raster classes and routes are reconstructions of printed artwork. Flow is not inferred.'}
    print(f'Page {number}: {len(features)} features, {len(routes["coordinates"])} route segments', flush=True)
    return overlay, qa


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pages', nargs='+', type=int, default=list(range(14, 32)))
    args = parser.parse_args()
    (OUT / 'data/maps').mkdir(exist_ok=True)
    doc = pymupdf.open(ROOT / 'docs/california_drinking-water-sources-2012.pdf')
    old_features = json.loads((OUT / 'data/watersheds.geojson').read_text())['features'] if (OUT / 'data/watersheds.geojson').exists() else []
    old_qa = json.loads((OUT / 'data/registration-quality.json').read_text()) if (OUT / 'data/registration-quality.json').exists() else []
    for number in args.pages:
        overlay, qa = extract(number, doc)
        old_features = [f for f in old_features if f['properties']['page'] != number] + [overlay]
        old_qa = [q for q in old_qa if q['page'] != number] + [qa]
    (OUT / 'data/watersheds.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': sorted(old_features, key=lambda f: f['properties']['page'])}, separators=(',', ':')) + '\n')
    (OUT / 'data/registration-quality.json').write_text(json.dumps(sorted(old_qa, key=lambda q: q['page']), indent=2) + '\n')
