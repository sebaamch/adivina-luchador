import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const wrestlers = JSON.parse(fs.readFileSync(path.join(root,'data','wrestlers.json'),'utf8'));
fs.writeFileSync(path.join(root,'data','db.json'), JSON.stringify({ wrestlers, games: [] }, null, 2));
console.log(`Base local reiniciada: ${wrestlers.length} luchadores.`);
