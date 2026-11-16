// Hands on the Wheel (HOTW)
// Copyright (c) 2026 1Matzh
// SPDX-License-Identifier: MIT
// The game owns the filesystem root. The website receives no OS path and has
// no filesystem picker, arbitrary-directory access or engine-command endpoint.
export class GameConnection{
  constructor(port,session){
    if(!/^\d{4,5}$/.test(String(port))||Number(port)<1024||Number(port)>65535||!/^[0-9a-f]{64}$/.test(session))throw Error('Open HOTW Hub from inside BeamNG.drive.')
    this.base=`http://127.0.0.1:${port}`;this.session=session
  }
  async request(endpoint,path='',method='GET',body,recursive=false){
    const response=await fetch(`${this.base}/${endpoint}?path=${encodeURIComponent(path)}${recursive?'&recursive=1':''}`,{method,body,
      headers:{Authorization:`Bearer ${this.session}`},credentials:'omit',cache:'no-store',redirect:'error',targetAddressSpace:'loopback',signal:AbortSignal.timeout(method==='PUT'?120000:15000)})
    if(response.status===404)throw new DOMException('Not found.','NotFoundError')
    if(!response.ok)throw Error('The game rejected this Hub request.')
    return response
  }
  async connect(){const info=await(await this.request('session')).json();if(info.protocol!==1||!info.success)throw Error('Please update Hands on the Wheel.');return new GameDirectory(this,'','BeamNG.drive',true)}
}
class GameFile{
  constructor(connection,path,name){this.connection=connection;this.path=path;this.name=name;this.kind='file'}
  async getFile(){const bytes=await(await this.connection.request('file',this.path)).blob();return new File([bytes],this.name)}
  async createWritable(){
    let contents=null
    return{write:async value=>{contents=value},close:async()=>{if(contents!==null)await this.connection.request('file',this.path,'PUT',contents)},abort:async()=>{contents=null}}
  }
}
class GameDirectory{
  constructor(connection,path,name,root=false){this.connection=connection;this.path=path;this.name=name;this.kind='directory';this.root=root}
  child(name){if(typeof name!=='string'||!name||name==='.'||name==='..'||/[/\\\x00]/.test(name))throw Error('Invalid character path.');return this.path?this.path+'/'+name:name}
  async getDirectoryHandle(name,{create=false}={}){
    if(this.root){
      if(name==='settings'||name==='mods')return new GameDirectory(this.connection,'',name)
      if(name==='hotw')return new GameDirectory(this.connection,'','hotw')
      throw new DOMException('Not found.','NotFoundError')
    }
    const path=this.child(name)
    try{const info=await(await this.connection.request('stat',path)).json();if(info.kind!=='directory')throw new DOMException('Not a directory.','TypeMismatchError')}
    catch(e){if(e.name!=='NotFoundError'||!create)throw e;await this.connection.request('directory',path,'POST')}
    return new GameDirectory(this.connection,path,name)
  }
  async getFileHandle(name,{create=false}={}){
    const path=this.child(name)
    try{const info=await(await this.connection.request('stat',path)).json();if(info.kind!=='file')throw new DOMException('Not a file.','TypeMismatchError')}
    catch(e){if(e.name!=='NotFoundError'||!create)throw e}
    return new GameFile(this.connection,path,name)
  }
  async*entries(){
    const data=(await(await this.connection.request('list',this.path)).json()).entries
    // BeamNG serializes an empty Lua table as {}, including directory lists.
    const entries=Array.isArray(data)?data:(data&&Object.keys(data).length===0?[]:null)
    if(!entries)throw Error('Invalid directory response from BeamNG.drive.')
    for(const entry of entries){const path=this.child(entry.name);yield[entry.name,entry.kind==='directory'?new GameDirectory(this.connection,path,entry.name):new GameFile(this.connection,path,entry.name)]}
  }
  async removeEntry(name,{recursive=false}={}){
    const path=this.child(name),info=await(await this.connection.request('stat',path)).json()
    await this.connection.request(info.kind==='directory'?'directory':'file',path,'DELETE',undefined,recursive)
  }
}
export function launchConnection(){
  const fragment=new URLSearchParams(location.hash.slice(1))
  const candidate=fragment.has('session')?{port:fragment.get('port'),session:fragment.get('session')}:JSON.parse(sessionStorage.getItem('hotw-game-session')||'null')
  if(fragment.has('session'))history.replaceState(null,'',location.pathname+location.search)
  if(!candidate)return null
  try{return new GameConnection(candidate.port,candidate.session)}catch{return null}
}
export function rememberConnection(connection){sessionStorage.setItem('hotw-game-session',JSON.stringify({port:connection.base.split(':').at(-1),session:connection.session}))}
