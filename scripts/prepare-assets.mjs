import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public', { recursive: true });
copyFileSync('docs/california_drinking-water-sources-2012.pdf', 'public/report.pdf');
