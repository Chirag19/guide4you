import $ from 'jquery'
import { Debug } from './Debug'

/**
 * @typedef {object} URLConfig
 * @property {Localizable} url
 * @property {boolean} [useProxy]
 * @property {string} [proxy]
 * @property {boolean} [cache=true]
 * @property {string} [username] only implemented for wms at the moment
 * @property {string} [password] only implemented for wms at the moment
 */

/**
 * @typedef {URLConfig|Localizable|URL} URLLike
 */

export class URL {
  /**
   * @param {URLLike} urlLike
   * @param {G4UMap|null} map
   */
  constructor (urlLike, map) {
    if ($.type(urlLike) === 'string' || !urlLike.hasOwnProperty('url')) {
      /**
       * @type {string}
       */
      this.url = urlLike
      /**
       * @type {boolean}
       */
      this.useProxy = false
      /**
       * @type {boolean}
       */
      this.cache = true
      this.params = []
      this.expand = []
    } else {
      /**
       * @type {Localizable}
       */
      this.url = urlLike.url
      /**
       * @type {boolean}
       */
      this.useProxy = urlLike.useProxy
      /**
       * @type {string}
       */
      this.proxy = urlLike.proxy
      /**
       * @type {boolean}
       */
      this.cache = urlLike.cache === undefined ? true : urlLike.cache
      /**
       * @type {string}
       */
      this.username = urlLike.username
      /**
       * @type {string}
       */
      this.password = urlLike.password
      if (urlLike.params) {
        this.params = urlLike.params.slice(0)
      } else {
        this.params = []
      }
      if (urlLike.expand) {
        this.expand = urlLike.expand.slice(0)
      } else {
        this.expand = []
      }

      /**
       * @type {string}
       */
      this.globalProxy = urlLike.globalProxy
      /**
       * {L10N}
       */
      this.localiser = urlLike.localiser
    }

    if (map) {
      this.extractParamsFromMap(map)
    }
  }

  /**
   * @param {G4UMap} map
   */
  extractParamsFromMap (map) {
    /**
     * @type {string}
     */
    this.globalProxy = this.globalProxy || map.get('proxy')
    /**
     * {L10N}
     */
    this.localiser = this.localiser || map.get('localiser')
  }

  /**
   * @param {object} config
   * @param {string} paramName
   * @param {string} [defaultValue]
   * @param {G4UMap} [map]
   * @returns {URL}
   */
  static extractFromConfig (config, paramName, defaultValue, map) {
    if (!config.hasOwnProperty(paramName)) {
      return null
    }
    if (config.hasOwnProperty('useProxy') || config.hasOwnProperty('proxy') || config.hasOwnProperty('cache')) {
      Debug.warn('Using the parameters \'useProxy\' \'proxy\' \'cache\' directly inside a config object is considered' +
        ' deprecated. Please use a URLConfig object')
      return new URL({
        url: config[paramName] || defaultValue,
        useProxy: config.useProxy,
        proxy: config.proxy,
        cache: config.cache
      }, map)
    } else if ($.isPlainObject(config[paramName]) && !config[paramName].hasOwnProperty('url')) {
      Debug.warn('The url config object is missing an "url" parameter. The software is assuming the' +
        ' parameter is a Localizable.')
      return new URL({
        url: config[paramName]
      }, map)
    } else {
      return new URL(config[paramName], map)
    }
  }

  /**
   * @returns {URL}
   */
  clone () {
    return new URL(this)
  }

  /**
   * @returns {string}
   */
  finalize () {
    let url = this
    if (!this.cache) {
      url = this.clone().addParam(Math.random().toString(36).substring(7))
    }

    let urlAsString = this.localiser ? this.localiser.selectL10N(url.url) : url.url

    if (url.params.length) {
      if (urlAsString.search(/\?/) === -1) {
        urlAsString += '?'
      } else {
        urlAsString += '&'
      }
      urlAsString += url.params.join('&')
    }

    for (const expand of url.expand) {
      urlAsString = URL.expandTemplate_(urlAsString, expand)
    }

    if (url.useProxy === true || (url.useProxy === undefined && !!url.proxy)) {
      const proxy = url.proxy || this.globalProxy
      if (!proxy) {
        throw new Error('No proxy configured. Either configure a local or global proxy if you want to use the option' +
          ' useProxy.')
      }

      return URL.expandTemplate_(proxy,
        { paramName: 'url', paramValue: URL.encodeTemplate_(urlAsString), required: true })
    } else {
      return urlAsString
    }
  }

