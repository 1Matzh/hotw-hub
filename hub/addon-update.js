// Hands on the Wheel (HOTW)
// Copyright (c) 2026 1Matzh
// SPDX-License-Identifier: MIT
export const RELEASES_API='https://api.github.com/repos/1Matzh/hotw-hub/releases/latest'
const repository='https://github.com/1Matzh/hotw-hub/releases/'
const version=v=>typeof v==='string'&&/^v?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(v)?v.replace(/^v/,'').split('.').map(Number):null
export function newer(candidate,current){
  const a=version(candidate),b=version(current)
  if(!a||!b)return false
  for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]}
  return false
}
export function parseUpdate(release,current){
  if(!release||release.draft||release.prerelease||!newer(release.tag_name,current))return null
  const tag=release.tag_name,v=tag.replace(/^v/,''),name=`hotw-hub-addon-${v}.zip`
  const asset=Array.isArray(release.assets)&&release.assets.find(a=>a.name===name&&a.state==='uploaded')
  const expected=repository+'download/'+tag+'/'+name
  if(!asset||asset.browser_download_url!==expected||!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>16*1024*1024)return null
  if(release.html_url!==repository+'tag/'+tag)return null
  return {version:v,url:release.html_url,downloadUrl:expected,size:asset.size}
}
export async function checkForUpdate(current){
  try{
    const response=await fetch(RELEASES_API,{credentials:'omit',cache:'no-cache',redirect:'error',headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(8000)})
    if(!response.ok)return null
    const text=await response.text();if(text.length>256*1024)return null
    return parseUpdate(JSON.parse(text),current)
  }catch{return null}
}
