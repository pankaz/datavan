// import _ from 'lodash'
import mutateHelper from 'immutability-helper'

import { defineStore, SubmittingCollection, Searchable } from '.'
import KeyValueStore from './KeyValueStore'
import { mergeToStore } from './util/mutateUtil'

test('defineCollection as array', async () => {
  const common = { messages: { bar: 'BAR', func() {} }, users: [{ foo() {}, searchFields: ['name'] }] }

  const store1 = defineStore(common)()
  expect(store1.messages.bar).toBe('BAR')
  expect(store1.messages.func).toBe(common.messages.func)
  expect(typeof store1.users.foo).toBe('function')
  expect(store1.users.searchFields).toEqual(['name'])
  expect(store1.users instanceof SubmittingCollection).toBe(true)

  const store2 = defineStore({
    ...common,
    users: [...common.users, Searchable],
  })()
  expect(store2.messages.bar).toBe(store1.messages.bar)
  expect(store2.messages.func).toBe(store1.messages.func)
  expect(typeof store2.users.foo).toBe('function')
  expect(store2.users.searchFields).toEqual(['name'])
  expect(store2.users instanceof SubmittingCollection).toBe(true)
  expect(Object.getPrototypeOf(Object.getPrototypeOf(store2.users)).constructor.name).toBe('Searchable')
})

test('get & set', async () => {
  const createStore = defineStore({
    users: KeyValueStore,
  })
  const db = createStore()
  expect(db.users.get('u1')).toBe(undefined)
  db.users.set('u1', 'Hi')
  expect(db.users.get('u1')).toBe('Hi')
})

test('syntax', async () => {
  const definitions = {
    transfers: {
      getRequires: () => ['users'],
      draft() {
        return ' I am first layer draft'
      },
      get() {
        return `${this.users.get()} x${this.draft()}`
      },
    },
    users: {
      get() {
        return 'users'
      },
    },
  }
  const createStore = defineStore(definitions)
  const db = createStore()
  expect(typeof db.transfers.get === 'function').toBe(true)
  expect(typeof db.transfers.draft === 'function').toBe(true)
  expect(db.transfers.get()).toBe('users x I am first layer draft')

  const createStore2 = defineStore({
    ...definitions,
    transfers2: {
      getRequires: () => ['transfers'],
      get() {
        return `> ${this.transfers.get()} <`
      },
      asyncGet() {
        return new Promise(resolve => setTimeout(() => resolve('Http Body'), 1))
      },
    },
  })
  const db2 = createStore2()
  expect(db2.transfers.users).toBe(db2.users)
  expect(db2.transfers2.get()).toBe('> users x I am first layer draft <')

  // await
  expect(await db2.transfers2.asyncGet()).toBe('Http Body')
})

test('util', async () => {
  const data = { a: 1 }
  const newData = mutateHelper(data, { a: { $set: 1 } })
  expect(data === newData).toBe(true)
})

test('merge collections states again will not trigger new dispatch', async () => {
  const oldStates = { users: { byId: {} } }
  const collections = { users: { state: { byId: { 'userId-1': { name: 'Eric' } } } } }

  const newStates = mergeToStore(oldStates, collections)

  // is changed
  expect(newStates !== oldStates).toBe(true)

  // run again will not changed
  const newStates2 = mergeToStore(newStates, collections)
  expect(newStates2 === newStates).toBe(true)
})