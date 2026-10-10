import {renderToStaticMarkup} from "react-dom/server";
import {afterEach,expect,it,vi} from "vitest";
const hooks=vi.hoisted(()=>({state:[] as unknown[],cursor:0,effects:[] as (()=>(()=>void)|void)[]}));
vi.mock("react",async original=>({...(await original<typeof import("react")>()),
  useState:(initial:unknown)=>{const i=hooks.cursor++;if(i>=hooks.state.length) hooks.state[i]=initial;return[hooks.state[i],(value:unknown)=>{hooks.state[i]=value;}];},
  useCallback:(fn:unknown)=>fn,
  useEffect:(fn:()=>void)=>{hooks.effects.push(fn);},
}));
vi.mock("@cashier/web-core/lib/auth",()=>({readSession:()=>({token:"test",user:{id:"admin",name:"Admin",username:"admin",role:"admin",isSuperAdmin:true,branchId:null}})}));
vi.mock("../../../src/services/backup-service",()=>({readBackupStatus:vi.fn().mockRejectedValue(new Error("First status failed")),uploadNow:vi.fn(),resendEverything:vi.fn(),DATA_CHANGED_EVENT:"cashier:data-changed"}));
import {BackupCard} from "../../../src/components/layout/backup-card";
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();hooks.state=[];hooks.cursor=0;hooks.effects=[];});
it("shows a first-load failure with a retry control",async()=>{
  vi.useFakeTimers();
  vi.stubGlobal("window",new EventTarget());
  BackupCard();
  const cleanup=hooks.effects[0]();
  await vi.advanceTimersByTimeAsync(1);
  hooks.cursor=0;
  const output=renderToStaticMarkup(BackupCard());
  expect(output).toContain("First status failed");
  expect(output).toContain("إعادة المحاولة");
  cleanup?.();
});
