// import _ from 'lodash'
import { setAll, get } from '../collection/base'
import { find, findAsync } from '../collection/find'
import { submit } from '../collection/submitter'
import { getCollection } from '../defineCollection'
import runHook from '../collection/util/runHook'

const workFuncs = {
  get,
  find,
  findAsync,
  setAll,
}

export default function relayWorker({ onFetch, onSubmit, onMessage }) {
  const workerPlugin = base => ({
    ...base,
    onFetch,

    setAllHook(next, collection, change, option) {
      runHook(base.setAllHook, next, collection, change, option)
      submit(collection, onSubmit)
    },

    loadHook(next, collection, data, mutation) {
      onMessage({ type: 'load', collectionName: collection.name, data })
      return runHook(base.loadHook, next, collection, data, mutation)
    },
  })

  workerPlugin.onClientMessage = (store, request) => {
    const collection = getCollection(store, request.collectionName)
    return Promise.resolve(workFuncs[request.action](collection, ...request.args)).then(ret => {
      request.result = ret
      request.workerMutatedAt = collection.mutatedAt
      // console.log(collection.store.vanCtx.side, 'onClientMessage', request)
      onMessage(request)
    })
  }

  return workerPlugin
}
