// Hands on the Wheel (HOTW)
// Copyright (c) 2026 1Matzh
// SPDX-License-Identifier: MIT
const $ = id => document.getElementById(id)
const size = new Intl.NumberFormat(undefined, {maximumFractionDigits: 1})
const pageSize = 6
const portraits = new Map()
let state = {profile: null, catalog: [], installed: []}
let view = 'catalog'
let page = 0
let busy = false
let revision = 0

function status(message, error = false) {
  $('status').hidden = !message
  $('status').textContent = message
  $('status').classList.toggle('error', error)
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
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
  $('profile').textContent = state.profile || 'Choose the folder containing settings and mods.'
  $('installed-tab').title = `Installed (${state.installed.length})`
  $('view-label').textContent = view === 'catalog' ? 'Character catalog' : 'Installed'
  $('view-caption').textContent = view === 'catalog' ? 'Drivers and passengers for BeamNG.drive'
    : `${state.installed.length} ${state.installed.length === 1 ? 'character' : 'characters'} in this BeamNG user folder`
  $('catalog-tab').setAttribute('aria-pressed', view === 'catalog')
  $('installed-tab').setAttribute('aria-pressed', view === 'installed')
  $('refresh').disabled = busy || !state.profile
  $('choose').disabled = busy
  $('choose-empty').disabled = busy
  $('choose-empty').hidden = Boolean(state.profile)
  const list = state[view]
  const pages = Math.max(1, Math.ceil(list.length / pageSize))
  page = Math.min(page, pages - 1)
  $('pagination').hidden = pages === 1
  $('previous').disabled = page === 0
  $('next').disabled = page + 1 === pages
  $('page-label').textContent = `Page ${page + 1} of ${pages}`
  const visible = list.slice(page * pageSize, (page + 1) * pageSize)
  $('shelf').hidden = !visible.length
  $('empty-state').hidden = Boolean(visible.length) || busy
  $('empty').textContent = state.profile
    ? (view === 'installed' ? 'No Hub characters are installed in this profile.' : 'The catalog is empty or could not be loaded.')
    : 'Select your BeamNG user folder to get started.'
  $('cards').replaceChildren(...visible.map(characterCard))
}

function characterCard(character) {
  const card = element('article', 'card')
  const portrait = element('div', 'portrait')
  const image = element('img')
  image.alt = ''
  portrait.append(image)
  showPortrait(image, character)
  const details = element('div', 'card-details')
  details.append(element('h2', '', character.name), element('p', 'muted', 'by ' + character.author))
  const actions = element('div', 'card-actions')
  actions.append(...characterActions(character))
  if (view === 'catalog' && character.sizeBytes) {
    actions.append(element('span', 'card-size muted', size.format(character.sizeBytes / 1000000) + ' MB'))
  }
  card.append(portrait, details, actions)
  return card
}

function characterActions(character) {
  const actions = []
  if (character.updateAvailable) {
    actions.push(button('Update', 'primary', () => change(character, 'update'), 'download'))
  } else if (view === 'installed' || character.installed) {
    const installed = element('span', 'install-status', 'Installed')
    installed.prepend(icon('check-circle-fill'))
    actions.push(installed)
  } else {
    actions.push(button('Download', 'primary', () => change(character, 'download'), 'download'))
  }
  if (view === 'installed') {
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
    portraits.set(key, pywebview.api.portrait(character.id, local).catch(() => ''))
  }
  portraits.get(key).then(data => {
    if (data && image.isConnected && image.dataset.portrait === key) image.src = data
  })
}

function invalidatePortraits() {
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
  return run('Loading the catalog…', async () => {
    state = await pywebview.api.refresh()
    invalidatePortraits()
  })
}

function change(character, action) {
  const removing = action === 'remove'
  return run(removing ? `Removing ${character.name}…` : '', async () => {
    const finish = removing ? null : trackDownload(character.name)
    try {
      state = await pywebview.api.change(character.id, action)
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
  transfer.hidden = false
  bar.removeAttribute('value')
  message.textContent = `Downloading ${name}…`
  count.textContent = ''
  let active = true
  let reading = false
  const timer = setInterval(async () => {
    if (reading) return
    reading = true
    try {
      const progress = await pywebview.api.download_progress()
      if (!active || !progress?.total) return
      const ratio = Math.min(progress.received / progress.total, 1)
      bar.value = ratio
      count.textContent = `${size.format(progress.received / 1000000)} / ${size.format(progress.total / 1000000)} MB`
      if (ratio === 1) message.textContent = `Verifying and installing ${name}…`
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
  $('confirm-title').textContent = `Remove ${character.name}?`
  $('confirm-remove').onclick = () => {
    dialog.close()
    change(character, 'remove')
  }
  dialog.showModal()
}

function selectView(next) {
  if (view === next) return
  view = next
  page = 0
  render()
}

$('catalog-tab').onclick = () => selectView('catalog')
$('installed-tab').onclick = () => selectView('installed')
$('previous').onclick = () => { page--; render() }
$('next').onclick = () => { page++; render() }
$('refresh').onclick = refresh
$('source').onclick = () => pywebview.api.open_source()
$('release').onclick = () => pywebview.api.open_release()
async function windowAction(action) {
  try {
    const maximized = await pywebview.api.window_action(action)
    if (typeof maximized === 'boolean') setWindowState(maximized)
  } catch (error) {
    status(error.message || String(error), true)
  }
}

function setWindowState(maximized) {
  const button = $('maximize')
  button.title = maximized ? 'Restore' : 'Maximize'
  button.setAttribute('aria-label', button.title)
  button.replaceChildren(icon(maximized ? 'copy' : 'square'))
}

$('minimize').onclick = () => windowAction('minimize')
$('maximize').onclick = $('title-drag').ondblclick = () => windowAction('maximize')
$('close-window').onclick = () => windowAction('close')
window.addEventListener('hotw-window-state', ({detail}) => setWindowState(detail))
$('settings').onclick = () => $('preferences').showModal()
$('close-settings').onclick = () => $('preferences').close()
$('cancel-remove').onclick = () => $('confirm').close()
async function chooseFolder() {
  if ($('preferences').open) $('preferences').close()
  let changed = false
  await run('Opening the folder picker…', async () => {
    const selection = await pywebview.api.choose_profile()
    if (selection) {
      state = selection
      changed = true
      invalidatePortraits()
    }
  })
  if (changed) refresh()
}
$('choose').onclick = chooseFolder
$('choose-empty').onclick = chooseFolder

window.addEventListener('pywebviewready', async () => {
  pywebview.api.check_update().then(tag => {
    if (!tag) return
    $('release').textContent = `Get update ${tag}`
    $('release').title = 'Open the release to download and replace the portable app.'
    $('release').hidden = false
  }).catch(() => {})
  await run('Finding your BeamNG profile…', async () => {
    state = await pywebview.api.initialize()
    if (state.error) throw Error(state.error)
  })
  if (state.profile) refresh()
}, {once: true})
