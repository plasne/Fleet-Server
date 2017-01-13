
const redis = require("redis");
const uuid = require("node-uuid");

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

    // get the request information
    var playerId = context.req.headers["player"];
    var opponentId = context.req.headers["opponent"];
    var group = context.req.headers["group"];
    if (playerId != null && opponentId != null && playerId == opponentId) {

        // ERROR: invalid opponent
        context.log("a player tried to face-off with himself.");
        context.res = {
            status: 500,
            body: "invalid_opponent"
        }
        context.done();

    } else if (playerId != null) {

        // see if the player has been paired
        client.get("player:" + playerId, function(err, gameInfo) {
            if (!err) {
                if (gameInfo != null) {

                    // the player was previously matched, just return the status
                    if (verbose) context.log("the player was previously matched, returning gameInfo.");
                    context.res = {
                        status: 200,
                        body: JSON.parse(gameInfo)
                    }

                    // delete the player gameInfo match data
                    client.del("player:" + playerId, function(err) {
                        if (err) context.log("could not delete player: " + err);
                        context.done();
                    });

                } else if (opponentId != null) {

                    // store a game entry for the specified player (and set expiry)
                    if (verbose) context.log("a match is created since an opponent was specified.");
                    var gameId = uuid.v4();
                    client.multi().set("player:" + opponentId, JSON.stringify({
                        status: "matched",
                        gameId: gameId,
                        opponentId: playerId
                    })).expire("player:" + opponentId, 60 * 10).exec(function(err) {
                        if (!err) {

                            // return that this player is waiting on the other
                            context.res = {
                                status: 200,
                                body: {
                                    status: "matched",
                                    gameId: gameId,
                                    opponentId: opponentId
                                }
                            }
                            context.done();

                        } else {

                            // ERROR: cannot add a game entry for the player
                            context.log("cannot create game match.1: " + err);
                            context.res = {
                                status: 500,
                                body: "cannot_create_match.1"
                            }
                            context.done();

                        }
                    });

                } else if (group != null) {

                    // the player has not been matched yet, so see if there is someone waiting
                    client.get("lobby:" + group, function(err, playerInLobbyId) {
                        if (playerInLobbyId != null) {

                            // examine the lobby
                            if (playerId != playerInLobbyId) {
                                if (verbose) context.log("the player is matched; storing for opponent, returning gameInfo.");

                                // remove the player from the lobby, add the gameInfo, expiry (10 min)
                                var gameId = uuid.v4();
                                client.multi().del("lobby:" + group).set("player:" + playerInLobbyId, JSON.stringify({
                                    status: "matched",
                                    gameId: gameId,
                                    opponentId: playerId
                                })).expire("player:" + playerInLobbyId, 60 * 10).exec(function(err) {
                                    if (!err) {

                                        // return the game info to the requesting player
                                        context.res = {
                                            status: 200,
                                            body: {
                                                status: "matched",
                                                gameId: gameId,
                                                opponentId: playerInLobbyId
                                            }
                                        }
                                        context.done();

                                    } else {

                                        // ERROR: cannot remove the player from the lobby
                                        context.log("cannot create game match.2: " + err);
                                        context.res = {
                                            status: 500,
                                            body: "cannot_create_match.2"
                                        }
                                        context.done();

                                    }
                                });

                            } else {

                                // the player was already waiting
                                if (verbose) context.log("the player is already waiting in the lobby.");
                                context.res = {
                                    status: 200,
                                    body: { status: "waiting" }
                                }
                                context.done();

                            }

                        } else {

                            // there is no one in the lobby, so put this player there
                            client.multi().set("lobby:" + group, playerId).expire("lobby:" + group, 60 * 10, function(err) {
                                if (!err) {

                                    // queue the player in the lobby
                                    if (verbose) context.log("the player was queued in the lobby.");
                                    context.res = {
                                        status: 200,
                                        body: { status: "enqueued" }
                                    }
                                    context.done();

                                } else {

                                    // ERROR: player cannot be put in the lobby
                                    context.log("cannot put a player in the lobby: " + err);
                                    context.res = {
                                        status: 500,
                                        body: "cannot_put_in_lobby"
                                    }
                                    context.done();

                                }
                            });

                        }
                    });

                } else {

                    // group is null, so just sit and wait on someone to match with him
                    context.res = {
                        status: 200,
                        body: { status: "deferred" }
                    }
                    context.done();

                }
            } else {

                // ERROR: cannot query for the player to see if he has been matched already
                context.log("could not query for the player: " + err);
                context.res = {
                    status: 500,
                    body: "cannot_query_player"
                }
                context.done();
            }
        });

    } else {

        // ERROR: invalid parameters
        context.log("playerId or group was null so the request was ignored.");
        context.res = {
            status: 500,
            body: "invalid_parameters"
        }
        context.done();

    }

}