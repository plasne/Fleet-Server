
const redis = require("redis");
const uuid = require("node-uuid");

const verbose = true;

module.exports = function(context) {

    // connect to redis
    var redis_key = process.env["RedisKey"];
    var client = redis.createClient(6380, "pelasne-fleet.redis.cache.windows.net", {
        auth_pass: redis_key,
        tls: { servername: "pelasne-fleet.redis.cache.windows.net" }
    });

    // get the request information
    var playerId = context.req.headers["player"];
    var opponentId = context.req.headers["opponent"];
    var group = context.req.headers["group"];
    if (playerId != null && group != null) {

        // see if the player has been paired
        client.get("player:" + playerId, function(err, gameInfo) {
            if (!err) {
                if (gameInfo != null) {

                    // the player was previously matched, just return the status
                    if (verbose) context.log("the player was previously matched, returning gameInfo.");
                    context.res = {
                        status: 200,
                        body: json.parse(gameInfo)
                    }
                    client.del("player:" + playerId, function(err) {
                        if (err) {
                            context.log("could not delete player");
                        }
                        context.done();
                    });

                } else {

                    // the player has not been matched yet, so see if there is someone waiting
                    client.get("lobby:" + group, function(err, playerInLobbyId) {
                        if (playerInLobbyId != null) {

                            // examine the lobby
                            if (playerId != playerInLobbyId) {
                                if (verbose) context.log("the player is matched; storing for opponent, returning gameInfo.");

                                // remove the player from the lobby
                                client.del("lobby:" + group, function(err) {
                                    if (!err) {

                                        // store a game entry for the player
                                        var gameId = uuid.v4();
                                        client.set("player:" + playerInLobbyId, JSON.stringify({
                                            status: "matched",
                                            gameId: gameId,
                                            opponentId: playerId
                                        }), function(err) {
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
                                                context.log("cannot add a game entry for a player.");
                                                context.res = {
                                                    status: 500,
                                                    body: "cannot_store_game_entry"
                                                }
                                                context.done();
                                            }
                                            
                                        });

                                    } else {
                                        context.log("cannot remove player from lobby");
                                        context.res = {
                                            status: 500,
                                            body: "cannot_remove_player"
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
                            client.set("lobby:" + group, playerId, function(err) {
                                if (!err) {
                                    if (verbose) context.log("the player was queued in the lobby.");
                                    context.res = {
                                        status: 200,
                                        body: { status: "waiting" }
                                    }
                                    context.done();
                                } else {
                                    context.log("cannot put a player in the lobby");
                                    context.res = {
                                        status: 500,
                                        body: "cannot_put_in_lobby"
                                    }
                                    context.done();
                                }
                            });

                        }
                    });

                }
            } else {
                context.log("could not query for the player.");
                context.res = {
                    status: 500,
                    body: "cannot_query_players"
                }
                context.done();
            }
        });

    } else {
        context.log("playerId or group was null so the request was ignored.");
        context.res = {
            status: 500,
            body: "invalid_parameters"
        }
        context.done();
    }

}