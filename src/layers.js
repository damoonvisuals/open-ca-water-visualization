// Colors and wording follow the appendix legend. These are historical,
// image-derived categories, not contemporary land-use or protection data.
export const LEGEND = [
  { id: 'high', label: 'High level of protection', color: '#668f76' },
  { id: 'some', label: 'Some protection', color: '#88cb66' },
  { id: 'none', label: 'No known protection', color: '#d4edb6' },
  { id: 'agricultural', label: 'Agricultural', color: '#9c9c9c' },
  { id: 'developed', label: 'Developed', color: '#343434' },
  { id: 'service', label: 'Water Provider Service Area', color: '#ffb2b2' },
  { id: 'aqueduct', label: 'Aqueducts', color: '#ff2922' },
  { id: 'delta', label: 'Sacramento–San Joaquin Delta', color: '#3898ff' },
];
export const regionColor = ['match', ['get', 'category'], ...LEGEND.flatMap(item => [item.id, item.color]), '#888888'];
