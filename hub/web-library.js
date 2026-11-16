// Hands on the Wheel (HOTW)
// Copyright (c) 2026 1Matzh
// SPDX-License-Identifier: MIT
// Browser-side catalog management. Only verified character files are sent to the game.
import {launchConnection,rememberConnection,forgetConnection} from './game-files.js'
export const REMOTE='https://raw.githubusercontent.com/1Matzh/hotw-hub/characters/'
const required=['character.json','fullbody.xml','fullbody.json','feet.json','materials.json','colors.json','thumbnail.png']
const marker='hotw-installed.json',pending='hotw-pending.json'
const slug=/^[a-z0-9][a-z0-9_-]{0,39}$/
const texture=/^(?:pbr|textures)\/[a-zA-Z0-9_.-]+\.(?:dds|png)$/
const validFile=p=>typeof p==='string'&&(required.includes(p)||texture.test(p))
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const assert=(ok,message)=>{if(!ok)throw Error(message)}
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true})
export async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')}
const revision=files=>hash(encoder.encode(JSON.stringify([...files].sort((a,b)=>a.path<b.path?-1:1).map(f=>[f.path,f.size,f.sha256]))))
const revisions=new WeakMap()
function catalogRevision(entry){if(!revisions.has(entry))revisions.set(entry,revision(entry.files));return revisions.get(entry)}
async function directory(parent,name,create=false){try{return await parent.getDirectoryHandle(name,{create})}catch(e){if(e.name==='NotFoundError'&&!create)return null;throw e}}
async function file(parent,path,create=false){
  const parts=path.split('/');let current=parent
  for(const part of parts.slice(0,-1)){current=await directory(current,part,create);if(!current)return null}
  try{return await current.getFileHandle(parts.at(-1),{create})}catch(e){if(e.name==='NotFoundError'&&!create)return null;throw e}
}
async function read(parent,path){const handle=await file(parent,path);assert(handle,'Missing character assets.');return handle.getFile()}
async function json(parent,path){return JSON.parse(await(await read(parent,path)).text())}
async function exists(parent,path){return Boolean(await file(parent,path))}
async function write(parent,path,bytes){
  const handle=await file(parent,path,true),stream=await handle.createWritable()
  try{await stream.write(bytes);await stream.close()}catch(e){try{await stream.abort()}catch{}throw e}
}
const writeJSON=(parent,path,data)=>write(parent,path,JSON.stringify(data))
async function copyFile(target,path,source,sourcePath){
  if(target.connection?.capabilities.copy&&target.connection===source.connection)return target.copyFile(path,source,sourcePath)
  await write(target,path,await read(source,sourcePath))
}
async function removeFile(parent,path){const parts=path.split('/');let current=parent;for(const p of parts.slice(0,-1)){current=await directory(current,p);if(!current)return}try{await current.removeEntry(parts.at(-1))}catch(e){if(e.name!=='NotFoundError')throw e}}
async function names(parent,prefix=''){
  const result=[]
  for await(const [name,entry]of parent.entries()){
    const path=prefix+name
    if(entry.kind==='directory'){
      assert(!prefix&&['textures','pbr'].includes(name),'The character folder contains files outside its manifest.')
      result.push(...await names(entry,path+'/'))
    }else result.push(path)
  }
  return result
}
export function parseCatalog(document){
  assert(object(document)&&document.schema===1&&Array.isArray(document.characters)&&document.characters.length<=250,'Unsupported catalog format.')
  const entries=new Map(),namespaces=new Set()
  for(const value of document.characters){
    assert(object(value)&&slug.test(value.id)&&value.id!=='default'&&!entries.has(value.id),'Invalid or duplicate character ID.')
    const namespace=value.id.replaceAll('-','_');assert(!namespaces.has(namespace),'Character material namespace is already in use.');namespaces.add(namespace)
    for(const key of ['name','author'])assert(typeof value[key]==='string'&&value[key].trim().length>0&&value[key].length<=100,'Missing character name or credit.')
    assert(Array.isArray(value.files)&&value.files.length<=160,'Invalid character asset list.')
    const paths=new Set();let total=0
    for(const f of value.files){
      assert(object(f)&&validFile(f.path)&&!paths.has(f.path.toLowerCase()),'Invalid or duplicate asset path.')
      assert(Number.isSafeInteger(f.size)&&f.size>0&&f.size<=80*1024*1024&&/^[0-9a-f]{64}$/.test(f.sha256),'Invalid asset size or hash.')
      paths.add(f.path.toLowerCase());total+=f.size
    }
    assert(required.every(p=>paths.has(p))&&total<=220*1024*1024,'Character assets are missing or too large.')
    for(const key of ['createdAt','updatedAt'])if(value[key]!=null)assert(typeof value[key]==='string'&&value[key].length<=40&&Number.isFinite(Date.parse(value[key]))&&/(Z|[+-]\d\d:\d\d)$/.test(value[key]),'Invalid character date.')
    entries.set(value.id,{...value,sizeBytes:total})
  }
  return entries
}
export async function download(path,limit,progress=()=>{}){
  let response
  try{response=await fetch(REMOTE+path,{cache:'no-store',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(90000)})}
  catch{throw Error('Could not download the catalog asset from GitHub.')}
  assert(response.ok,'Could not download the catalog asset from GitHub.')
  const reader=response.body.getReader(),parts=[];let length=0
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;assert(length<=limit,'Catalog asset exceeds its size limit.');parts.push(value);progress(value.byteLength)}}finally{await reader.cancel().catch(()=>{})}
  const result=new Uint8Array(length);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length}return result
}
export async function asset(id,entry,progress){
  const bytes=await download(`characters/${id}/${entry.path}`,entry.size,progress)
  assert(bytes.byteLength===entry.size&&await hash(bytes)===entry.sha256,'Character file verification failed.')
  return bytes
}
export function verifyAssets(entry,assets){
  const parse=name=>JSON.parse(decoder.decode(assets.get(name)))
  const metadata=parse('character.json')
  assert(object(metadata)&&Object.keys(metadata).length===3&&['id','name','author'].every(k=>metadata[k]===entry[k]),'Character metadata differs from its catalog entry.')
  const prefix=`/hotw/characters/${entry.id}/`,paths=new Set(entry.files.map(f=>f.path))
  const materials=parse('materials.json'),materialFields=new Set(['Stages','alphaRef','alphaTest','castShadows','class','doubleSided','dynamicCubemap','mapTo','materialTag0','name','version'])
  const stageFields=new Set(['ambientOcclusionMap','baseColorFactor','baseColorMap','diffuseColor','diffuseMap','emissiveFactor','emissiveIntensityNits','emissiveMap','metallicFactor','metallicMap','normalMap','normalMapStrength','opacityFactor','opacityMap','roughnessFactor','roughnessMap','specular','specularPower'])
  const belongs=value=>typeof value==='string'&&value.startsWith(prefix)&&paths.has(value.slice(prefix.length))
  assert(object(materials)&&Object.keys(materials).length>0&&Object.keys(materials).length<=128,'Invalid materials.')
  for(const [name,mat]of Object.entries(materials)){
    assert(new RegExp(`^hotw_character_${entry.id.replaceAll('-','_')}_[a-zA-Z0-9_]+$`).test(name)&&object(mat)&&Object.keys(mat).every(k=>materialFields.has(k))&&mat.class==='Material'&&mat.name===name&&mat.mapTo===name,'Materials must belong to this character.')
    assert(Array.isArray(mat.Stages)&&mat.Stages.length>0&&mat.Stages.length<=4,'Invalid material stages.')
    for(const stage of mat.Stages){assert(object(stage)&&Object.keys(stage).every(k=>stageFields.has(k)),'Unsupported material stage.');for(const [k,v]of Object.entries(stage))if(k.endsWith('Map'))assert(belongs(v),'Materials may only reference this character’s textures.')}
  }
  const colors=parse('colors.json');assert(Array.isArray(colors)&&colors.length<=128,'Invalid color entries.')
  for(const color of colors)assert(object(color)&&Object.hasOwn(materials,color.material)&&['baseColorMap','diffuseMap'].includes(color.field)&&['skin','clothing'].includes(color.group)&&belongs(color.source)&&belongs(color.map),'Invalid recolor binding.')
  assert(object(parse('feet.json'))&&Object.hasOwn(parse('feet.json'),'contacts')&&object(parse('fullbody.json'))&&Object.hasOwn(parse('fullbody.json'),'meshes'),'Missing rig metadata.')
  const model=decoder.decode(assets.get('fullbody.xml'));assert(!/<!DOCTYPE|<!ENTITY/i.test(model),'External XML declarations are prohibited.')
  const xml=new DOMParser().parseFromString(model,'application/xml')
  assert(xml.documentElement.localName==='COLLADA'&&xml.documentElement.namespaceURI?.endsWith('/COLLADASchema')&&!xml.querySelector('parsererror'),'Invalid Collada model.')
  for(const node of xml.getElementsByTagName('*')){
    for(const key of ['url','source','target'])if(node.hasAttribute(key)&&(key!=='target'||node.localName.startsWith('instance_')))assert(node.getAttribute(key).startsWith('#'),'Model references must be internal.')
    if(node.localName==='init_from'){const value=node.textContent.trim();assert(paths.has(value)||belongs(value)||/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(value),'Invalid model texture reference.')}
  }
}
export class Library{
  constructor(root){this.root=root;this.catalog=new Map();this.progress=null;this.busy=false}
  async connect(){
    assert(await directory(this.root,'settings')&&await directory(this.root,'mods'),'Select the folder containing settings and mods.')
    this.hotw=await directory(this.root,'hotw',true);this.characters=await directory(this.hotw,'characters',true)
    this.transactions=await directory(this.hotw,'hub-transactions',true)
    for await(const [id,entry]of this.transactions.entries())if(entry.kind==='directory'&&slug.test(id)&&id!=='default')await this.recover(id)
    return this
  }
  async refresh(){const bytes=await download('catalog.json',4*1024*1024);this.catalog=parseCatalog(JSON.parse(decoder.decode(bytes)))}
  async owned(target,id){
    const data=await json(target,marker)
    assert(object(data)&&data.schema===1&&data.id===id&&Array.isArray(data.files)&&data.files.every(validFile)&&required.every(p=>data.files.includes(p)),'Invalid local character manifest.')
    const allowed=new Set([...data.files,marker]);assert((await names(target)).every(p=>allowed.has(p)),'The character folder contains files outside its manifest.')
    return data
  }
  async installed(){
    if(this.root.connection?.capabilities.inventory){
      const entries=await this.root.connection.inventory()
      const result=await Promise.all(entries.map(async item=>{
        const remote=this.catalog.get(item.id);let changed=false
        if(!item.localCharacter&&remote){
          if(item.revision)changed=item.revision!==await catalogRevision(remote)
          else changed=await this.changedLegacy(await directory(this.characters,item.id),remote)
        }
        return{id:item.id,name:item.name,author:item.author,local:item.localCharacter,updateAvailable:changed}
      }))
      return result.sort((a,b)=>a.id.localeCompare(b.id))
    }
    const result=[]
    for await(const [id,target]of this.characters.entries()){
      if(target.kind!=='directory'||!slug.test(id)||id==='default')continue
      try{
        if(await exists(target,pending))continue
        const data=await json(target,'character.json'),managed=await exists(target,marker)
        assert(data.id===id&&['name','author'].every(k=>typeof data[k]==='string'&&data[k].trim()&&data[k].length<=100),'Invalid local character metadata.')
        for(const path of required)assert(await exists(target,path),'Missing character assets.')
        const manifest=managed?await this.owned(target,id):null,remote=this.catalog.get(id)
        const update=Boolean(manifest&&remote&&(manifest.revision?manifest.revision!==await revision(remote.files):await this.changedLegacy(target,remote)))
        result.push({id,name:data.name,author:data.author,local:!managed,updateAvailable:update})
      }catch(e){if(['NotAllowedError','SecurityError','GameConnectionError'].includes(e.name))throw e}
    }
    return result.sort((a,b)=>a.id.localeCompare(b.id))
  }
  async changedLegacy(target,entry){
    const manifest=await this.owned(target,entry.id)
    if(manifest.files.length!==entry.files.length||!entry.files.every(f=>manifest.files.includes(f.path)))return true
    for(const f of entry.files){const local=await file(target,f.path);if(!local)return true;const data=await local.getFile();if(data.size!==f.size||await hash(await data.arrayBuffer())!==f.sha256)return true}return false
  }
  async signal(){await writeJSON(this.hotw,'characters-changed.json',{revision:crypto.randomUUID()})}
  async recover(id){
    const transaction=await directory(this.transactions,id);if(!transaction)return
    if(!await exists(transaction,'transaction.json'))return // A backup was interrupted before touching the character.
    const record=await json(transaction,'transaction.json')
    assert(record.schema===1&&record.id===id&&['prepared','committed'].includes(record.phase)&&['download','update','remove'].includes(record.action)&&Array.isArray(record.allowed)&&record.allowed.every(p=>validFile(p)||p===marker),'Invalid character transaction.')
    let target=await directory(this.characters,id)
    if(record.phase==='committed'){
      if(target&&await exists(target,pending))await target.removeEntry(pending)
    }else{
      if(target){
        const allowed=new Set([...record.allowed,pending]);assert((await names(target)).every(p=>allowed.has(p)),'The character folder contains files outside its manifest.')
        await this.characters.removeEntry(id,{recursive:true})
      }
      if(record.hadOriginal){
        const backup=await directory(transaction,'backup');const original=await this.owned(backup,id)
        target=await directory(this.characters,id,true);await writeJSON(target,pending,{schema:1,id})
        for(const path of [...original.files,marker])await copyFile(target,path,backup,path)
        await target.removeEntry(pending)
      }
    }
    await this.signal();await this.transactions.removeEntry(id,{recursive:true})
  }
  async change(id,action){
    assert(slug.test(id)&&id!=='default'&&['download','update','remove'].includes(action),'Invalid character action.')
    assert(!this.busy,'Please wait for the current download.');this.busy=true
    try{
      // All tabs on this origin share this lease. A second tab cannot interleave writes.
      return await navigator.locks.request('hotw-hub-character-writes',async()=>{
        await this.recover(id)
        let target=await directory(this.characters,id),old=null
        if(action==='download')assert(!target,'A character already exists at this location.')
        else{assert(target&&await exists(target,marker),'Only characters installed through the catalog can be changed.');old=await this.owned(target,id)}
        const entry=this.catalog.get(id),assets=new Map()
        if(action!=='remove'){
          assert(entry,'Refresh the character catalog first.');this.progress={phase:'download',received:0,total:entry.sizeBytes}
          const queue=[...entry.files]
          const workers=await Promise.allSettled(Array.from({length:4},async()=>{
            try{while(queue.length){const f=queue.shift();assets.set(f.path,await asset(id,f,n=>this.progress.received+=n))}}
            catch(e){queue.length=0;throw e}
          }))
          const failed=workers.find(item=>item.status==='rejected');if(failed)throw failed.reason
          this.progress.phase='verify';verifyAssets(entry,assets)
        }
        // The journal and complete original copy are durable before any live file changes.
        const transaction=await directory(this.transactions,id,true)
        this.progress={phase:action==='remove'?'remove':'prepare',received:0,total:0}
        if(old){const backup=await directory(transaction,'backup',true);for(const path of [...old.files,marker])await copyFile(backup,path,target,path)}
        const record={schema:1,id,action,phase:'prepared',hadOriginal:Boolean(old),allowed:[...new Set([...(old?.files||[]),...(entry?.files.map(f=>f.path)||[]),marker])]}
        await writeJSON(transaction,'transaction.json',record)
        try{
          target=target||await directory(this.characters,id,true);await writeJSON(target,pending,{schema:1,id})
          if(action==='remove')await this.characters.removeEntry(id,{recursive:true})
          else{
            this.progress={phase:'install',received:0,total:entry.sizeBytes}
            for(const [path,bytes]of assets){await write(target,path,bytes);this.progress.received+=bytes.byteLength;assets.delete(path)}
            for(const path of old?.files||[])if(!entry.files.some(f=>f.path===path))await removeFile(target,path)
            await writeJSON(target,marker,{schema:1,id,files:entry.files.map(f=>f.path),revision:await revision(entry.files)})
          }
          record.phase='committed';await writeJSON(transaction,'transaction.json',record)
          if(action!=='remove')await target.removeEntry(pending)
        }catch(e){await this.recover(id);throw e}
        // A failed notification can be retried by recovery without undoing a committed install.
        await this.recover(id)
      })
    }finally{this.progress=null;this.busy=false}
  }
  async portrait(id,local){
    assert(slug.test(id)&&id!=='default','Invalid character.')
    let bytes
    if(local){const target=await directory(this.characters,id);assert(target,'Invalid character.');const data=await read(target,'thumbnail.png');assert(data.size<=1024*1024,'Character portrait exceeds its size limit.');bytes=await data.arrayBuffer()}
    else{const entry=this.catalog.get(id)?.files.find(f=>f.path==='thumbnail.png');assert(entry&&entry.size<=1024*1024,'Invalid character portrait.');bytes=await asset(id,entry)}
    return URL.createObjectURL(new Blob([bytes],{type:'image/png'}))
  }
}

