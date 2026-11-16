import {Hub} from './web-library.js'
const languageCatalog = await fetch('./languages.json',{cache:'no-store'}).then(response=>response.json())
const hubApi = new Hub(languageCatalog.languages)
// Hands on the Wheel (HOTW)
// Copyright (c) 2026 1Matzh
// SPDX-License-Identifier: MIT
const $ = id => document.getElementById(id)
let size = new Intl.NumberFormat(undefined, {maximumFractionDigits: 1})
let dateFormat = new Intl.DateTimeFormat('en-GB', {day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'})
let relativeTime = new Intl.RelativeTimeFormat('en', {numeric: 'auto'})
const batchSize = 6
const portraits = new Map()
let state = {profile: null, catalog: [], installed: []}
let view = 'catalog'
let visibleCount = batchSize
let order = 'new'
let busy = false
let catalogLoading = false
let revision = 0


let activeLocale = 'en-US'
let selectedLanguage = 'auto'
const staticCopy = []
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {acceptNode: node =>
  node.parentElement?.closest('script,style,svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT})
while (walker.nextNode()) {
  const node = walker.currentNode, source = node.textContent.trim()
  if (source) staticCopy.push({node, source, prefix:node.textContent.match(/^\s*/)[0], suffix:node.textContent.match(/\s*$/)[0]})
}
const staticAttributes = [...document.querySelectorAll('[aria-label],[title]')].flatMap(node =>
  ['aria-label','title'].filter(name=>node.hasAttribute(name)).map(name=>({node,name,source:node.getAttribute(name)})))
function t(source, parameters) {
  if (typeof source !== 'string') return source
  const translated = languageCatalog.messages[activeLocale]?.[source] || source
  return parameters ? translated.replace(/\{(\w+)\}/g,(match,key)=>parameters[key]??match) : translated
}
function applyLanguage(snapshot) {
  const locale = snapshot.locale || activeLocale
  selectedLanguage = snapshot.language || selectedLanguage
  if (activeLocale !== locale || !$('language').options.length) {
    activeLocale = locale
    const tag = languageCatalog.languages.find(item=>item.value===locale)?.locale || 'en-US'
    document.documentElement.lang = tag
    dateFormat = new Intl.DateTimeFormat(tag, {day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})
    relativeTime = new Intl.RelativeTimeFormat(tag, {numeric:'auto'})
    size = new Intl.NumberFormat(tag, {maximumFractionDigits:1})
    for(const {node,source,prefix,suffix} of staticCopy) node.textContent = prefix+t(source)+suffix
    for(const {node,name,source} of staticAttributes) node.setAttribute(name,t(source))
    $('language').replaceChildren(...[{value:'auto',label:t('Automatic')},...languageCatalog.languages].map(item=>{
      const option = element('option','',item.label); option.value=item.value; return option
    }))
  }
  $('language').value = selectedLanguage

}

function status(message, error = false) {
  for (const id of ['status', 'setup-status']) {
    $(id).hidden = !message || (id === 'status' ? !state.profile : Boolean(state.profile))
    $(id).textContent = t(message)
    $(id).classList.toggle('error', error)
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = t(text)
  return node
}

function drawIcon(svg, name) {
  const symbol = $('icon-' + name)
  svg.setAttribute('class', 'icon')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('viewBox', symbol.getAttribute('viewBox'))
  svg.replaceChildren(...Array.from(symbol.children, shape => shape.cloneNode(true)))
  return svg
}

function icon(name) {
  return drawIcon(document.createElementNS('http://www.w3.org/2000/svg', 'svg'), name)
}

for (const svg of document.querySelectorAll('[data-icon]')) drawIcon(svg, svg.dataset.icon)

function button(label, tone, action, glyph) {
  const node = element('button', tone, label)
  node.disabled = busy
  node.onclick = action
  if (glyph) node.prepend(icon(glyph))
  return node
}

function render() {
  applyLanguage(state)
  const preferences = view === 'settings'
  $('settings-page').hidden = !preferences
  $('settings').setAttribute('aria-pressed', preferences)
  $('language').disabled = busy

  $('setup').hidden = Boolean(state.profile)
  $('main-view').hidden = !state.profile
  $('navigation').hidden = !state.profile
  $('profile').textContent = state.profile || t('Open HOTW Hub from BeamNG.drive')
  $('installed-tab').title = `${t('Installed')} (${state.installed.length})`
  $('view-label').textContent = t(view === 'catalog' ? 'Character catalog' : preferences ? 'Settings' : 'Installed')
  $('catalog-tab').setAttribute('aria-pressed', view === 'catalog')
  $('installed-tab').setAttribute('aria-pressed', view === 'installed')
  $('choose').disabled = busy
  $('choose-setup').disabled = busy
  $('catalog-filters').hidden = view !== 'catalog'
  $('sort-new').setAttribute('aria-pressed', order === 'new')
  $('sort-updated').setAttribute('aria-pressed', order === 'updated')
  const list = sortedCharacters()
  const visible = list.slice(0, visibleCount)
  $('load-more').hidden = visible.length >= list.length
  const loading = view === 'catalog' && catalogLoading
  $('catalog-loading').hidden = !loading
  $('main-view').setAttribute('aria-busy', loading)
  $('shelf').hidden = preferences || !visible.length || loading
  $('empty-state').hidden = preferences || Boolean(visible.length) || busy
  $('empty-title').textContent = t(view === 'installed' ? 'No characters installed' : 'No characters available')
  $('empty').textContent = view === 'installed'
    ? t('Find drivers and passengers in the catalog. Your characters will appear here once installed.')
    : t('The catalog is empty or could not be loaded.')
  $('browse-catalog').hidden = view !== 'installed'
  $('browse-catalog').disabled = busy
  portraitObserver.disconnect()
  $('cards').replaceChildren(...visible.map(characterCard))
  listObserver.unobserve($('load-more'))
  listObserver.observe($('load-more'))
}

function sortedCharacters() {
  if (view === 'settings') return []
  if (view !== 'catalog') return state.installed
  const date = character => Date.parse(order === 'new' ? character.createdAt : character.updatedAt || character.createdAt) || 0
  return [...state.catalog].sort((a, b) => date(b) - date(a))
}

function loadMore() {
  if (busy || !state.profile || view === 'settings') return
  const list = sortedCharacters()
  const next = list.slice(visibleCount, visibleCount + batchSize)
  visibleCount += next.length
  $('cards').append(...next.map(characterCard))
  $('load-more').hidden = visibleCount >= list.length
  listObserver.unobserve($('load-more'))
  listObserver.observe($('load-more'))
}

const portraitObserver = new IntersectionObserver(entries => {
  for (const {target: portrait, isIntersecting} of entries) {
    if (!isIntersecting || !portrait.isConnected) continue
    portraitObserver.unobserve(portrait)
    const image = portrait.querySelector('img')
    const character = state[view].find(item => item.id === image.dataset.character)
    if (character) showPortrait(image, character)
  }
}, {root: document.querySelector('.workspace'), rootMargin: '80px'})

const listObserver = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting)) loadMore()
}, {root: document.querySelector('.workspace')})
listObserver.observe($('load-more'))

function characterCard(character) {
  const card = element('article', 'card')
  const portrait = element('div', 'portrait')
  const image = element('img')
  image.alt = ''
  portrait.append(image)
  image.dataset.character = character.id
  portraitObserver.observe(portrait)
  const details = element('div', 'card-details')
  const author = element('p', 'card-author', t('by')+' ')
  author.append(element('span', '', character.author))
  details.append(element('h2', '', character.name), author)
  const metadata = view === 'installed' && !character.local
    ? state.catalog.find(entry => entry.id === character.id) || character : character
  const dates = characterDates(metadata)
  if (dates.childElementCount) details.append(dates)
  const actions = element('div', 'card-actions')
  actions.append(...characterActions(character))
  if (view === 'catalog' && character.sizeBytes) {
    const downloadSize = element('span', 'card-size muted', size.format(character.sizeBytes / 1000000) + ' MB')
    downloadSize.title = t("Download size")
    downloadSize.prepend(icon('hdd-fill'))
    actions.append(downloadSize)
  }
  card.append(portrait, details, actions)
  return card
}

function characterDates(character) {
  const dates = element('div', 'card-meta muted')
  const created = Date.parse(character.createdAt || '')
  const updated = Date.parse(character.updatedAt || character.createdAt || '')
  const age = element('time', 'card-updated', 'â€”')
  age.title = t("Update date unavailable")
  if (Number.isFinite(updated)) {
    const days = Math.max(0, Math.floor((Date.now() - updated) / 86400000))
    const unit = days >= 365 ? 'year' : days >= 30 ? 'month' : 'day'
    const amount = unit === 'year' ? Math.floor(days / 365) : unit === 'month' ? Math.floor(days / 30) : days
    age.textContent = relativeTime.format(-amount, unit)
    age.dateTime = character.updatedAt || character.createdAt
    age.title = t('Updated')+' ' + dateFormat.format(updated)
  }
  age.setAttribute('aria-label', Number.isFinite(updated) ? t('Updated')+' ' + age.textContent : age.title)
  age.prepend(icon('arrow-clockwise'))
  dates.append(age)
  if (Number.isFinite(created)) {
    const published = element('time', 'card-published', dateFormat.format(created))
    published.dateTime = character.createdAt
    published.title = t('Published')+' ' + dateFormat.format(created)
    published.prepend(icon('upload'))
    dates.append(published)
  }
  return dates
}

function characterActions(character) {
  const actions = []
  if (character.updateAvailable) {
    actions.push(button('Update', 'primary', () => change(character, 'update'), 'arrow-clockwise'))
  } else if (view === 'installed' || character.installed) {
    const installed = element('span', 'install-status', 'Installed')
    installed.prepend(icon('check-circle-fill'))
    actions.push(installed)
  } else {
    actions.push(button('Download', 'primary', () => change(character, 'download'), 'download'))
  }
  if (view === 'installed' && character.local) {
    const local = element('span', 'muted', 'Local')
    local.title = t("Created locally. Manage its files in hotw/characters.")
    actions.push(local)
  } else if (view === 'installed') {
    actions.push(button('Remove', 'secondary', () => confirmRemoval(character), 'trash3-fill'))
  }
  return actions
}

function showPortrait(image, character) {
  if (!character) {
    image.removeAttribute('src')
    delete image.dataset.portrait
    return
  }
  const local = view === 'installed' || Boolean(character.installed)
  const key = `${revision}/${local}/${character.id}`
  if (image.dataset.portrait === key) return
  image.dataset.portrait = key
  image.removeAttribute('src')
  if (!portraits.has(key)) {
    portraits.set(key, hubApi.portrait(character.id, local).catch(() => ''))
  }
  portraits.get(key).then(data => {
    if (data && image.isConnected && image.dataset.portrait === key) image.src = data
  })
}

function invalidatePortraits() {
  for (const promise of portraits.values()) promise.then(url=>{if(url.startsWith('blob:'))URL.revokeObjectURL(url)})
  portraits.clear()
  revision++
}

async function run(message, operation) {
  if (busy) return
  busy = true
  status(message)
  render()
  try {
    status(await operation() || '')
  } catch (error) {
    status(error.message || String(error), true)
  } finally {
    busy = false
    render()
  }
}

function refresh() {
  if (busy) return
  catalogLoading = true
  return run('', async () => {
    try {
      state = await hubApi.refresh()
      invalidatePortraits()
    } finally {
      catalogLoading = false
    }
  })
}

function change(character, action) {
  const removing = action === 'remove'
  return run(removing ? t('Removing {name}â€¦',{name:character.name}) : '', async () => {
    const finish = removing ? null : trackDownload(character.name)
    try {
      state = await hubApi.change(character.id, action)
      invalidatePortraits()
      return state.notice
    } finally {
      finish?.()
    }
  })
}

function trackDownload(name) {
  const transfer = $('transfer')
  const bar = $('download-progress')
  const message = $('transfer-message')
  const count = $('transfer-count')
  const percent = $('transfer-percent')
  transfer.hidden = false
  bar.removeAttribute('value')
  message.textContent = t('Downloading {name}â€¦',{name})
  count.textContent = ''
  percent.textContent = ''
  let active = true
  let reading = false
  const timer = setInterval(async () => {
    if (reading) return
    reading = true
    try {
      const progress = await hubApi.download_progress()
      if (!active || !progress?.total) return
      const ratio = Math.min(progress.received / progress.total, 1)
      bar.value = ratio
      count.textContent = `${size.format(progress.received / 1000000)} / ${size.format(progress.total / 1000000)} MB`
      percent.textContent = `${Math.round(ratio * 100)}%`
      if (progress.phase === 'restart') message.textContent = t('Restarting HOTW Hubâ€¦')
      else if (ratio === 1) message.textContent = t('Verifying and installing {name}â€¦',{name})
    } catch {
      // The operation still reports its own result if the progress request fails.
    } finally {
      reading = false
    }
  }, 120)
  return () => {
    active = false
    clearInterval(timer)
    transfer.hidden = true
  }
}

function confirmRemoval(character) {
  const dialog = $('confirm')
  $('confirm-title').textContent = t('Remove {name}?',{name:character.name})
  $('confirm-remove').onclick = () => {
    dialog.close()
    change(character, 'remove')
  }
  dialog.showModal()
}

function selectView(next) {
  if (view === next) return
  view = next
  visibleCount = batchSize
  document.querySelector('.workspace').scrollTop = 0
  render()
  if (view === 'catalog') refresh()
  else if (view === 'installed') run('', async () => {
    state = await hubApi.installed_characters()
    invalidatePortraits()
  })
}

function selectOrder(next) {
  if (order === next) return
  order = next
  visibleCount = batchSize
  document.querySelector('.workspace').scrollTop = 0
  render()
}

$('catalog-tab').onclick = () => selectView('catalog')
$('installed-tab').onclick = () => selectView('installed')
$('browse-catalog').onclick = () => selectView('catalog')
$('sort-new').onclick = () => selectOrder('new')
$('sort-updated').onclick = () => selectOrder('updated')
$('source').onclick = () => hubApi.open_source()
$('settings').onclick = () => selectView('settings')
$('language').onchange = event => {
  const value = event.target.value
  return run('', async () => { state = await hubApi.set_language(value) })
}
$('cancel-remove').onclick = () => $('confirm').close()
async function reconnectGame() {
  let changed = false
  await run('', async () => {
    const selection = await hubApi.connectGame()
    if (selection) {
      if (selection.error) throw Error(selection.error)
      state = selection
      changed = true
      invalidatePortraits()
    }
  })
  if (changed && view === 'catalog') refresh()
}
$('choose').onclick = reconnectGame
$('choose-setup').onclick = reconnectGame

await run('', async () => {
  state = await hubApi.initialize()
})
if (state.profile) refresh()
else $('choose-setup').hidden = !hubApi.connection

window.addEventListener('hashchange', async () => {
  if (!location.hash.includes('session=')) return
  await run('', async () => { state = await hubApi.initialize() })
  if (state.profile) refresh()
  else $('choose-setup').hidden = !hubApi.connection
})
