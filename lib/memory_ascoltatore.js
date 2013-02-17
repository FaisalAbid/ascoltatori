var EventEmitter = require('events').EventEmitter;
var AbstractAscoltatore = require("./abstract_ascoltatore");
var SubsCounter = require("./subs_counter");
var util = require("./util");
var wrap = util.wrap;
var defer = util.defer;

/**
 * A MemoryAscoltatore is a class that inherits from AbstractAscoltatore.
 * It is backend by an EventEmitter and an object-map.
 *
 * @api public
 */
function MemoryAscoltatore() {
  AbstractAscoltatore.call(this);

  this._event = new EventEmitter();
  this._set = new SubsCounter();
  this.emit("ready");

  // avoid problems with listeners
  this._event.setMaxListeners(0);
}


/**
 * See AbstractAscoltatore for the public API definitions.
 *
 * @api private
 */

MemoryAscoltatore.prototype = Object.create(AbstractAscoltatore.prototype);

MemoryAscoltatore.prototype.subscribe = function subscribe(topic, callback, done) {
  this._raiseIfClosed();
  if(containsWildcard(topic)) {
    var regexp = new RegExp(topic.replace("*", ".+"));
    var that = this;
    var handler = function(e) {
      if(e.match(regexp)) {
        that._event.on(e, callback);
      }
    };
    callback._ascoltatori_global_handler = handler;
    this._set.forEach(handler);
    this.on("newTopic", handler);
  } else {
    if(!this._set.include(topic)) {
      this._set.add(topic);
      this.emit("newTopic", topic);
    }
    this._event.on(topic, callback);
  }

  wrap(done)();
};

MemoryAscoltatore.prototype.publish = function publish(topic, message, done) {
  this._raiseIfClosed();

  if(!this._set.include(topic)) {
    this._set.add(topic);
    this.emit("newTopic", topic);
  }
  this._event.emit.apply(this._event, [topic, topic, message]);

  wrap(done)();
};

MemoryAscoltatore.prototype.unsubscribe = function unsubscribe(topic, callback, done) {
  this._raiseIfClosed();

  var that = this;
  if(callback._ascoltatori_global_handler !== undefined) {
    this.removeListener("newTopic", callback._ascoltatori_global_handler);
    var regexp = new RegExp(topic.replace("*", ".+"));
    this._set.forEach(function(e) {
      if(e.match(regexp)) {
        that._event.removeListener(e, callback);
      }
    });
  } else {
    this._event.removeListener(topic, callback);
  }

  wrap(done)();
};

MemoryAscoltatore.prototype.close = function close(done) {
  this._set.clear();
  this._event.removeAllListeners();
  this.emit("closed");

  defer(done);
};

MemoryAscoltatore.prototype.registerDomain = function (domain) {
  domain.add(this._event);
};

util.aliasAscoltatore(MemoryAscoltatore.prototype);

function containsWildcard(topic) {
  return topic.indexOf("*") >= 0;
}

/**
 * Exports the MemoryAscoltatore.
 *
 * @api public
 */
module.exports = MemoryAscoltatore;