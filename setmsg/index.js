
const redis = require("redis");

module.exports = function(context) {

    // connect to redis
    var redis_key = process.env["RedisKey"];
    var client = redis.createClient(6380, "pelasne-fleet.redis.cache.windows.net", {
        auth_pass: redis_key,
        tls: { servername: "pelasne-fleet.redis.cache.windows.net" },
        retry_strategy: function(options) {
            if (options.error && options.error.code === "ECONNREFUSED") {
                return new Error("The server refused the connection.");
            }
            if (options.total_retry_time > 1000 * 60 * 1) { // 1 min
                return new Error("Retry time exhausted.");
            }
            if (options.times_connected > 10) {
                return undefined;
            }
            return Math.min(options.attempt * 100, 3000);
        }
    });

    // get the request information
    var gameId = context.req.headers["game"];
    var playerId = context.req.headers["player"];
    var messages = JSON.parse(context.req.body);
    if (gameId != null && playerId != null && Array.isArray(messages) && messages.length > 0) {

        // push the messages
        var multi = client.multi();
        for (var i = 0; i < messages.length; i++) {
            multi.rpush(gameId + ":" + playerId, messages[i]);
        }
        multi.exec(function(err) {
            if (!err) {
                context.res = {
                    status: 200
                }
            } else {
                context.log("cannot push messages: " + err);
                context.res = {
                    status: 500,
                    body: "cannot_push_messages"
                }
            }
            context.done();
        });

    } else {

        // ERROR: invalid parameters
        context.log("game, player, messages was null so the request was ignored.");
        context.res = {
            status: 500,
            body: "invalid_parameters"
        }
        context.done();

    }

}