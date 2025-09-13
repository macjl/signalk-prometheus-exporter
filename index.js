/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Bacon = require('baconjs')
const debug = require('debug')('signalk-prometheus-exporter')
const util = require('util')

module.exports = function (app) {
  const logError = app.error || ((err) => {console.error(err)})
  let selfContext = 'vessels.' + app.selfId
  let store = {};
  let maxAgeMs = 600000;

  let unsubscribes = []
  let shouldStore = function (path) {
    return true
  }

  function toPromKey(v) {
    return v.replace(/-|\./g,"_");
  }

  function toMetrics(store) {
    let r = "";
    const now = Date.now();
    for (const key in store) {
      const entry = store[key];
      if (now - entry.timestamp > maxAgeMs) {
        delete store[key];
        continue;
      }
      const k = toPromKey(entry.path);
      r += `# HELP ${k} ${k}\n`;
      r += `# TYPE ${k} gauge\n`;

      let labels = `context="${entry.context}",source="${entry.source}"`;
      if (entry.strValue) {
        labels += `,value_str="${entry.strValue}"`;
      }

      r += `${k}{${labels}} ${entry.value} ${entry.timestamp}\n`;
    }
    return r;
  }
  function checkAndStore(path, entry, context, source, timestamp, store) {
    if (entry.type === 'number') {
      store[path + context + source] = {
        path,
        value: entry.value,
        context,
        source,
        timestamp
      };
    } else if (entry.type === 'string') {
      store[path + context + source + '_str_' + entry.value] = {
        path,
        value: 1,
        context,
        source,
        timestamp,
        strValue: entry.value
      };
    }
  }
  function flattenJson(pathPrefix, obj, result) {
    result = result || {};
    if (typeof obj === 'number') {
      result[pathPrefix] = { type: 'number', value: obj };
    } else if (typeof obj === 'boolean') {
      result[pathPrefix] = { type: 'number', value: obj ? 1 : 0 };
    } else if (typeof obj === 'string') {
      const d = new Date(obj).getTime();
      if (isNaN(d)) {
        result[pathPrefix] = { type: 'string', value: obj };
      } else {
        result[pathPrefix] = { type: 'number', value: d };
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        const newPrefix = pathPrefix ? pathPrefix + '.' + key : key;
        flattenJson(newPrefix, obj[key], result);
      }
    }
    return result;
  }
  function saveDelta(delta, checkShouldStore, store, allShip) {
      if (!delta.updates || delta.updates.length === 0) return;
      if (delta.context === 'vessels.self') {
        delta.context = selfContext
      }
      var context = delta.context;
      var timestamp = new Date(delta.updates[0].timestamp).getTime();
      var source = delta.updates[0].$source;
      if (delta.updates && (delta.context === selfContext || allShip)) {
        delta.updates.forEach(update => {
          if (update.values) {
            update.values.forEach(updateValue => {
              const flat = flattenJson(updateValue.path, updateValue.value);
              for (const path in flat) {
                if (shouldStore(path)) {
                  checkAndStore(path, flat[path], context, source, timestamp, store);
                }
              }
            });
          }
        });
      }      
  }


  return {
    id: 'signalk-prometheus-exporter',
    name: 'Prometheus exporter for SignalK',
    description: 'Signal K server plugin exposes a end point for Prometheus to pull from',

    schema: {
      type: 'object',
      required: [],
      properties: {
        blackOrWhite: {
          type: 'string',
          title: 'Type of List',
          description:
            'With a blacklist, all numeric values except the ones in the list below will be stored in InfluxDB. With a whitelist, only the values in the list below will be stored.',
          default: 'Black',
          enum: ['White', 'Black']
        },
        blackOrWhitelist: {
          title: 'SignalK Paths',
          description:
            'A list of SignalK paths to be exluded or included based on selection above',
          type: 'array',
          items: {
            type: 'string',
            title: 'Path'
          }
        },
        selfOrAll: {
          type: 'string',
          title: 'Type of List',
          description:
            'With the Self option, only data from the local boat is exposed in Prometheus format. With the All option, data from all boats is exposed, with the boat identifier included in the context label.',
          default: 'Self',
          enum: ['Self', 'All']
        },
        maxAge: {
          type: 'number',
          title: 'Maximum data age (s)',
          description: 'Metrics older than this age (in seconds) are not exported. Default: 600 (10 minutes).',
          default: 600
        }
      }
    },
    start: function (options) {
      if (
        typeof options.blackOrWhitelist !== 'undefined' &&
        typeof options.blackOrWhite !== 'undefined' &&
        options.blackOrWhitelist.length > 0
      ) {
        var obj = {}

        options.blackOrWhitelist.forEach(element => {
          obj[element] = true
        })

        if (options.blackOrWhite == 'White') {
          shouldStore = function (path) {
            return typeof obj[path] !== 'undefined'
          }
        } else {
          shouldStore = function (path) {
            return typeof obj[path] === 'undefined'
          }
        }
      }
      if (options.selfOrAll == "All") {
        allShip = 1;
      } else {
        allShip = 0;
      }
      if (options.maxAge) {
        maxAgeMs = options.maxAge * 1000;
      }
      var handleDelta = function(delta) {
        saveDelta(delta, shouldStore, store, allShip);
      }
      app.signalk.on('delta', handleDelta)
      unsubscribes.push(() => {
        app.signalk.removeListener('delta', handleDelta)
      })
    },
    stop: function () {
      unsubscribes.forEach(f => f())
      store = {};
    },
    signalKApiRoutes: function (router) {
      const metricsHandler = function(req, res, next) {
        res.type("text/plain; version=0.0.4; charset=utf-8");
        res.send(toMetrics(store));
      }
      router.get('/prometheus', metricsHandler);
      console.log("Registered metrics end point ", router );
      return router;
    }
  }
}

