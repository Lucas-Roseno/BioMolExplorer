const fs = require('fs');
async function run() {
  const res = await fetch('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/aspirin/record/JSON/?record_type=3d');
  const data = await res.json();
  fs.writeFileSync('scripts/test.json', JSON.stringify(data, null, 2));
  console.log("Done");
}
run();
