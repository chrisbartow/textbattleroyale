// ----------------------------------------------------------------------------
//
// Text Battle Royale v0.2 - The twitch.tv chat based game 
// Copyright (C) 2019 Chris Bartow <chris@codenut.io>
// All rights reserved
//
// This source file is licensed under the terms of the MIT license.
// See the LICENSE file to learn about this license.
//
// ----------------------------------------------------------------------------

// Import Configurations
const config = require('./config.json');

// Require SQLite Module
var sql = require("sqlite3").verbose();
var db = new sql.Database('db.sqlite');

// Initialize players table if it does not exist
db.run(`CREATE TABLE IF NOT EXISTS players (
    id int PRIMARY KEY, 
    name varchar(32),
    xp int, 
    wins int, 
    games int, 
    kills int
    )`, function(err) {
    if (err) throw err;
});

// Require Twitch Messaging Service
const tmi = require('tmi.js');

// Create a chat client
const client = new tmi.client(config);

// Register event handles for Twitch IRC Chat
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

// Connect to Twitch
client.connect();

// Game State
var gameState = "lobby";

// Create an array of players
var players = new Array();

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr, port) {
    console.log(`Connected to ${addr}:${port}`);
    if (config['overlay'])
        OverlayServer();
}

// Called every time a message comes in
function onMessageHandler(target, context, msg, self) {
    if (self) { return; } // Ignore messages from the bot
    // console.log(context);
    console.log(target, '<' + context['display-name'] + '>', msg);
    const cmd = msg.trim();

    // !join the game
    if (/^!join/i.test(cmd) && gameState === 'lobby') {
        // Make sure they haven't joined yet
        if (players.findIndex(x => x.id === Number(context['user-id'])) === -1) {

            var playerObj = {
                "id": Number(context['user-id']),
                "name": context['display-name'],
                "xp": 0,
                "wins": 0,
                "games": 0,
                "kills": 0
            };

            // Check to see if player has played before
            db.get(`SELECT xp, wins, kills, games FROM players WHERE id = ?`, [playerObj['id']], (err, result) => {
                if (err) throw err;

                // Load player data from database
                if (result) {
                    Object.assign(playerObj, result);
                }

                players.push(playerObj);

                if (players.length === 1) {
                    client.say(target, `${playerObj['name']} started a new lobby! Type !join to fight for that cheesecake.`);
                }

            });
        }
    }

    if (/^!bots/i.test(cmd) && gameState === 'lobby') {
        var bots = cmd.match(/^!bots *([0-9\-_]*)/i)[1];

        if (!bots) {
            bots = Math.floor(Math.random() * 10) + 1;
        } else if (Number(bots) + players.length > 100) {
            client.say(target, `Too many bots! Abort!`);
            return;
        }

        var playerName, playerId;
        for (var i = 0; i < bots; i++) {
            if (Math.floor((Math.random() * 2))) {
                playerName = "Rick";
                playerId = "R" + Math.floor(Math.random() * 1000);
            } else {
                playerName = "Morty";
                playerId = "M" + Math.floor(Math.random() * 1000);
            }
            if (players.findIndex(x => x.id === playerId === -1)) {

                var playerObj = {
                    "id": playerId,
                    "name": playerName,
                    "xp": 0,
                    "wins": 0,
                    "games": 0,
                    "kills": 0
                };

                players.push(playerObj);
            } else {
                bots--;
            }
        }

        if (players.length === Number(bots)) {
            client.say(target, `${bots} robots have started a new lobby! Type !join to prevent them from getting the cheesecake.`);
        }
    }

    // !drop Start the game
    if (/^!drop/i.test(cmd) && gameState === 'lobby') {
        if (players.length > 1) {
            gameState = "active";
            client.say(target, "The battle begins in 15 seconds... ");
            setTimeout(() => battleroyale(target, players, 1), 15000);
        } else {
            client.say(target, "It looks like we don't have enough players. Get your friends to !join.");
        }
    }

    // !br show game info
    if (/^!br/i.test(cmd)) {
        client.say(target, `Text BR is a text based version of your favorite last man or woman standing game. Type !join to grab a spot in the next game.`);
    }

    // !dance monkey dance
    if (/^!dance/i.test(cmd)) {
        var result = cmd.match(/^!dance *([a-z0-9\-_]*)/i);
        if (result[1]) {
            client.say(target, `${context['display-name']} dances with ${result[1]}.`);
        } else {
            client.say(target, `${context['display-name']} dances with themselves.`);
        }
    }

    // !lobby show players in the lobby
    if (/^!lobby/i.test(cmd)) {
        if (players.length) {
            client.say(target, `The following players are waiting impatiently in the lobby: ` + players.map(p => p.name).join(', '));
        } else {
            client.say(target, `No one is in the lobby. Type !join to enter.`);
        }
    }

    // !top show top players
    if (/^!rank/i.test(cmd)) {
        db.all(`SELECT name, xp FROM players ORDER BY xp DESC LIMIT 10`, [], (err, rows) => {
            if (err) throw err;
            client.say(target, "The top ranked players of Text Battle Royale by XP are: " + rows.map(player => `${player.name} (${player.xp})`).join(', '));
        });
    }

    // !stats show stats for player
    if (/^!stats/i.test(cmd)) {
        var result = cmd.match(/^!stats *([A-z0-9\-_]*)/i);

        if (result[1])
            var username = result[1];
        else
            var username = context['display-name'];

        db.all(`SELECT * FROM players WHERE name = ? COLLATE NOCASE`, [username], (err, rows) => {
            if (err) throw err;
            if (rows.length) {
                var kdratio = rows[0]['kills'] / (rows[0]['games'] - rows[0]['wins']);
                client.say(target, `${rows[0]['name']} has earned ${rows[0]['xp']} XP playing in ${rows[0]['games']} games with ${rows[0]['kills']} kills, ${rows[0]['wins']} wins, and K/D Ratio of ${kdratio.toFixed(2)}.`);
            } else {
                client.say(target, `Can't find user ${username}.`);
            }
        });
    }

}

