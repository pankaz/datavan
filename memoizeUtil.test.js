import _ from 'lodash'
import should from 'should'

import createMemoize from './memoizeUtil'


describe('memoizeUtil', function() {
  it('basic', async () => {
    let runTime = 0
    const obj = {
      find: createMemoize((query, option) => {
        ++runTime
        return ['Super Long List']
      }),

      list: [1,2,3,4,5,6,7,8,9,0],
      find2: createMemoize((list, query, option) => {
        ++runTime
        return _.filter(list, item => item % query.mod)
      }, () => {
        return [obj.list]
      }, (query, option) => {
        return [query, _.pick(option, 'sort')]
      }),
    }

    // find
    const query = {mod: 2}
    const option = {sort: {type: 1, name: -1}, ifModifiedAfter: new Date()}
    const lastResult = obj.find(query, option)
    should( lastResult ).deepEqual(['Super Long List'])
    should( runTime ).equal(1)
    should( obj.find(query, option) ).equal(lastResult)
    should( runTime ).equal(1)

    // find2
    const result2 = obj.find2(query, option)
    should( result2 ).deepEqual([ 1, 3, 5, 7, 9 ])
    should( runTime ).equal(2)
    should( obj.find2(query, option) ).deepEqual(result2)
    should( runTime ).equal(2)

    // diff states
    obj.list = _.map(obj.list, x => x + 10)
    const result3 = obj.find2(query, option)
    should( result3 ).deepEqual([ 11, 13, 15, 17, 19 ])
    should( runTime ).equal(3)
    should( obj.find2(query, option) === result3).true()
    should( runTime ).equal(3)

    // memory table
    should( _.size(obj.find2.memory) ).equal(1)
    should( obj.find2.memory['[{"mod":2},{"sort":{"name":-1,"type":1}}]'] === result3 ).true()
  })
})
