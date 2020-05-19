# Text Battle Royale

Text Battle Royale is a text based chat game for twitch chat that lets user compete in a battle royale type competation.

## Instalation

Requires Node.JS, tmi.js, and SQLite Module.

Copy the config-example.json to config.json and update with your bot username, OAuth token, and channel name. Setting overlay to true will start an http server to show statistics as a stream overlay.

## Usage

To run, enter the following on a terminal in the project directory:

```node bot.js```

To use the leaderboard overlay, create a new Browser Source in OBS and point it to:
> http://localhost:8080