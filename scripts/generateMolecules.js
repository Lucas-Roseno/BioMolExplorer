const fs = require('fs');

const MOLECULES = [
  "alpha-Humulene",
  "Caffeine",
  "Rivastigmine",
  "Tacrine",
  "Physostigmine",
  "Neostigmine",
  "Aspirin",
  "Donepezil",
  "Galantamine"
];

// Map atomic numbers to colors and radii
const ELEMENT_MAP = {
  1: { symbol: 'H', color: '#ffffff', emissive: '#444444', radius: 0.2 },
  6: { symbol: 'C', color: '#333333', emissive: '#000000', radius: 0.4 },
  7: { symbol: 'N', color: '#0000ff', emissive: '#000055', radius: 0.4 },
  8: { symbol: 'O', color: '#ff0000', emissive: '#550000', radius: 0.4 },
  9: { symbol: 'F', color: '#00ff00', emissive: '#005500', radius: 0.35 },
  15: { symbol: 'P', color: '#ffa500', emissive: '#552200', radius: 0.5 },
  16: { symbol: 'S', color: '#ffff00', emissive: '#555500', radius: 0.5 },
  17: { symbol: 'Cl', color: '#00ff00', emissive: '#005500', radius: 0.5 },
};

async function fetchPubChem3D(name) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${name}/record/JSON/?record_type=3d`;
  console.log(`Fetching ${name}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const comp = data.PC_Compounds[0];
    
    const elements = comp.atoms.element;
    const xs = comp.coords[0].conformers[0].x;
    const ys = comp.coords[0].conformers[0].y;
    const zs = comp.coords[0].conformers[0].z;
    
    const atoms = elements.map((el, i) => {
      const info = ELEMENT_MAP[el] || { symbol: '?', color: '#ff00ff', emissive: '#550055', radius: 0.4 };
      return {
        position: [xs[i], ys[i], zs[i]],
        radius: info.radius,
        color: info.color,
        emissive: info.emissive,
        element: info.symbol
      };
    });
    
    // PubChem bonds are 1-indexed, we need 0-indexed
    const bonds = [];
    if (comp.bonds) {
      const aid1 = comp.bonds.aid1;
      const aid2 = comp.bonds.aid2;
      for (let i = 0; i < aid1.length; i++) {
        bonds.push({
          start: aid1[i] - 1, // 0-indexed
          end: aid2[i] - 1
        });
      }
    }
    
    return { name, atoms, bonds };
  } catch (e) {
    console.error(`Failed to fetch ${name}: ${e.message}`);
    return null;
  }
}

async function run() {
  const results = [];
  for (const name of MOLECULES) {
    const data = await fetchPubChem3D(name);
    if (data) results.push(data);
    // wait a bit to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const tsContent = `// Auto-generated 3D molecules from PubChem
export const MOLECULES_3D = ${JSON.stringify(results, null, 2)};
`;

  fs.writeFileSync('apps/web/src/lib/molecules3D.ts', tsContent);
  console.log("Written to apps/web/src/lib/molecules3D.ts");
}

run();
