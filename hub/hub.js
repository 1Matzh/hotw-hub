// Hands on the Wheel (HOTW)
// Copyright (c) 2026 1Matzh. All rights reserved.
// Unauthorized copying, modification, redistribution, reuse or sale is prohibited.
// Written permission from 1Matzh is required. See LICENSE or hotw/code-license.txt.
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

function button(label, tone, action) {
  const node = element('button', tone, label)
  node.disabled = busy
  node.onclick = action
  return node
}

function render() {
  $('profile').textContent = state.profile || 'Choose the folder containing settings and mods.'
  $('count').textContent = state.installed.length
  $('catalog-tab').setAttribute('aria-pressed', view === 'catalog')
  $('installed-tab').setAttribute('aria-pressed', view === 'installed')
  $('refresh').disabled = busy || !state.profile
  $('choose').disabled = busy
  const list = state[view]
  const pages = Math.max(1, Math.ceil(list.length / pageSize))
  page = Math.min(page, pages - 1)
  $('pagination').hidden = pages === 1
  $('previous').disabled = page === 0
  $('next').disabled = page + 1 === pages
  $('page-label').textContent = `Page ${page + 1} of ${pages}`
  $('empty').hidden = Boolean(list.length) || busy
  $('empty').textContent = state.profile
    ? (view === 'installed' ? 'No Hub characters are installed in this profile.' : 'The catalog is empty or could not be loaded.')
    : 'Select your BeamNG user folder to get started.'
  const cards = list.slice(page * pageSize, (page + 1) * pageSize).map(card)
  $('cards').replaceChildren(...cards)
}

function card(character) {
  const article = element('article', 'card')
  const preview = element('div', 'portrait')
  const image = element('img')
  image.alt = ''
  preview.append(image)
  const details = element('div', 'details')
  details.append(element('strong', '', character.name), element('small', '', 'by ' + character.author))
  const actions = element('div', 'card-actions')
  const local = view === 'installed' || character.installed
  if (character.updateAvailable) {
    actions.append(button('Update', 'primary', () => change(character, 'update')))
  } else if (local) {
    actions.append(element('span', '', 'Installed'))
  } else {
    actions.append(button('Download', 'primary', () => change(character, 'download')))
  }
  if (view === 'installed') {
    actions.append(button('Remove', 'quiet', () => confirmRemoval(character)))
  } else if (character.sizeBytes) {
    actions.append(element('span', '', size.format(character.sizeBytes / 1000000) + ' MB'))
  }
  article.append(preview, details, actions)
  const key = `${revision}/${local}/${character.id}`
  if (!portraits.has(key)) {
    portraits.set(key, pywebview.api.portrait(character.id, local).catch(() => ''))
  }
  portraits.get(key).then(data => {
    if (data && image.isConnected) image.src = data
  })
  return article
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
    await operation()
    status('')
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
  const progress = {download: 'Downloading', update: 'Updating', remove: 'Removing'}
  return run(`${progress[action]} ${character.name}…`, async () => {
    state = await pywebview.api.change(character.id, action)
    invalidatePortraits()
  })
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
$('cancel-remove').onclick = () => $('confirm').close()
$('choose').onclick = async () => {
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
