import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach,expect,it,vi} from "vitest";
const hooks=vi.hoisted(()=>({perform:async()=>({uploaded:0,pending:0}),maintenance:undefined as AbortSignal|undefined}));
vi.mock("@cashier/db",async original=>({...await original<typeof import("@cashier/db")>(),createDb:()=>({select:()=>({from:async()=>[{id:"branch"}]})}),closeDb:async()=>{}}));
vi.mock("../../src/desktop/settings.js",()=>({loadDesktopSettings:()=>({environment:{DATABASE_URL:"unused",JWT_SECRET:"secret",CORS_ORIGIN:[]},deviceToken:"token",onlineApiUrl:"http://localhost",syncEnabled:false,branchId:"branch"})}));
vi.mock("../../src/desktop/upgrade.js",()=>({prepareDesktopDatabase:async()=>{}}));
vi.mock("../../src/desktop/backup-client.js",()=>({createBackupClient:()=>({uploadNow:()=>hooks.perform(),resendAll:async()=>({queued:0})})}));
vi.mock("../../src/desktop/upload.js",async original=>({...await original<typeof import("../../src/desktop/upload.js")>(),migrationCheckpoint:async()=>100,uploadPending:()=>hooks.perform()}));
vi.mock("../../src/desktop/accounts.js",()=>({runAccountsLoop:async()=>{},requestDeviceAccounts:async()=>{},applyDeviceAccounts:async()=>{}}));
vi.mock("../../src/modules/shifts/auto-close.js",()=>({runAutoCloseLoop:async(_db:unknown,signal:AbortSignal)=>{hooks.maintenance=signal;}}));
vi.mock("../../src/app.js",async()=>{const {default:express}=await import("express");return{createApp:()=>{const app=express();app.get("/health",(_req,res)=>res.json({ok:true}));return app;}};});
import {startDesktopApi} from "../../src/desktop/runtime.js";
import {UnlinkedError} from "../../src/desktop/upload.js";
const directories:string[]=[];
function start(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),"cashier-runtime-test-"));directories.push(directory);const manifest=path.join(directory,"manifest.json");fs.writeFileSync(manifest,JSON.stringify({version:"test",schemaCreatedAt:100}));return startDesktopApi(path.join(directory,"settings.env"),manifest,new AbortController().signal,"unused");}
afterEach(()=>{for(const dir of directories.splice(0)){if(!dir.startsWith(path.join(os.tmpdir(),"cashier-runtime-test-")))throw Error("Unexpected path");fs.rmSync(dir,{recursive:true,force:true});}vi.restoreAllMocks();hooks.perform=async()=>({uploaded:0,pending:0});});
it("opens the local listener while history capture is stalled",async()=>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  hooks.perform=async()=>{await gate;return{uploaded:0,pending:0};};
  const starting=start();
  const ready=await Promise.race([starting.then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),200))]);
  release();const runtime=await starting;
  try {expect(ready).toBe(true);expect((await fetch(`${runtime.apiUrl}/health`)).status).toBe(200);}
  finally {await runtime.close();}
});
it("keeps shift maintenance running after backup credentials are revoked",async()=>{
  let reject!: (error:Error)=>void;
  hooks.perform=()=>new Promise((_resolve,fail)=>{reject=fail;});
  vi.spyOn(console,"error").mockImplementation(()=>{});
  const runtime=await start();
  reject(new UnlinkedError());
  await new Promise(resolve=>setImmediate(resolve));
  try {expect(hooks.maintenance?.aborted).toBe(false);expect((await fetch(`${runtime.apiUrl}/health`)).status).toBe(200);}
  finally {await runtime.close();}
});
