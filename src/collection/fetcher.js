import _ from 'lodash'

import { addMutation } from './base'
import { load } from './load'
import memoizedFind from './memoizedFind'

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
  // NOTE support invalidate without flashing UI. So, cannot use "if (!option.missIds && !option.missQuery) return DONT_FETCH"

  const fetchQuery = (option.fetchQuery = self.getFetchQuery(query, option))
  const fetchKey = (option.fetchKey = self.getFetchKey(fetchQuery, option))
  // console.log('tryGetFetchQueryKey: fetchKey=', fetchKey)
  if (fetchKey === false) return DONT_FETCH

  // console.log('tryGetFetchQueryKey hasFetchAt', !!hasFetchAt(self, fetchKey), fetchKey)

  const { _fetchAts } = self
  if (_fetchAts[fetchKey]) return DONT_FETCH
  _fetchAts[fetchKey] = Date.now()

  // console.log('tryGetFetchQueryKey _fetchingPromises', !!self._fetchingPromises[fetchKey], fetchKey)
  if (self._fetchingPromises[fetchKey]) return DONT_FETCH
  return { fetchQuery, fetchKey }
}

function _fetch(self, query, option) {
  return self
    .onFetch(query, option, self)
    .then(res => {
      load(self, res)
      addMutation(self, null) // force render to update isFetching
      return res
    })
    .catch(() => {
      addMutation(self, null) // force render to update isFetching
    })
}

export function find(core, query = {}, option = {}) {
  if (core.onFetch) {
    if (checkOption(core, option)) {
      const { fetchQuery, fetchKey } = tryGetFetchQueryKey(core, query, option)
      if (fetchKey !== false) {
        const p = _fetch(core, fetchQuery, option)
        addFetchingPromise(core._fetchingPromises, fetchKey, p)
      }
    }
  }
  return memoizedFind(core, query, option)
}

export function findAsync(core, query = {}, option = {}) {
  const { fetchQuery, fetchKey } = tryGetFetchQueryKey(core, query, option)
  if (fetchKey !== false) {
    option.preparedData = null
    return _fetch(core, fetchQuery, option).then(() => memoizedFind(core, query, option))
  }
  return Promise.resolve(memoizedFind(core, query, option))
}

export function getAsync(core, id, option = {}) {
  return findAsync(core, [id], option).then(_.first)
}

export function get(core, id, option = {}) {
  if (core.onFetch) {
    if (!id) return undefined
    if (checkOption(core, option)) {
      const query = [id]
      // batch multiple get(id) to find([ids])
      const { fetchQuery, fetchKey } = tryGetFetchQueryKey(core, query, option)
      if (fetchKey !== false) {
        const p = _fetch(core, fetchQuery, option)
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