let database
async function store(){
  if(!database)database=new Promise((resolve,reject)=>{const request=indexedDB.open('hotw-hub',1);request.onupgradeneeded=()=>request.result.createObjectStore('preferences');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
  return database
}
async function preference(key,value,connection){
  if(connection){
    if(value!==undefined)await connection.request('preferences','','PUT',JSON.stringify({language:value}))
    return(await connection.json('preferences'))[key]
  }
  const db=await store();return new Promise((resolve,reject)=>{
    const write=value!==undefined,tx=db.transaction('preferences',write?'readwrite':'readonly'),request=write?tx.objectStore('preferences').put(value,key):tx.objectStore('preferences').get(key)
    let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  })
}
export class Hub{
  constructor(languages){this.languages=languages;this.language='auto';this.library=null;this.remembered=null}
  locale(){
    const raw=this.language==='auto'?(this.gameLanguage||navigator.language):this.language,value=raw.replaceAll('_','-').toLowerCase()
    const exact=this.languages.find(l=>[l.value.replaceAll('_','-').toLowerCase(),l.locale.toLowerCase()].includes(value))
    return(exact||this.languages.find(l=>l.value.slice(0,2).toLowerCase()===value.slice(0,2)))?.value||'en-US'
  }
  async snapshot(){
    const installed=this.library?await this.library.installed():[]
    return {profile:this.library?this.library.root.name:null,language:this.language,locale:this.locale(),connection:this.library?{port:Number(this.connection.base.split(':').at(-1)),session:this.connection.session.slice(0,8)+'…'+this.connection.session.slice(-8)}:null,
      installed,catalog:[...(this.library?.catalog.values()||[])].map(entry=>{const item=installed.find(i=>i.id===entry.id);return{...entry,installed:Boolean(item),local:Boolean(item?.local),updateAvailable:Boolean(item?.updateAvailable)}})}
  }
  async initialize(){
    this.connection=launchConnection()
    if(this.connection){const saved=await this.connection.json('preferences');this.language=saved.language||'auto';this.gameLanguage=saved.gameLanguage}
    else this.language=await preference('language')||'auto'
    if(this.connection)await this.connectGame()
    return this.snapshot()
  }
  async connectGame(){
    assert(this.connection,'Open HOTW Hub from inside BeamNG.drive.')
    const root=await this.connection.connect()
    this.library=await new Library(root).connect();rememberConnection(this.connection)
    return this.snapshot()
  }
  
  async refresh(){assert(this.library,'Open HOTW Hub from inside BeamNG.drive.');await this.library.refresh();return this.snapshot()}
  installed_characters(){return this.snapshot()}
  async set_language(value){assert(value==='auto'||this.languages.some(l=>l.value===value),'Invalid language.');await preference('language',value,this.connection);this.language=value;return this.snapshot()}
  portrait(id,local){return this.library.portrait(id,local)}
  async change(id,action){await this.library.change(id,action);return this.snapshot()}
  async download_progress(){return this.library?.progress}
  async check_connection(){if(this.library)await this.connection.request('session')}
  disconnect(){this.library=null;this.connection=null;forgetConnection()}
  open_source(){window.open('https://github.com/1Matzh/hotw-hub','_blank','noopener,noreferrer')}
}
