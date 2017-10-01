import _ from 'lodash'
import mutateUtil from 'immutability-helper'

import findInMemory from './findInMemory'

function withId(core, doc) {
  const idField = core.idField
  if (!doc[idField]) {
    doc[idField] = core.genId()
  }
  return doc
}

export function setAll(collection, change, option) {
  return collection.setAll(change, option)
}

export function set(core, id, value, option) {
  if (typeof id === 'object') {
    const castedDoc = withId(core, core.cast(id))
    setAll(core, { [castedDoc[core.idField]]: castedDoc }, value)
  } else {
    setAll(core, { [id]: core.cast(value) }, option)
  }
}

export function del(core, id, option) {
  setAll(core, { $unset: [id] }, option)
}

export function insert(core, docs, option) {
  const inputIsArray = Array.isArray(docs)
  const inserts = inputIsArray ? docs : [docs]

  const change = {}
  const castedDocs = _.map(inserts, d => {
    const castedDoc = withId(core, core.cast(d))
    change[castedDoc[core.idField]] = castedDoc
    return castedDoc
  })
  setAll(core, change, option)

  return inputIsArray ? castedDocs : castedDocs[0]
}

export function update(core, query, updates, option = {}) {
  const oldDocs = findInMemory(core, query, option)
  const change = {}
  const idField = core.idField
  _.each(oldDocs, doc => {
    // TODO use mongo operators like $set, $push...
    const newDoc = mutateUtil(doc, updates)

    // delete and set the newDoc with new id
    change[doc[idField]] = undefined
    if (newDoc) {
      change[newDoc[idField]] = newDoc
    }
  })
  setAll(core, change, option)
  return oldDocs
}

export function remove(core, query, option = {}) {
  const removedDocs = findInMemory(core, query, option)
  setAll(core, { $unset: _.map(removedDocs, core.idField) }, option)
  return removedDocs
}
