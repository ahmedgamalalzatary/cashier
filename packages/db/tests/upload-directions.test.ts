import fs from "node:fs";
import path from "node:path";
import {expect,it} from "vitest";
import {readSyncDirections} from "../scripts/generate-sync-triggers.js";
import * as tables from "../src/upload-tables.js";
import shipped from "../src/sync-directions.json" with {type:"json"};
const plan=fs.readFileSync(path.resolve(import.meta.dirname,"../../../docs/desktop-online-plan.md"),"utf8");
const directions=Object.fromEntries([...readSyncDirections(plan)].map(([name,assigned])=>[name,[...assigned]]));
it("ships the directions the plan states, so ingest and resend never use a stale list",()=>{
  expect(shipped).toEqual(directions);
});
it("uses the same explicit directions for ingest/resend as trigger generation",()=>{
  const changed={...directions,employees:["None"]};
  const result=tables.buildUploadTables(changed);
  expect(result.some(table=>table.name==="employees")).toBe(false);
});
