// Hands on the Wheel (HOTW)
// Copyright (c) 2026 1Matzh
// SPDX-License-Identifier: MIT
export function characterAuthors(metadata){
  const names=metadata?.authors??(typeof metadata?.author==='string'?metadata.author.split('|'):null)
  if(!Array.isArray(names)||names.length<1||names.length>10)return null
  const clean=[]
  for(const name of names){
    if(typeof name!=='string'||!name.trim()||name.trim().length>100||clean.includes(name.trim()))return null
    clean.push(name.trim())
  }
  return clean
}
export function authorParts(metadata,locale='en-US'){
  const names=characterAuthors(metadata)||[]
  return new Intl.ListFormat(locale.replaceAll('_','-'),{style:'long',type:'conjunction'}).formatToParts(names)
}
export function formatAuthors(metadata,locale='en-US'){
  return authorParts(metadata,locale).map(part=>part.value).join('')
}
