import _ from 'lodash'

import { withoutTmpId, TMP_ID_PREFIX } from './util/idUtil'
import { calcFetchKey } from './util/keyUtil'
import { init } from './load'
import * as state from './base'
import * as setter from './setter'
import * as invalidate from './invalidate'
import * as submitter from './submitter'
import * as find from './find'

const { getState } = state

const functions = {
  idField: '_id',
  // gcTime: 60 * 1000,
  onGetAll() {
    return getState(this).byId
  },
  onGet(id) {
    return this.onGetAll()[id]
  },
  // onInit()
  // onFind() {} : return result,
  // onSetAll(change, option) {},                 // called on every set
  // onMutate(nextById, prevById, mutation) {},   // called ONLY on thing has mutated/changed
  // onFetch() {},
  // onSubmit() {},
  // onImport(table)
  getFetchQuery(query) {
    return withoutTmpId(query, this.idField)
  },
  getFetchKey: (fetchQuery, option) => calcFetchKey(fetchQuery, option),
  cast: v => v,
  genId: () => `${TMP_ID_PREFIX}${Date.now()}${Math.random()}`,
}
_.each({ ...state, ...setter, ...find }, (func, key) => {
  if (key[0] === '_') return
  // eslint-disable-next-line
  functions[key] = function(...args) {
    return func(this, ...args) // eslint-disable-line
  }
})
_.each({ ...invalidate, ...submitter }, (func, key) => {
  if (key[0] === '_') return
  // eslint-disable-next-line
  functions[key] = function(...args) {
    console.warn(`Please use import { ${key} } from 'datavan' instead of collection.${key}()`)
    return func(this, ...args) // eslint-disable-line
  }
})

export default function createCollection(spec) {
  const core = Object.assign({}, functions, spec)
  init(core)
  return core
}
