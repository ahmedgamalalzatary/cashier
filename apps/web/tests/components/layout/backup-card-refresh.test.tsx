import {afterEach,expect,it,vi} from "vitest";
const hooks=vi.hoisted(()=>({state:[] as unknown[],cursor:0,effects:[] as (()=>(()=>void)|void)[]}));
vi.mock("react",async original=>({...(await original<typeof import("react")>()),
  useState:(initial:unknown)=>{const i=hooks.cursor++;if(i>=hooks.state.length) hooks.state[i]=initial;return[hooks.state[i],(value:unknown)=>{hooks.state[i]=value;}];},
  useCallback:(fn:unknown)=>fn,
  useEffect:(fn:()=>void)=>{hooks.effects.push(fn);},
}));
vi.mock("@cashier/web-core/lib/auth",()=>({readSession:()=>({token:"test",user:{id:"admin",name:"Admin",username:"admin",role:"admin",isSuperAdmin:true,branchId:null}})}));
const service=vi.hoisted(()=>({readBackupStatus:vi.fn(async()=>({lastSuccessAt:null,lastAttemptAt:null,lastError:null,pending:0})),uploadNow:vi.fn(),resendEverything:vi.fn()}));
vi.mock("../../../src/services/backup-service",()=>({...service,DATA_CHANGED_EVENT:"cashier:data-changed"}));
const DATA_CHANGED_EVENT="cashier:data-changed";
import {BackupCard} from "../../../src/components/layout/backup-card";
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();hooks.state=[];hooks.cursor=0;hooks.effects=[];service.readBackupStatus.mockClear();});
it("refreshes the waiting count as soon as something changes, on focus, and every 15 seconds",async()=>{
  vi.useFakeTimers();
  const page=new EventTarget();
  vi.stubGlobal("window",page);
  BackupCard();
  const cleanup=hooks.effects[0]();
  await vi.advanceTimersByTimeAsync(1);
  expect(service.readBackupStatus).toHaveBeenCalledTimes(1);

  page.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  expect(service.readBackupStatus).toHaveBeenCalledTimes(2);
  page.dispatchEvent(new Event("focus"));
  expect(service.readBackupStatus).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(service.readBackupStatus).toHaveBeenCalledTimes(4);

  cleanup?.();
  page.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  page.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(service.readBackupStatus).toHaveBeenCalledTimes(4);
});
