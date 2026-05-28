const fs = require("fs");
let p = fs.readFileSync("src/components/ProductionOutputReport.tsx", "utf8");
p = p.replace(/\\\"\\\"/g, "''");
fs.writeFileSync("src/components/ProductionOutputReport.tsx", p);
