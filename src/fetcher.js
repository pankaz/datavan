import _ from 'lodash'

import importResponse from './importResponse'
import { prepareFindData } from './core/finder'
import { findMemory } from './core/memory'

const hasFetchAt = (self, fetchKey) => self._fetchAts[fetchKey]
const markFetchAt = (self, fetchKey) => {
  self._fetchAts[fetchKey] = 1
}

// @auto-fold here
function addFetchingPromise(fetchingPromises, fetchKey, promise) {
  if (promise && promise.then) {
    fetchingPromises[fetchKey] = promise
    promise
      .then(ret => {
        if (fetchingPromises[fetchKey] === promise) delete fetchingPromises[fetchKey]
        return ret
      })
      .catch(err => {
        if (fetchingPromises[fetchKey] === promise) delete fetchingPromises[fetchKey]
        return Promise.reject(err)
      })
  }
  return promise
}

const DONT_FETCH = { fetchKey: false }

function checkOption(self, { fetch, serverPreload }) {
  if (fetch === false) return false
  if (self.store && self.store.vanCtx.duringServerPreload && !serverPreload) return false
  return true
}

function tryGetFetchQueryKey(self, query, option) {
  // ensure run prepareFindData to determine some data is missing or not
  prepareFindData(self, query, option)
  // shouldFetch if (not-all-ids-hit || key-no-query-cache) && key-not-fetching
  // TODO || key-expired
  // console.log('tryGetFetchQueryKey: option.missIds=', option.missIds, ' option.missQuery=', option.missQuery, self.getState())
  if (!option.missIds && !option.missQuery) return DONT_FETCH

  const fetchQuery = self.getFetchQuery(query, option)
  const fetchKey = self.getFetchKey(fetchQuery, option)
  // console.log('tryGetFetchQueryKey: fetchKey=', fetchKey)
  if (fetchKey === false) return DONT_FETCH

  // console.log('tryGetFetchQueryKey hasFetchAt', !!hasFetchAt(self, fetchKey), fetchKey)

  // NOTE missIds may be null / invalid / not-found id
  if (hasFetchAt(self, fetchKey)) return DONT_FETCH
  markFetchAt(self, fetchKey)

  // console.log('tryGetFetchQueryKey _fetchingPromises', !!self._fetchingPromises[fetchKey], fetchKey)
  if (self._fetchingPromises[fetchKey]) return DONT_FETCH
  return { fetchQuery, fetchKey }
}

function _fetch(self, query, option, fetchKey) {
  return self.onFetch(query, option, self).then(res => importResponse(self, res, fetchKey))
  // .catch(err => handleError to switch off isFetching)
}

export function find(core, query = {}, option = {}) {
  if (core.onFetch) {
    if (checkOption(core, option)) {
      const { fetchQuery, fetchKey } = tryGetFetchQueryKey(core, query, option)
      if (fetchKey !== false) {
        const p = _fetch(core, fetchQuery, option, fetchKey)
        addFetchingPromise(core._fetchingPromises, fetchKey, p)
      }
    }
  }
  return findMemory(core, query, option)
}

export function findAsync(core, query = {}, option = {}) {
  const { fetchQuery, fetchKey } = tryGetFetchQueryKey(core, query, option)
  if (fetchKey !== false) {
    option.preparedData = null
    return _fetch(core, fetchQuery, option, fetchKey).then(() => findMemory(core, query, option))
  }
  return Promise.resolve(findMemory(core, query, option))
}

export function getAsync(core, id, option = {}) {
  return findAsync(core, [id], option).then(_.first)
}

export function get(core, id, option = {}) {
  if (core.onFetch) {
    if (!id) return undefined
    if (checkOption(core, option)) {
      const query = [id]
      // batch when option.missIds and use getIdFetchKey?
      const { fetchQuery, fetchKey } = tryGetFetchQueryKey(core, query, option)
      if (fetchKey !== false) {
        const p = _fetch(core, fetchQuery, option, fetchKey)
        addFetchingPromise(core._fetchingPromises, fetchKey, p)
      }
    }
  }
  return core.onGet(id, option)
}

export function findOne(core, query, option) {
  return find(core, query, { ...option, limit: 1 })[0]
}

export function allPendings(core) {
  return Object.values(core._fetchingPromises)
}