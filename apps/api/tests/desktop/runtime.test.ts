import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach,expect,it,vi} from "vitest";
const hooks=vi.hoisted(()=>({perform:async()=>({uploaded:0,pending:0}),maintenance:undefined as AbortSignal|undefined,reportAccountsError:undefined as ((error:unknown)=>void)|undefined}));
vi.mock("@cashier/db",async original=>({...await original<typeof import("@cashier/db")>(),createDb:()=>({select:()=>({from:async()=>[{id:"branch"}]})}),closeDb:async()=>{}}));
vi.mock("../../src/desktop/settings.js",()=>({loadDesktopSettings:()=>({environment:{DATABASE_URL:"unused",JWT_SECRET:"secret",CORS_ORIGIN:[]},deviceToken:"token",onlineApiUrl:"http://localhost",syncEnabled:false,branchId:"branch"})}));
vi.mock("../../src/desktop/upgrade.js",()=>({prepareDesktopDatabase:async()=>{}}));
vi.mock("../../src/desktop/backup-client.js",()=>({createBackupClient:()=>({uploadNow:()=>hooks.perform(),resendAll:async()=>({queued:0})})}));
vi.mock("../../src/desktop/upload.js",async original=>({...await original<typeof import("../../src/desktop/upload.js")>(),migrationCheckpoint:async()=>100,uploadPending:()=>hooks.perform()}));
vi.mock("../../src/desktop/accounts.js",async original=>({...await original<typeof import("../../src/desktop/accounts.js")>(),runAccountsLoop:async(_pull:unknown,_signal:AbortSignal,report:(error:unknown)=>void)=>{hooks.reportAccountsError=report;}}));
vi.mock("../../src/modules/shifts/auto-close.js",()=>({runAutoCloseLoop:async(_db:unknown,signal:AbortSignal)=>{hooks.maintenance=signal;}}));
vi.mock("../../src/app.js",async()=>{const {default:express}=await import("express");return{createApp:()=>{const app=express();app.get("/health",(_req,res)=>res.json({ok:true}));return app;}};});
import {startDesktopApi} from "../../src/desktop/runtime.js";
import {UnlinkedError} from "../../src/desktop/upload.js";
import {DeviceUnlinkedError} from "../../src/desktop/accounts.js";
import {readSettings} from "../../src/desktop/link.js";
const directories:string[]=[];
let settings="";
function start(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),"cashier-runtime-test-"));directories.push(directory);const manifest=path.join(directory,"manifest.json");fs.writeFileSync(manifest,JSON.stringify({version:"test",schemaCreatedAt:100}));settings=path.join(directory,"settings.env");fs.writeFileSync(settings,'BRANCH_ID="branch"\nDEVICE_TOKEN="token"\n');return startDesktopApi(settings,manifest,new AbortController().signal,"unused");}
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
it("forgets the revoked device token so the next start shows the link screen",async()=>{
  let reject!: (error:Error)=>void;
  hooks.perform=()=>new Promise((_resolve,fail)=>{reject=fail;});
  vi.spyOn(console,"error").mockImplementation(()=>{});
  const runtime=await start();
  reject(new UnlinkedError());
  await new Promise(resolve=>setImmediate(resolve));
  try {expect(readSettings(settings)).toEqual({BRANCH_ID:"branch"});}
  finally {await runtime.close();}
});
it("forgets the device token when the accounts download is refused as unlinked",async()=>{
  vi.spyOn(console,"error").mockImplementation(()=>{});
  const runtime=await start();
  try {hooks.reportAccountsError?.(new DeviceUnlinkedError());expect(readSettings(settings)).toEqual({BRANCH_ID:"branch"});}
  finally {await runtime.close();}
});
it("keeps the device token when the accounts download fails for another reason",async()=>{
  vi.spyOn(console,"error").mockImplementation(()=>{});
  const runtime=await start();
  try {hooks.reportAccountsError?.(new Error("offline"));expect(readSettings(settings).DEVICE_TOKEN).toBe("token");}
  finally {await runtime.close();}
});
