import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status || 1);
};
run("python3", ["scripts/build-site.py"]);
await fs.rm("dist/pages", { recursive: true, force: true });
await fs.cp("dist/site", "dist/pages", { recursive: true });
run("npx", ["vite", "build", "--config", "vite.pages.config.ts"]);
run("npx", ["vite", "build", "--config", "vite.pages.config.ts"], {
  PAGES_WORKER: "1",
});
await fs.rm("dist/pages/build-manifest.json", { force: true });
await fs.mkdir("dist/pages/demo/licenses", {recursive:true});
for(const name of ["sql.js","bcryptjs","react","react-dom","lucide-react","fflate"]){
 const candidates=["LICENSE","LICENSE.txt","LICENSE.md"];
 let copied=false;
 for(const file of candidates){try{await fs.copyFile(`node_modules/${name}/${file}`,`dist/pages/demo/licenses/${name.replaceAll('/','-')}-LICENSE.txt`);copied=true;break;}catch(error){if(error.code!=="ENOENT")throw error;}}
 if(!copied)throw new Error(`Missing upstream license: ${name}`);
}
console.log(
  "Pages: presentation at /, interactive fictional application at /demo/.",
);
