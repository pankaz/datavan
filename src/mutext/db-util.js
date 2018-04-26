import _ from 'lodash'
import createDb from './db'

const parentDataMutation = ['preloads', 'fetchAts']

export const forkDb = parentDb => {
  const confs = parentDb.getConfig()
  const newDb = createDb(confs)

  // copy submits and originals
  _.each(confs, (conf, name) => {
    newDb[name].submits = { ...parentDb[name].submits }
    newDb[name].originals = { ...parentDb[name].originals }
  })

  // subscribe parent change to child db change
  parentDb.subscribe(newDb.emit)

  return Object.assign(newDb, {
    getParent: () => parentDb,

    getFetchData(name) {
      return parentDb.getLatestDb()[name]
    },

    dispatchFilter(mutSpecs) {
      const parentMuts = []
      const newSpecs = _.map(mutSpecs, mutSpec => {
        const { name, mutation } = mutSpec
        if (mutation.preloads || mutation.fetchAts) {
          parentMuts.push({ name, mutation: _.pick(mutation, parentDataMutation) })
          return { name, mutation: _.omit(mutation, parentDataMutation) }
        }
        return mutSpec
      })
      if (parentMuts.length > 0) {
        parentDb.dispatch(parentMuts)
      }
      return newSpecs
    },
  })
}