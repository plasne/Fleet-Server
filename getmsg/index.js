
const redis = require("redis");

const verbose = true;

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

    client.get("nothing", function(err, result) {
        context.res = {
            result: result
        }
        context.done();
    });

/*
    // get the request information
    var playerId = context.req.headers["player"];
    var opponentId = context.req.headers["opponent"];
    var group = context.req.headers["group"];
    if (playerId != null && opponentId != null && playerId == opponentId) {


    }
*/

}