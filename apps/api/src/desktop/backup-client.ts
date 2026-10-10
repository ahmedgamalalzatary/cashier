import fs from "node:fs";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {eq} from "drizzle-orm";
import {branches,syncOutbox,syncState,type Db} from "@cashier/db";
import {captureEverything} from "./resend.js";
import {GenerationChangedError,UnlinkedError,requestDeviceJson,uploadPending,type UploadOptions} from "./upload.js";

const FILE="backup-generation.json";
type RecordState={deviceHash:string;generation:number;acknowledgedSeq:number;phase:"requesting"|"capturing"|"uploading"|"ready";requestId?:string;requiresReset?:boolean;replace?:boolean;replaceAll?:boolean};

function readRecord(directory:string):RecordState|undefined {
  try {
    const value=JSON.parse(fs.readFileSync(path.join(directory,FILE),"utf8")) as RecordState;
    if(typeof value.deviceHash!=="string" || !Number.isSafeInteger(value.generation)||value.generation<0||!Number.isSafeInteger(value.acknowledgedSeq)||value.acknowledgedSeq<0||!["requesting","capturing","uploading","ready"].includes(value.phase)) return;
    return value;
  } catch { return; }
}

function writeRecord(directory:string,value:RecordState) {
  // Flush before contacting online/deleting acknowledged rows. A damaged file
  // is recovered by obtaining another fresh server-issued namespace, never by
  // assuming that an old counter is safe.
  const fd=fs.openSync(path.join(directory,FILE),"w",0o600);
  try {fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
}

/** Set before restoring any database files; the marker lives outside the dump. */
export function markBackupForReset(directory:string) {
  const record=readRecord(directory);
  if(record) writeRecord(directory,{...record,requiresReset:true});
}

/** Serialises upload, generation changes and full resend for this runtime. */
export function createBackupClient(db:Db,directory:string,options:UploadOptions,onUnlinked:(message:string)=>void) {
  const deviceHash=createHash("sha256").update(options.deviceToken).digest("hex");
  let tail=Promise.resolve();
  let disabled=false;
  const serial=<T>(work:()=>Promise<T>):Promise<T>=>{
    const mine=tail.then(work);
    const handled=mine.catch(async(error:unknown)=>{
      await db.insert(syncState).values({id:1,lastError:error instanceof Error?error.message:"Backup failed."}).onDuplicateKeyUpdate({set:{lastError:error instanceof Error?error.message:"Backup failed."}}).catch(()=>{});
      if(error instanceof UnlinkedError && !disabled){disabled=true;onUnlinked(error.message);}
      throw error;
    });
    tail=handled.then(()=>{},()=>{});
    return handled;
  };
  const prepare=async(force=false,replaceAll=false)=>{
    if(disabled) throw new UnlinkedError();
    const [state]=await db.select().from(syncState).where(eq(syncState.id,1));
    let record=readRecord(directory);
    if(record?.deviceHash!==deviceHash) record=undefined;
    const restored=record && (record.requiresReset || (record.phase!=="requesting" && record.phase!=="capturing" && (state?.backupGeneration!==record.generation || (state?.lastUploadedSeq??0)<record.acknowledgedSeq)));
    if(force || !record || restored) {
      record={deviceHash,generation:Math.max(record?.generation??0,state?.backupGeneration??0),acknowledgedSeq:0,phase:"requesting",requestId:randomUUID(),replace:force||Boolean(restored),replaceAll};
      writeRecord(directory,record);
    }
    let queued=0;
    if(record.phase==="requesting") {
      const answer=await requestDeviceJson(options,"backup-generation",{requestId:record.requestId,minimumGeneration:record.generation,replace:record.replace??false,replaceAll:record.replaceAll??false}) as {generation?:number}|undefined;
      if(!Number.isSafeInteger(answer?.generation)||answer!.generation!<=record.generation) throw new Error("The site sent an invalid backup generation.");
      record={...record,generation:answer!.generation!,acknowledgedSeq:0,phase:"capturing"};
      writeRecord(directory,record);
    }
    if(record.phase==="capturing") {
      // If commit succeeded just before the process stopped, resume that queue;
      // allocating a second snapshot would needlessly reorder pending work.
      const [captured]=await db.select().from(syncState).where(eq(syncState.id,1));
      if(captured?.backupGeneration!==record.generation || !captured.bootstrappedAt){
        const generation=record.generation;
        queued=await db.transaction(async tx=>{
          await tx.select({id:branches.id}).from(branches).for("update");
          if(record!.replace) await tx.delete(syncOutbox);
          const count=await captureEverything(tx);
          const change={backupGeneration:generation,bootstrappedAt:new Date(),lastUploadedSeq:0,lastSuccessAt:null,lastError:null};
          await tx.insert(syncState).values({id:1,...change}).onDuplicateKeyUpdate({set:change});
          return count;
        });
      }
      record={...record,phase:"uploading"};
      writeRecord(directory,record);
    }
    return {record,queued};
  };
  return {
    resendAll:()=>serial(async()=>({queued:(await prepare(true,true)).queued})),
    uploadNow:()=>serial(async()=>{
      for(let attempt=0;attempt<2;attempt++){
        const {record}=await prepare(attempt>0);
        try {
          const result=await uploadPending(db,{...options,generation:record.generation,onAcknowledged:seqs=>{
            record.acknowledgedSeq=Math.max(record.acknowledgedSeq,...seqs);
            writeRecord(directory,record);
          }});
          if(record.phase==="uploading" && result.pending===0){
            const answer=await requestDeviceJson(options,"backup-generation/complete",{generation:record.generation}) as {generation?:number}|undefined;
            if(answer?.generation!==record.generation) throw new GenerationChangedError("The site confirmed a different backup generation.");
            await db.update(syncState).set({lastSuccessAt:new Date(),lastError:null}).where(eq(syncState.id,1));
            writeRecord(directory,{...record,phase:"ready"});
          }
          return result;
        } catch(error){if(error instanceof GenerationChangedError && attempt===0) continue;throw error;}
      }
      throw new Error("The backup generation could not be established.");
    }),
  };
}
