import _ from 'lodash'
import stringify from 'fast-stable-stringify'

import { isThenable, syncOrThen } from './util/promiseUtil'
import Collection from './Collection'
import { normalizeQueryAndKey, calcQueryKey } from './util/queryUtil'

// @auto-fold here
function loopResponse(data, idField, operations) {
  if (!data) return
  const handleById = operations.$byId

  if (Array.isArray(data)) return _.each(data, doc => handleById(doc, doc[idField]))

  _.each(data, (value, key) => {
    if (key[0] === '$') {
      const opFunc = operations[key]
      if (opFunc) {
        opFunc(value)
      } else {
        throw new Error(`Unknown import operation ${key}`)
      }
    } else {
      handleById(value, (value && value[idField]) || key)
    }
  })
}

// @auto-fold here
function excludeDirty(filter, idField, isDirty) {
  if (Array.isArray(filter)) {
    const ids = _.filter(filter, id => id && !isDirty(id))
    if (ids.length === 0) {
      return false
    }
    return ids
  }
  if (filter[idField]) {
    const newQuery = { ...filter }
    const idMatcher = filter[idField]
    if (!idMatcher) {
      return false
    }
    if (typeof idMatcher === 'string' && isDirty(idMatcher)) {
      return false
    }
    if (idMatcher.$in) {
      const ids = _.filter(idMatcher.$in, id => id && !isDirty(id))
      if (ids.length === 0) {
        return false
      }
      newQuery[idField].$in = ids
    }
    return newQuery
  }
  return filter
}

// @auto-fold here
function markFetchPromise(fetchPromises, key, promise) {
  if (isThenable(promise)) {
    fetchPromises[key] = promise
    promise
      .then(ret => {
        if (fetchPromises[key] === promise) delete fetchPromises[key]
        return ret
      })
      .catch(err => {
        if (fetchPromises[key] === promise) delete fetchPromises[key]
        return Promise.reject(err)
      })
  }
  return promise
}

function _checkFetchAsync(fetchQuery, option, fetchKey) {
  if (fetchKey === false || !this.onFetch) return

  // gc more to sync with remote
  // gc before import to make sure new things is not gc
  this._invalidateForGc()

  const _fetchAts = this._fetchAts
  // console.log('_checkFetchAsync', fetchKey, _fetchAts[fetchKey])
  if (!this.alwaysFetch && _fetchAts[fetchKey]) return
  _fetchAts[fetchKey] = new Date() // prevent async fetch again

  return this.fetch(fetchQuery, option, fetchKey)
}

function _checkFetch(fetchQuery, option, fetchKey) {
  const { duringServerPreload, serverPreloading } = this.context
  if (duringServerPreload && !serverPreloading) return

  const promise = _checkFetchAsync.call(this, fetchQuery, option, fetchKey)
  if (promise) {
    return markFetchPromise(this._fetchPromises, fetchKey, promise)
  }
}

function _prepareFind(_filter, option) {
  const filter = normalizeQueryAndKey(_filter, option, this.idField)
  if (filter === false) {
    return { filter, fetchKey: false }
  }
  if (filter.$query) {
    return {
      filter: _.omit(filter, '$query'),
      fetchKey: option.fetch !== undefined ? option.fetch : this.calcFetchKey(filter, option),
      fetchQuery: filter,
      fetchOnly: Object.keys(filter).length === 1,
    }
  }

  const fetchQuery = excludeDirty(filter, this.idField, this.isDirty.bind(this))
  return {
    filter,
    fetchKey: option.fetch !== undefined ? option.fetch : fetchQuery !== false && this.calcFetchKey(fetchQuery, option),
    fetchQuery,
  }
}

export default class FetchingCollection extends Collection {
  // Override: onFetch(), alwaysFetch
  _fetchAts = {}

  constructor(state) {
    super(state)
    state.fetches = state.fetches || {}

    const now = new Date()
    const _fetchAts = this._fetchAts
    const setTimeFunc = (v, key) => (_fetchAts[key] = now)
    _.each(state.byId, setTimeFunc)
    _.each(state.fetches, setTimeFunc)
  }

  calcFetchKey(remoteQuery, option) {
    return remoteQuery.$query ? stringify(remoteQuery.$query) : calcQueryKey(remoteQuery, option)
  }

  get(id, option = {}) {
    if (!id) return undefined
    if (!this.isDirty(id)) _checkFetch.call(this, [id], option, id)
    return super.get(id)
  }

  find(_filter, option = {}) {
    const { filter, fetchKey, fetchQuery, fetchOnly } = _prepareFind.call(this, _filter, option)
    // TODO prevent fetch when array of ids all hit
    _checkFetch.call(this, fetchQuery, option, fetchKey)
    return fetchOnly ? this.state.fetches[fetchKey] : this._findNormalized(filter, option)
  }

  findAsync(_filter, option = {}) {
    const { filter, fetchKey, fetchQuery, fetchOnly } = _prepareFind.call(this, _filter, option)
    return Promise.resolve(_checkFetchAsync.call(this, fetchQuery, option, fetchKey)).then(
      () => (fetchOnly ? this.state.fetches[fetchKey] : this._findNormalized(filter, option))
    )
  }

  fetch(query, option, fetchKey) {
    return syncOrThen(this.onFetch(query, option), ret => {
      // console.log('fetch result', ret)
      this.importAll(ret, fetchKey)
      return ret
    })
  }

  _fetchPromises = {}

  importAll(ops, fetchKey) {
    this._gc()

    const mutation = { byId: {} }
    const stateById = this.state.byId
    const mutationById = mutation.byId
    const _fetchAts = this._fetchAts
    const idField = this.idField
    const now = new Date()
    loopResponse(ops, idField, {
      // handleById
      $byId: (doc, id) => {
        if (this.isDirty(id)) return
        mutationById[id] = typeof doc === 'object' ? { ...stateById[id], ...this.cast(doc) } : doc
        _fetchAts[id] = now
      },
      $unset(value) {
        mutationById.$unset = value
      },
      $query(value) {
        mutation.fetches = { [fetchKey]: value }
      },
    })
    // console.log('importAll', mutation)
    this.mutateState(mutation)

    this.onChangeDebounce()
  }

  isDirty(key) {
    return this.isLocalId(key)
  }

  invalidate(key) {
    if (key) {
      delete this._fetchAts[key]
    } else {
      this._fetchAts = {}
    }
    // force connect re-run & invalidate all find memory
    this.state = { ...this.state }
  }

  gcTime = 60 * 1000
  _gcAt = 0
  _shouldRunGc = false

  _invalidateForGc() {
    const expire = Date.now() - this.gcTime
    if (this._gcAt > expire) return
    this._gcAt = Date.now()
    this._fetchAts = _.pickBy(this._fetchAts, fetchAt => fetchAt > expire)
    this._shouldRunGc = true
  }

  _gc() {
    if (!this._shouldRunGc) return
    this._shouldRunGc = false

    const state = this.state
    const _fetchAts = this._fetchAts
    const shouldKeep = (v, key) => {
      const keep = this.isDirty(key) || _fetchAts[key]
      // if (!keep) console.log('gc', this.name, key)
      return keep
    }
    state.byId = _.pickBy(state.byId, shouldKeep)
    state.fetches = _.pickBy(state.fetches, shouldKeep)
  }

  getPromise() {
    const promises = _.values(this._fetchPromises)
    const superPromise = super.getPromise && super.getPromise()
    if (superPromise) promises.push(superPromise)
    return promises.length > 0 ? Promise.all(promises) : null
  }

  isFetching() {
    return Object.keys(this._fetchPromises).length > 0
  }
}
