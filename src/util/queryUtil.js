import _ from 'lodash'
import stringify from 'fast-stable-stringify'

function normalizeQuery(query, option, idField) {
  if (option) {
    if (option.queryNormalized) {
      return query
    }
    option.queryNormalized = true
  }

  // query = null OR undefined
  if (!query) {
    return {}
  }

  // query is array of ids
  if (Array.isArray(query)) {
    const ids = _.compact(_.sortedUniq(query.sort()))
    if (ids.length === 0) {
      return false
    }
    return ids
  }

  const newQuery = { ...query }
  const entries = Object.entries(query)
  for (let i = 0, ii = entries.length; i < ii; i++) {
    const [key, matcher] = entries[i]
    if (key === idField) {
      // key=idField, id(s) query muse be truthly
      if (!matcher) {
        return false // return false to stop actual find
      }
      if (typeof matcher === 'string') {
        newQuery[idField] = { $in: [matcher] }
      } else if (matcher.$in) {
        const ids = _.compact(_.sortedUniq(matcher.$in.sort()))
        if (ids.length === 0) {
          return false
        }
        newQuery[key] = { $in: ids }
      }
    } else if (matcher && matcher.$in) {
      const $in = _.sortedUniq(matcher.$in.sort())
      if ($in.length === 0) {
        return false
      }
      newQuery[key] = { $in }
    }
  }
  return newQuery
}

export function fetchIdInQuery(query, func) {
  const id = query[0]
  return { [id]: func(id) }
}

function mongoToLodash(sort) {
  const fields = []
  const orders = []
  _.each(sort, (v, k) => {
    fields.push(k)
    orders.push(v < 0 ? 'desc' : 'asc')
  })
  return [fields, orders]
}

export function processOption(arr, option) {
  if (option) {
    if (option.sort) {
      const [fields, orders] = mongoToLodash(option.sort)
      arr = _.orderBy(arr, fields, orders)
    }
    if (option.skip || option.limit) {
      arr = _.slice(arr, option.skip || 0, option.limit)
    }
    // convert to other object
    if (option.keyBy) {
      arr = _.keyBy(arr, option.keyBy)
    } else if (option.groupBy) {
      arr = _.groupBy(arr, option.groupBy)
    } else if (option.map) {
      arr = _.map(arr, option.map)
    }
  }
  return arr
}

export function calcQueryKey(query, option) {
  return stringify([query, _.pick(option, 'sort', 'skip', 'limit', 'keyBy', 'groupBy', 'map')])
}

export const emptyResultArray = []

export function normalizeQueryAndKey(query, option, idField) {
  const q = normalizeQuery(query, option, idField)
  if (q !== false) {
    option.cacheKey = option.cacheKey || calcQueryKey(query, option)
  }
  return q
}
