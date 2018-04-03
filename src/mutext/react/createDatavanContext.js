import { createElement, Component } from 'react'
import createReactContext from 'create-react-context'
import stringify from 'fast-stable-stringify'

import bitsObserver from './bitsObserver'

import createDb from '../db'

const createAsyncCache = ({ handler, onSuccess, onError } = {}) => {
  const results = {}
  const promises = {}
  const cache = (key, inlineFunc) => {
    if (typeof key !== 'string') key = stringify(key)
    if (key in results) return results[key]

    const promise = (inlineFunc || handler)(key)
    let ret
    if (promise && promise.then) {
      promise.then(
        result => {
          results[key] = result
          delete promises[key]
          return onSuccess(result, key)
        },
        error => {
          promises[key] = error
          return onError(error, key)
        }
      )
      promises[key] = promise
    } else {
      ret = promise
    }
    return (results[key] = ret) // eslint-disable-line
  }
  cache.results = results
  cache.promises = promises
  return cache
}

const renderProp = (Comp, props, mixin) => createElement(Comp, props, db => props.children(mixin(db)))

const createDatavanContext = (confs, defaultValue = {}) => {
  const { calcChangedBits, getObservedBits } = bitsObserver(confs)
  const { Provider, Consumer } = createReactContext(defaultValue, calcChangedBits)

  class VanProvider extends Component {
    state = createDb(confs, db => {
      return {
        ...db,
        // ...defaultValue,
        onChange: change => {
          this.setState(change)
          // if (defaultValue.onChange) defaultValue.onChange(newDb, change)
        },
      }
    })
    render() {
      return createElement(Provider, { value: this.state }, this.props.children)
    }
  }

  /* eslint-disable react/no-multi-comp */
  class VanConsumer extends Component {
    state = { setState: this.setState } // eslint-disable-line react/no-unused-state

    componentWillReceiveProps(nextProps) {
      if (this.props.observe !== nextProps.observe) {
        this.observedBits = getObservedBits(nextProps.observe)
      }
    }

    observedBits = getObservedBits(this.props.observe)

    cache = createAsyncCache({
      onSuccess: () => this.setState({ cacheAt: Date.now() }), // eslint-disable-line react/no-unused-state
    })

    render() {
      const { props } = this
      return renderProp(
        Consumer,
        {
          ...props,
          observedBits: this.observedBits,
        },
        db => {
          return { ...db, cache: this.cache, consumerState: this.state }
        }
      )
    }
  }

  return { Provider: VanProvider, Consumer: VanConsumer }
}

export default createDatavanContext
