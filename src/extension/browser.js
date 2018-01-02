import { load } from '../collection/load'
import { get as _get } from '../collection/base'
import { dispatchMutations, getCollection } from '../store-base'

function ensureListener(self, listenerKey, addListenerFunc) {
  if (self[listenerKey]) return
  self[listenerKey] = true
  addListenerFunc(self)
}

function loadWidthHeight(coll, width, height) {
  const byId = {}
  if (coll._browserWidthKey) byId[coll._browserWidthKey] = width
  if (coll._browserHeightKey) byId[coll._browserHeightKey] = height
  load(coll, { byId })
}

function addOnResize(coll) {
  if (global.window) {
    const onResize = () => {
      loadWidthHeight(coll, window.innerWidth, window.innerHeight)
      dispatchMutations(coll.store)
    }
    window.addEventListener('resize', onResize)
    onResize()
  } else {
    // default value for node
    loadWidthHeight(coll, 360, 640)
  }
}

export function getBrowserWidth(state, collection, widthKey = 'browserWidth') {
  const coll = getCollection(state, collection)
  coll._browserWidthKey = widthKey
  ensureListener(coll, '_browserOnResize', addOnResize)
  return _get(coll, widthKey)
}

export function getBrowserHeight(state, collection, heightKey = 'browserHeight') {
  const coll = getCollection(state, collection)
  coll._browserHeightKey = heightKey
  ensureListener(coll, '_browserOnResize', addOnResize)
  return _get(coll, heightKey)
}

export default spec =>
  Object.assign({}, spec, {
    getWidth() {
      return getBrowserWidth(this, this.name)
    },
    getHeight() {
      return getBrowserHeight(this, this.name)
    },
  })
