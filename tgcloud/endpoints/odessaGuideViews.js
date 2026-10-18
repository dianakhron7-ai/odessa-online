import {db} from 'sdk';
import {sql} from 'sdk/db';
/* Persistent deduplicated visitor counter for the Odessa guide (per browser installation). */
const totalKey='odessa-guide:views:total:v2';
const visitPrefix='odessa-guide:views:visitor:v2:';
export default async function odessaGuideViews(input={}) {
 const token=typeof input?.visitor==='string'?input.visitor:'';
 if(!/^[a-f0-9]{32}$/.test(token))throw new Error('Неверный идентификатор счётчика');
 const now=Date.now();
 await db.run(sql`INSERT INTO odessa_settings(key,value,updated_at) VALUES(${totalKey},${'0'},${now}) ON CONFLICT(key) DO NOTHING`);
 const key=visitPrefix+token;
 const inserted=await db.run(sql`INSERT INTO odessa_settings(key,value,updated_at) VALUES(${key},${'1'},${now}) ON CONFLICT(key) DO NOTHING`);
 if(Number(inserted?.rowsAffected||0)>0){
  await db.run(sql`UPDATE odessa_settings SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT),updated_at=${now} WHERE key=${totalKey}`);
 }
 const row=await db.get(sql`SELECT value FROM odessa_settings WHERE key=${totalKey}`);
 const count=Number(row?.value||0);
 return {count:Number.isSafeInteger(count)?count:0,uniqueBrowserInstallations:true};
}
