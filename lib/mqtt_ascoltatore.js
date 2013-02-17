
var util = require("./util");
var wrap = util.wrap;
var MemoryAscoltatore = require("./memory_ascoltatore");
var AbstractAscoltatore = require('./abstract_ascoltatore');

/**
 * MQTTAscoltatore is a class that inherits from AbstractAscoltatore.
 * It is implemented through the `mqtt` package and it could be
 * backed up by any MQTT broker out there.
 *
 * The options are:
 *  - `keepalive`, the keepalive timeout in seconds (see the MQTT spec), the default is 3000;
 *  - `port`, the port to connect to;
 *  - `host`, the host to connect to;
 *  - `mqtt`, the mqtt module (it will automatically be required if not present).
 *
 * @api public
 * @param {Object} opts The options object
 */
function MQTTAscoltatore(opts) {
  AbstractAscoltatore.call(this);

  this._opts = opts || {};
  this._opts.keepalive = this._opts.keepalive || 3000;
  this._opts.mqtt = this._opts.mqtt || require("mqtt");

  this._ascoltatore = new MemoryAscoltatore();
  this._ascoltatore.on("newTopic", this.emit.bind(this, "newTopic"));
  this._startConn();
}

/**
 * MQTTAscoltatore inherits from AbstractAscoltatore
 *
 * @api private
 */
MQTTAscoltatore.prototype = Object.create(AbstractAscoltatore.prototype);

/**
 * Starts a new connection to an MQTT server.
 * Do nothing if it is already started.
 *
 * @api private
 */
MQTTAscoltatore.prototype._startConn = function() {
  var that = this;
  if(this._client === undefined) {
    that._opts.mqtt.createClient(that._opts.port, that._opts.host, function(err, client) {
      if (err) throw err;

      that._client = client;

      client.connect({ keepalive: that._opts.keepalive, client: util.buildIdentifier() });
      client.setMaxListeners(0);

      client.on('connack', function(packet) {
        if (packet.returnCode === 0) {
          that.emit("ready");
        } else {
          that.emit("error", util.format('connack error %d', packet.returnCode));
        }
      });

      client.on("publish", function(packet) {
        that._ascoltatore.publish(packet.topic, JSON.parse(packet.payload));
      });

      client.on('error', function(e) {
        delete that._client;
        that.emit("error", e);
      });
    });
  }
  return this._client;
}

MQTTAscoltatore.prototype._wrapEvent = function wrapEvent(messageId, event, done) {
  var that = this;
  var wrapper = function(packet) {
    if(packet.messageId === messageId) {
      that._client.removeListener(event, wrapper);
      wrap(done)();
    }
  };
  this._client.on(event, wrapper);
}

MQTTAscoltatore.prototype.subscribe = function subscribe(topic, callback, done) {
  this._raiseIfClosed();
  var messageId = buildMessageId(topic);
  this._client.subscribe({ topic: topic.replace("*", "#"), messageId: messageId, qos: 0 });
  this._wrapEvent(messageId, "suback", done);
  this._ascoltatore.subscribe(topic, callback);
};

MQTTAscoltatore.prototype.publish = function publish(topic, message, done) {
  this._raiseIfClosed();
  var messageId = buildMessageId(topic);
  message = JSON.stringify(message || true);
  this._client.publish({ topic: topic, messageId: messageId, qos: 0, payload: message });
  setTimeout(wrap(done), 0);
};

MQTTAscoltatore.prototype.unsubscribe = function unsubscribe(topic, callback, done) {
  this._raiseIfClosed();
  var messageId = buildMessageId(topic);
  this._client.unsubscribe({ topic: topic, messageId: messageId});
  this._wrapEvent(messageId, "unsuback", done);
  this._ascoltatore.unsubscribe(topic, callback);
};

MQTTAscoltatore.prototype.close = function close(done) {
  var that = this;
  if(!this._closed) {
    that._ascoltatore.close();
    this._client.on("close", function() {
      delete that._client;
      wrap(done)();
    });
    this._client.disconnect();
  } else {
    wrap(done)();
  }
  this.emit("closed");
};

util.aliasAscoltatore(MQTTAscoltatore.prototype);

function buildMessageId() {
  return Math.floor(Math.random() * 0xFFFF);
}

/**
 * Exports the MQTTAscoltatore
 *
 * @api public
 */
module.exports = MQTTAscoltatore;