function battleroyale(target, notdeadyet, round) {

    // Randomly Sort Active Players
    notdeadyet.sort(() => Math.random() - 0.5);

    var playersAlive = notdeadyet.length;

    // Pair up individuals
    let pair = notdeadyet.reduce(function(result, value, index, array) {
        if (index % 2 === 0)
            result.push(array.slice(index, index + 2));
        return result;
    }, []);

    // Loop through the array and randomly pick a 'winner'
    let survivers = new Array();

    pair.forEach(function(fighters) {
        let winner;
        if (fighters.length > 1) {
            winner = Math.floor((Math.random() * 2));
            let loser = winner ? 0 : 1;
            // Assign XP when someone loses
            let loserIdx = players.findIndex(x => x.id === fighters[loser].id);
            players[loserIdx].xp += players.length - playersAlive + 1;
            playersAlive--;
            // Give winner a kill
            let winnerIdx = players.findIndex(x => x.id === fighters[winner].id);
            players[winnerIdx].kills++;
        } else {
            // Odd number of contestents. Automatically moves forward. No kills.
            winner = 0;
        }
        // Assign winning array
        survivers.push(fighters[winner]);
    });

    // Check to see if there are players left to battle
    if (survivers.length > 1) {
        client.say(target, `The survivors after round #${round} are: ` + survivers.map(player => player.name).join(', '));
        setTimeout(() => battleroyale(target, survivers, ++round), 5000);
    } else {
        client.say(target, `Winner Winner, Cheesecake Dinner! Congrats ${survivers[0].name}.`);

        // Assign XP to winner (# of players + 5 bonus xp)
        let playerIdx = players.findIndex(x => x.id === survivers[0].id);
        players[playerIdx].xp += players.length + 5;

        // Add win for player
        players[playerIdx].wins++;

        // Write out Player Stats to Database

        var stmt = db.prepare(`REPLACE INTO players(id, name, xp, wins, games, kills) VALUES(?, ?, ?, ?, ?, ?)`);
        players.forEach(function(p) {
            // If it's a bot, don't log it.
            if (isNaN(p.id))
                return;
            p.games++;

            stmt.run(p.id, p.name, p.xp, p.wins, p.games, p.kills);
        });
        stmt.finalize();

        players = new Array();
        // Wait 30 seconds before next game
        setTimeout(() => gameState = 'lobby', 30000);
    }

}

function OverlayServer() {

    var fs = require('fs');
    var http = require('http');
    var path = require('path');

    console.log("HTTP Overlay Server running.");

    http.createServer(function(req, res) {
        let url = path.normalize(req.url).replace(/^\//, "");

        if (url === "")
            url = "xp";

        if (url === "xp" || url === "wins") {
            fs.readFile(`overlay/${url}-leaders.html`, 'utf8', async function(err, html) {
                if (err) {
                    return console.log(err);
                }
                // Create HTML Overlay for Top players

                db.all(`SELECT name, ${url} FROM players ORDER BY ${url} DESC LIMIT 10`, [], (err, rows) => {
                    if (err) return err;
                    if (rows.length) {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        html = html.replace(
                            /%LEADERBOARD%/g,
                            rows.map(
                                (player, index) =>
                                `<li><div class="player">${index+1}. ${player['name']}</div> <div class="stat">${player[url]}</div></li>`).join("")
                        );
                        res.write(html);
                        res.end();
                    }
                });

            });
        } else if (url === "kills") {
            fs.readFile(`overlay/kills-leaders.html`, 'utf8', async function(err, html) {
                if (err) {
                    return console.log(err);
                }
                // Create HTML Overlay for Top players

                db.all(`SELECT name, kills, round(CAST(kills AS FLOAT)/(games-wins),2) as KD FROM players ORDER BY kills DESC LIMIT 10`, [], (err, rows) => {
                    if (err) return err;
                    if (rows.length) {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        html = html.replace(
                            /%LEADERBOARD%/g,
                            rows.map(
                                (player, index) =>
                                `<li><div class="player">${index+1}. ${player['name']}</div> <div class="stat">${player['kills']}</div> <div class="stat">${player['KD']}</div></li>`).join("")
                        );
                        res.write(html);
                        res.end();
                    }
                });

            });
        } else if (url === "style.css") {
            fs.readFile('overlay/style.css', 'utf8', async function(err, html) {
                if (err) {
                    return console.log(err);
                }
                res.writeHead(200, { 'Content-Type': 'text/css' });
                res.write(html);
                res.end();
            });
        } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.write("404 Not Found\n");
            res.end();
        }

    }).listen(8080);
}