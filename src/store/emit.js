import _ from 'lodash'
import { DATAVAN_MUTATE } from '../redux'

function takeMutation(table) {
  let ret
  if (table._pendingState) {
    ret = { $set: table._pendingState }
    table._pendingState = undefined
  }
  return ret
}

function dispatchEmit(store) {
  const mutation = _.pickBy(_.mapValues(store.collections, takeMutation))
  if (!_.isEmpty(mutation)) {
    store.dispatch({ type: DATAVAN_MUTATE, mutation })
  }
  store.vanCtx.vanEmitting = null
}

let _forceEmitFlush = false
export function forceEmitFlush(flush = true) {
  _forceEmitFlush = flush
}

export function emit(store, flush) {
  if (flush || _forceEmitFlush) return dispatchEmit(store)
  const { vanCtx } = store
  const p = vanCtx.vanEmitting
  if (p) return p

  const curP = new Promise(resolve => {
    const dispatchAndResolve = () => {
      if (curP === vanCtx.vanEmitting) dispatchEmit(store)
      resolve()
    }
    if (vanCtx.dispatchWaitUntil) {
      return vanCtx.dispatchWaitUntil.then(() => {
        delete vanCtx.dispatchWaitUntil
        dispatchAndResolve()
      })
    }
    setTimeout(dispatchAndResolve)
  })
  vanCtx.vanEmitting = curP
  return curP
}