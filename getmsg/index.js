
const redis = require("redis");

module.exports = function(context) {

    // connect to redis
    var redis_key = process.env["RedisKey"];
    var client = redis.createClient(6380, "pelasne-fleet.redis.cache.windows.net", {
        auth_pass: redis_key,
        tls: { servername: "pelasne-fleet.redis.cache.windows.net" },
        retry_strategy: function(options) {
            if (options.error && options.error.code === "ECONNREFUSED") {
                return new Error("The server refused the connection");
            }
            if (options.total_retry_time > 1000 * 60 * 1) { // 1 min
                return new Error("Retry time exhausted");
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
    if (gameId != null && playerId != null) {

        // pop the top 20 messages
        client.multi().lrange(gameId + ":" + playerId, 0, 19, function(err, messages) {
            if (!err) {
                context.res = {
                    status: 200,
                    body: messages
                }
                context.done();
            }
        }).ltrim(gameId + ":" + playerId, 20, 999).exec(function(err) {
            if (err) {
                context.log("cannot read messages: " + err);
                context.res = {
                    status: 500,
                    body: "failed_to_read_messages"
                }
                context.done();
            }
        });

    } else {

        // ERROR: invalid parameters
        context.log("game or player was null so the request was ignored.");
        context.res = {
            status: 500,
            body: "invalid_parameters"
        }
        context.done();

    }

}