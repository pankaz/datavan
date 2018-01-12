import { _getAll } from '.'
import { findInMemory } from './findInMemory'
import { checkFetch, isPreloadSkip } from './fetcher'

export function _getInMemory(collection, id) {
  return _getAll(collection)[id]
}

export function _get(collection, id, option = {}) {
  if (collection.onFetch && option.fetch !== false && !isPreloadSkip(collection, option)) {
    checkFetch(collection, [id], option)
  }
  return _getAll(collection)[id]
}

export function _find(collection, query = {}, option = {}) {
  if (collection.onFetch && option.fetch !== false && !isPreloadSkip(collection, option)) {
    checkFetch(collection, query, option)
  }
  return findInMemory(collection, query, option)
}

export function _findAsync(collection, query = {}, option = {}) {
  if (collection.onFetch) {
    return Promise.resolve(checkFetch(collection, query, option)).then(() => {
      // if (option.force && option.returnRaw) return raw
      // _preparedData no longer valid after fetch promise resolved
      delete option._preparedData
      return findInMemory(collection, query, option)
    })
  }
  return findInMemory(collection, query, option)
}

export function _findOne(core, query, option) {
  return _find(core, query, { ...option, limit: 1 })[0]
}

const _first = arr => arr[0]
export function _getAsync(core, id, option = {}) {
  return _findAsync(core, [id], option).then(_first)
}

export function _allPendings(core) {
  return Object.values(core._fetchingPromises)
}

export function _getPending(collection) {
  const promises = Object.values(collection._fetchingPromises)
  return promises.length <= 0 ? null : Promise.all(promises)
}

export function _run(collection, funcName, ...args) {
  return collection[funcName](collection, ...args)
}
