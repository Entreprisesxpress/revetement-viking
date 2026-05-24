import fs from 'fs';
import path from 'path';

const fns = ['sauvegarder','lister','charger','supprimer','changerStatut','enregistrerHeuresReelles','enregistrerRendement','rendementsMoyens','statistiques','listerClients','getClient','ajouterClient','modifierClient','supprimerClient','trouverOuCreerClient','listerProjets','getProjet','ajouterProjet','modifierProjet','supprimerProjet','listerHeuresProjet','ajouterHeureProjet','supprimerHeureProjet','listerFacturesProjet','ajouterFactureProjet','marquerFacturePayee','supprimerFactureProjet','listerDepensesProjet','ajouterDepenseProjet','supprimerDepenseProjet','ajouterJobBiblio','listerJobsBiblio','supprimerJobBiblio','jobsSimilaires','genererNumero'];

function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (f.endsWith('.ts') || f.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const files = walk('app/api');
let totalChanges = 0;

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const fn of fns) {
    // Skip if function definition (e.g., "function fn(" or "async function fn(")
    // Match: word boundary, then fn(, but not preceded by await, ., word char, or "function "
    const re = new RegExp('(?<!await\\s)(?<![.\\w])(?<!function\\s)' + fn + '\\s*\\(', 'g');
    s = s.replace(re, 'await ' + fn + '(');
  }
  if (s !== before) {
    // Ensure GET/POST/PATCH/DELETE/PUT are async
    s = s.replace(/export\s+function\s+(GET|POST|PATCH|DELETE|PUT)/g, 'export async function $1');
    fs.writeFileSync(f, s);
    totalChanges++;
    console.log('OK', f);
  }
}
console.log('Files updated:', totalChanges);
