/*
Text Battle Royale v0.1
Written by Chris Bartow <chris@codenut.io>
https://github.com/chrisbartow/textbattleroyale

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE, 
MERCHANTABLITY OR NON-INFRINGEMENT. 

*/

// Import configuration options
const opts = require('./config.json');

// Require SQLite Module
var sqlite3 = require("sqlite3").verbose();
var db = new sqlite3.Database('db.sqlite');

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
const client = new tmi.client(opts);

// Register our event handlers (defined below)
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

// Connect to Twitch:
client.connect();

// Game State
var gameState = "lobby";

// Create an array of players
var players = new Array();

// Add some fake players for now
players.push({ 'id': 100, 'name': 'Rick', 'xp': 0, 'wins': 0, 'kills': 0, 'games': 0 }, { 'id': 200, 'name': 'Morty', 'xp': 0, 'wins': 0, 'kills': 0, 'games': 0 });

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr, port) {
    console.log(`Connected to ${addr}:${port}`);
}

// Called every time a message comes in
function onMessageHandler(target, context, msg, self) {
    if (self) { return; } // Ignore messages from the bot

    // console.log(context);
    console.log(target, '<' + context['username'] + '>', msg);
    const commandName = msg.trim();

    // !join the game
    if (commandName.match(/^!join/g) && gameState === 'lobby') {
        // Make sure they haven't joined yet
        if (players.findIndex(x => x.id === Number(context['user-id'])) === -1) {

            var playerObj = {
                "id": Number(context['user-id']),
                "name": context['username'],
                "xp": 0,
                "wins": 0,
                "games": 0,
                "kills": 0
            };

            // Check to see if player has played before
            db.all(`SELECT xp, wins, kills, games FROM players WHERE id = ?`, [playerObj['id']], (err, rows) => {
                if (err) throw err;
                if (rows.length) {
                    Object.assign(playerObj, rows[0]);
                }

                players.push(playerObj);

                client.say(target, `${playerObj['name']} joined the battle!`);
            });
        }
    }

    // !drop Start the game
    if (commandName.match(/^!drop/g) && gameState === 'lobby') {
        if (players.length > 1) {
            gameState = "active";
            client.say(target, "The battle begins in 10 seconds... ");
            setTimeout(() => battleroyale(target, players), 10000);
        } else {
            client.say(target, "It looks like we don't have enough players. NotLikeThis");
        }
    }

    // !br show game info
    if (commandName.match(/^!br/g)) {
        client.say(target, `Text BR is a text based version of your favorite last man or woman standing game. Type !join to grab a spot in the next game.`);
    }

    // !top show top players
    if (commandName.match(/^!top/g)) {
        db.all(`SELECT name, xp FROM players ORDER BY xp DESC LIMIT 10`, [], (err, rows) => {
            if (err) throw err;
            client.say(target, "The top players of Text Battle Royale are: " + rows.map(player => `${player.name} (${player.xp})`).join(', '));
        });
    }

    // !stats show stats for player
    if (commandName.match(/^!stats/g)) {
        var result = commandName.match(/^!stats *([A-z0-9\-_]*)/);

        if (result[1])
            var username = result[1].toLowerCase();
        else
            var username = context['username'];

        db.all(`SELECT * FROM players WHERE name = ? LIMIT 1`, [username], (err, rows) => {
            if (err) throw err;
            if (rows.length) {
                client.say(target, `${rows[0]['name']} has earned ${rows[0]['xp']} XP playing in ${rows[0]['games']} games with ${rows[0]['kills']} kills and ${rows[0]['wins']} wins.`);
            } else {
                client.say(target, `Can't find user ${username}.`);
            }
        });
    }

}

function battleroyale(target, notdeadyet) {

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
    let winners = new Array();

    pair.forEach(function(fighters) {
        let winner;
        if (fighters.length > 1) {
            winner = Math.floor((Math.random() * 2));
            const loser = winner ? 0 : 1;
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
        winners.push(fighters[winner]);
    });

    // Check to see if there are players left to battle
    if (winners.length > 1) {
        client.say(target, "The winnners of this round are: " + winners.map(player => player.name).join(', '));
        setTimeout(() => battleroyale(target, winners), 5000);
    } else {
        client.say(target, `Winner Winner, Cheesecake Dinner! Congrats ${winners[0].name}.`);

        // Assign XP to winner (# of players + 5 bonus xp)
        let playerIdx = players.findIndex(x => x.id === winners[0].id);
        players[playerIdx].xp += players.length + 5;

        // Add win for player
        players[playerIdx].wins++;

        // Write out Player Stats to Database
        players.forEach(function(p) {
            // TODO: Convert into one Replace statement Array of Array [[],[]]
            p.games++;
            db.run(`REPLACE INTO players(id, name, xp, wins, games, kills) VALUES(?, ?, ?, ?, ?, ?)`, [p.id, p.name, p.xp, p.wins, p.games, p.kills], function(err) {
                if (err) throw err;
            });
        });

        players = new Array();
        // Wait 30 seconds before next game
        setTimeout(() => gameState = 'lobby', 30000);
    }
}