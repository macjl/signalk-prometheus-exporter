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

  let unsubscribes = []
  let shouldStore = function (path) {
    return true
  }

  function toPromKey(v) {
    return v.replace(/-|\./g,"_");
  }

  function toMetrics(store) {
      var r = ""
      for (var v in store) {
        var k = toPromKey(store[v].path);
        r = r + "# HELP "+k+" "+k+"\n";
        r = r + "# TYPE "+k+" gauge\n";
        r = r + k + "{context=\"" + store[v].context + "\",source=\"" + store[v].source + "\"} " + store[v].value + " " + store[v].timestamp + "\n";
      } 
      return r;
  }
  function checkAndStore(path, value, context, source, timestamp, store) {
    if (typeof value === 'number' && !isNaN(value)) {
      store[path+context+source] = { path: path, value: value, context: context, source: source, timestamp: timestamp };
    }
  }
  function saveDelta(delta, checkShouldStore, store, allShip) {
      if (delta.context === 'vessels.self') {
        delta.context = selfContext
      }
      var context = delta.context;
      var timestamp = new Date(delta.updates[0].timestamp).getTime();
      var source = delta.updates[0].$source;
      if (delta.updates && (delta.context === selfContext || allShip)) {
        delta.updates.forEach(update => {
          if (update.values) {
            for (var i = update.values.length - 1; i >= 0; i--) {
              var path = update.values[i].path;
              var value = update.values[i].value;
              if (shouldStore(path)) {
                if (path === 'navigation.position') {
                  checkAndStore(path+'.longitude', value.longitude, context, source, timestamp, store);
                  checkAndStore(path+'.latitude', value.latitude, context, source, timestamp, store);
                } else if (path === 'navigation.attitude') {
                  checkAndStore(path+'.pitch', value.pitch, context, source, timestamp, store);
                  checkAndStore(path+'.roll', value.roll, context, source, timestamp, store);
                  checkAndStore(path+'.yaw', value.yaw, context, source, timestamp, store);
                } else if (path === 'environment.current') {
                  checkAndStore(path+'.setTrue', value.setTrue, context, source, timestamp, store);
                  checkAndStore(path+'.drift', value.drift, context, source, timestamp, store);
                } else {
                  checkAndStore(path, value, context, source, timestamp, store);
                }
              }
            }
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

