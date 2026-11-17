// Solmar Bay — entry program for the make.fun gta6-01 competition (Node 22,
// standard library only). The game is the plain static files under game/ plus
// the screenshots/ the maker took of it. This program copies both into the
// grader's output directory and writes dossier.json with the vendored
// make.fun library, so the judge reads exactly what the player plays.
//
// Run it locally the same way the grader does, with MAKEFUN_OUTPUT_DIR
// standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyEntry() {
  mkdirSync(outputDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
  const shotDir = join(outputDir, 'screenshots');
  mkdirSync(shotDir, { recursive: true });
  if (existsSync(join(repoRoot, 'screenshots'))) {
    cpSync(join(repoRoot, 'screenshots'), shotDir, { recursive: true });
  }
}

function writeDossier() {
  // Caps from the competition's own gate: 4 screenshots at most, each at
  // most 256 KiB; game/ at most 993 files and 48 MiB; dossier text at most
  // 160 KiB. The program refuses an entry the scorer would refuse.
  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
}

copyEntry();
writeDossier();
