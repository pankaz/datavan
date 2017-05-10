import _ from 'lodash'

import { isThenable, then } from './util/promiseUtil'
import Collection, { calcFindKey } from './Collection'

export default class FetchingCollection extends Collection {
  // NOTE expecting functions
  // onFetch() {}
  // calcFetchKey() {}

  _fetchTimes = {}
  _fetchPromises = {}
  _fetchIsAsync = false

  calcFetchKey(query, option) {
    return calcFindKey(query, option)
  }

  find(query, option = {}) {
    if (this.onFetch) {
      const cacheKey = this.calcFetchKey(query, option)
      const match = this._shouldReload(cacheKey, option.load)
      if (match) {
        const result = this._doReload(query, option, cacheKey)

        const { duringMapState } = this._store.getContext()
        // console.log('find duringMapState', !duringMapState, result, super.find(query, option))
        if (!duringMapState && (option.load === 'reload' || option.load === 'load')) {
          // TODO compare local and remote result, drop if backend is removed
          return then(result, () => super.find(query, option))
        }
      }
    }
    return super.find(query, option)
  }

  get(id, option = {}) {
    // NOTE need to use findOne if want to return promise or preload
    if (this.onFetch && id && !this.isLocalId(id) && this._shouldReload(id, option.load)) {
      if (this._fetchIsAsync) {
        // Async (batch ids in here)
        this._fetchIdArray.push(id)
        this._fetchByIdsDebounce()
      } else {
        this._doReload({ [this.idField]: id })
      }
    }
    return super.get(id, option)
  }
  _fetchIdArray = []
  _fetchByIdsPromise = null
  _fetchByIdsDebounce() {
    if (this._fetchByIdsPromise) return this._fetchByIdsPromise

    const promises = _.values(this._fetchPromises)
    this._fetchByIdsPromise = Promise.all(promises)
      .then(() => {
        if (this._fetchIdArray.length > 0) {
          return this._doReload({ [this.idField]: { $in: this._fetchIdArray } })
        }
      })
      .then(() => (this._fetchByIdsPromise = null))
      .catch(() => (this._fetchByIdsPromise = null))
  }

  _shouldReload(cacheKey, mode) {
    if (mode === 'local') return false
    const fetchTime = this._fetchTimes[cacheKey]

    // console.log('this._store.getContext().duringServerPreload', this._store.getContext().duringServerPreload, mode === 'preload' && !fetchTime)
    if (this._store.getContext().duringServerPreload) {
      // duringServerPreload, only load resource that is mark as preload and preload only one time
      return mode === 'preload' && !fetchTime
    }

    // TODO CronJob to clear _fetchTimes & cached values
    return mode === 'reload' || !fetchTime
  }

  _doReload(query, option, cacheKey) {
    let findingKey = cacheKey
    if (this._fetchIsAsync) {
      // is loading (promise exists but not deleted)
      if (findingKey === undefined) findingKey = this.calcFetchKey(query, option)
      const oldPromise = this._fetchPromises[findingKey]
      if (oldPromise) return oldPromise
    }

    // NOTE should be able to handle Both Async and Sync onFetch
    const result = this.onFetch(query, option)

    const fetchIsAsync = (this._fetchIsAsync = isThenable(result))
    if (fetchIsAsync) {
      // uniq promise
      if (findingKey === undefined) findingKey = this.calcFetchKey(query, option)
      const promiseTable = this._fetchPromises
      promiseTable[findingKey] = result
      result
        .then(ret => {
          const now = new Date()
          this._fetchTimes[findingKey] = now
          delete promiseTable[findingKey]

          const mutation = this.importAll(ret)
          // store fetchTimes
          if (mutation) {
            _.keys(mutation).forEach(id => {
              this._fetchTimes[id] = now
            })
          }

          // TODO compare local and remote result, drop if backend is removed
          // should return the processed ret array instead?
          return ret
        })
        .catch(err => {
          delete promiseTable[findingKey]
          if (__DEV__) console.error(err)
          return Promise.reject(err)
        })
    } else {
      // Async fetch result
      this.importAll(result)
    }

    return result
  }

  getPromise() {
    const promises = _.values(this._fetchPromises)
    if (this._fetchByIdsPromise) promises.push(this._fetchByIdsPromise)
    const superPromise = super.getPromise && super.getPromise()
    if (superPromise) promises.push(superPromise)
    // console.log('getPromise()', _.values(this._fetchPromises), this._fetchByIdsPromise, superPromise)
    return promises.length > 0 ? Promise.all(promises) : null
  }

  isFetching() {
    return this._fetchByIdsPromise || !_.isEmpty(this._fetchPromises)
  }

  invalidate() {
    if (super.invalidate) super.invalidate()
    this._fetchTimes = {}
    // NOTE Fetcher should combine with Stage, so no local changes will go to Fetcher wrapping collection
  }
}