  /**
   * this function will add an parameter to the url
   * @param {string} param
   * @returns {URL}
   */
  addParam (param) {
    this.params.push(param)
    return this
  }

  /**
   * replaces a param enclosed in {} in a (url) template with a value. If the value is an array it will take any string
   * not containing a '}' after the paramName to join the array, default ','.
   * @param {string} template an (url) template
   * @param {object} expand
   * @param {string} expand.paramName the parameter that will be replaced (given without {}) f.e. 'example' will
   *    replace any occurancy of '{example}' (after the word 'example' there might be given a string join an
   *    array value i.e. '{example+}')
   * @param {string|string[]|number} expand.paramValue the value(s) which will be inserted
   * @param {boolean} expand.required
   * @returns {string} the expanded string
   */
  static expandTemplate_ (template, expand) {
    const regexp = new RegExp('{' + expand.paramName + '([^}]*)}')
    const match = template.match(regexp)
    if (match) {
      if ($.type(expand.paramValue) === 'string') {
        return template.replace(regexp, expand.paramValue)
      } else if ($.type(expand.paramValue) === 'array') {
        const joinString = match[1] || ','
        return template.replace(regexp, expand.paramValue.join(joinString))
      } else if ($.type(expand.paramValue) === 'number') {
        const valReg = new RegExp('[:,]([^,])', 'g')
        let nextMatch = valReg.exec(match[1])
        for (let i = 0; i < expand.paramValue; i++) {
          nextMatch = valReg.exec(match[1])
        }
        return template.replace(regexp, nextMatch[1])
      }
    } else if (expand.required) {
      throw new Error('required parameter ' + expand.paramName + ' (enclosed in {}) not found in string ' + template)
    } else {
      return template
    }
  }

  /**
   * expand the target template. automatically encodes the value
   * @param {string} paramName
   * @param paramValue
   * @param {boolean} [required=true]
   * @returns {URL}
   */
  expandTemplate (paramName, paramValue, required = true) {
    const index = this.expand.findIndex(e => e.paramName === paramName)
    if (index >= 0) {
      this.expand.splice(index, 1)
    }
    const encode = val => {
      if ($.type(val) === 'string') {
        return encodeURIComponent(val)
      } else if ($.type(paramValue) === 'array') {
        return val.map(v => encode(v))
      } else {
        return val
      }
    }
    paramValue = encode(paramValue)
    this.expand.push({ paramName, paramValue, required })
    return this
  }

  /**
   * @param {string} otherUrl
   * @returns {URL}
   */
  useProxyFor (otherUrl) {
    return new URL({
      useProxy: this.useProxy,
      proxy: this.proxy,
      url: otherUrl,
      localiser: this.localiser,
      globalProxy: this.globalProxy
    })
  }

  /**
   * this function takes an (url) template and encodes everything except for the templated elements.
   * @param {string} template an (url) template
   * @returns {string} the encoded (url) template
   */
  static encodeTemplate_ (template) {
    const parts = template.split('}')

    let encodedTemplate = ''

    let i
    for (i = 0; i < parts.length - 1; i += 1) {
      const partedParts = parts[i].split('{')
      encodedTemplate += encodeURIComponent(partedParts[0]) + '{' + partedParts[1] + '}'
    }

    encodedTemplate += encodeURIComponent(parts[i])

    return encodedTemplate
  }

  /**
   * this method returns a new URL extend by the provided string
   * @param {string} extension
   * @returns {URL}
   */
  extend (extension) {
    const newUrl = this.clone()
    newUrl.url += extension
    return newUrl
  }

  setAuth (xhr) {
    if (this.username && this.password) {
      const auth = window.btoa(`${this.username}:${this.password}`)
      xhr.withCredentials = true
      xhr.setRequestHeader(this.useProxy ? 'X-Proxy-Forward-Authorization' : 'Authorization', 'Basic ' + auth)
    }
  }
}
