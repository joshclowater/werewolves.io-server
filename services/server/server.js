// Setup basic express server
var express = require('express');
var config = require('./lib/config');

var app = express();
app.get('/status', (req, res) => res.send('up'));

var server = require('http').createServer(app);
var io = require('socket.io')(server);
var redis = require('socket.io-redis');
io.adapter(redis({ host: config.REDIS_ENDPOINT, port: 6379 }));

var Game = require('./lib/game');

io.on('connection', async function(socket) {
  const { type, id } = socket.handshake.query;
  console.log('CONNECTION', type, id);

  let gameName;
  let playerName;

  if (type === 'host') {
    const name = makeId();
    if (await Game.create({ name, host: { id, socketId: socket.id } })) {
      gameName = name;
      socket.join(`${gameName}`);
      socket.emit('HOST/CONNECTED', { gameId: gameName });
    } else {
      socket.emit('HOST/FAILED_TO_CREATE_GAME');
    }
  } else if (type === 'player') {
    socket.emit('PLAYER/CONNECTED');
  } else {
    console.warn('Tried to connect with invalid type', type);
    socket.emit('CONNECTED_FAILED', { error: 'Tried to connect with invalid type: ' + type });
    socket.disconnect();
  }

  socket.on('disconnect', async () => {
    console.log('DISCONNECT', gameName, type, playerName);
    if (type === 'host') {
      socket.to(`${gameName}`).emit('CLIENT_DISCONNECTED', { message: 'A player disconnected. This has quit the game. Please disconnect.' });
      await Game.delete(gameName);

      // Used to validate delete works
      // const allRemainingGames = await Game.getAll();
      // console.log('allRemainingGames', allRemainingGames);
    } else {
      console.warn('Unhandled player disconnect.')
    }
  });

  socket.on('CONNECT_TO_GAME', async function({ gameId, name }) {

    console.log('CONNECT_TO_GAME', gameId, name);

    if (type !== 'player') {
      socket.emit(
        'CONNECT_TO_GAME_FAILED',
        { error: 'Tried to connect to game with non-player type: ' + type }
      );
      return;
    }

    const game = await Game.get(gameId);

    if (game === false) {
      socket.emit(
        'PLAYER/CONNECT_TO_GAME_FAILED',
        { error: { gameId: 'An error occurred trying to access this game. Please try again.' }}
      );
      return;
    }
    if (!game) {
      socket.emit(
        'PLAYER/CONNECT_TO_GAME_FAILED',
        { error: { gameId: 'A game with this name does not exist.' }}
      );
      return;
    }
    if (game.gameStatus !== 'waiting-for-players') {
      socket.emit(
        'PLAYER/CONNECT_TO_GAME_FAILED',
        { error: { gameId: 'This game has already started.' }}
      );
      return;
    }
    if (Object.keys(game.players).length >= 12) {
      socket.emit(
        'PLAYER/CONNECT_TO_GAME_FAILED',
        { error: { gameId: 'This game has the maximum number of players.' }}
      );
      return;
    }
    if (game.players[name] !== undefined) {
      socket.emit(
        'PLAYER/CONNECT_TO_GAME_FAILED',
        { error: { name: 'A player with this name already exists in the game.' }}
      );
      return;
    }

    if (await Game.addPlayer(gameId, name, { id, name, socketId: socket.id })) {
      gameName = gameId;
      playerName = name;
      socket.join(`${gameName}`); // XXX?
      socket.join(`${gameName}-players`)
      socket.emit('PLAYER/CONNECTED_TO_GAME', { name });
      io.to(`${game.host.socketId}`).emit('HOST/PLAYER_CONNECTED_TO_GAME', { player: { name }});
    } else {
      socket.emit(
        'PLAYER/CONNECT_TO_GAME_FAILED',
        { error: { gameId: 'An error occurred trying to add you to the game. Please try again.' }}
      );
    }
  });

  socket.on('START_GAME', async function() {
    console.log('START_GAME', gameName);

    if (type !== 'host') {
      socket.emit(
        'START_GAME_FAILED',
        { error: 'Tried to start game with non-host type: ' + type }
      );
      return;
    }

    const game = await Game.get(gameName);

    if (!game) {
      socket.emit(
        'HOST/START_GAME_FAILED',
        { error: 'An error occurred trying to access this game. Please try again.' }
      );
      return;
    }
    if (game.gameStatus !== 'waiting-for-players') {
      socket.emit(
        'HOST/START_GAME_FAILED',
        { error: 'This game has already started.' }
      );
      return;
    }
    if (Object.keys(game.players).length < 4) {
      socket.emit(
        'HOST/START_GAME_FAILED',
        { error: 'This game does not yet have the minimum number of players.' }
      );
      return;
    }

    if (await Game.startGame(gameName)) {
      socket.emit('HOST/STARTED_GAME');
    } else {
      socket.emit(
        'HOST/START_GAME_FAILED',
        { error: 'An error occurred trying to start this game. Please try again.' }
      );
    }
  });

  socket.on('START_ROUND', async function() {
    console.log('START_ROUND', gameName);

    if (type !== 'host') {
      socket.emit(
        'START_ROUND_FAILED',
        { error: 'Tried to start game with non-host type: ' + type }
      );
      return;
    }

    const game = await Game.get(gameName);

    if (!game) {
      socket.emit(
        'HOST/START_ROUND_FAILED',
        { error: 'An error occurred trying to access this game. Please try again.' }
      );
      return;
    }
    if (game.gameStatus !== 'started-game') {
      socket.emit(
        'HOST/START_ROUND_FAILED',
        { error: 'This game is not in the "started-game" status.' }
      );
      return;
    }

    const villagers = Object.keys(game.players);
    let werewolves = [];
    let numberOfWerewolves = (villagers.length > 6) ? 2 : 1;

    for (numberOfWerewolves; numberOfWerewolves > 0; numberOfWerewolves--) {
      const wolf = villagers.splice(Math.floor(Math.random() * villagers.length), 1);
      werewolves = werewolves.concat(wolf);
    }

    if (await Game.startRound(gameName, villagers, werewolves)) {
      remoteJoins = [];
      werewolves.forEach(player => {
        remoteJoins.push(remoteJoin(game.players[player].socketId, `${gameName}-werewolves`));
      });
      villagers.forEach(player => {
        remoteJoins.push(remoteJoin(game.players[player].socketId, `${gameName}-villagers`));
      });
      await Promise.all(remoteJoins);

      socket.emit('HOST/ROUND_STARTED', { villagers, werewolves });

      socket.to(`${gameName}-werewolves`).emit(
        'PLAYER/ROUND_STARTED',
        { role: 'werewolf' }
      );
      socket.to(`${gameName}-villagers`).emit(
        'PLAYER/ROUND_STARTED',
        { role: 'villager' }
      );

    } else {
      socket.emit(
        'HOST/START_ROUND_FAILED',
        { error: 'An error occurred trying to start the round. Please try again.' }
      );
    }
  });

  socket.on('START_NIGHT', async function() {
    console.log('START_NIGHT', gameName);

    if (type !== 'host') {
      socket.emit(
        'START_NIGHT_FAILED',
        { error: 'Tried to start night with non-host type: ' + type }
      );
      return;
    }

    const game = await Game.get(gameName);

    if (!game) {
      socket.emit(
        'HOST/START_NIGHT_FAILED',
        { error: 'An error occurred trying to access this game. Please try again.' }
      );
      return;
    }
    if (!(game.gameStatus === 'intro-to-round' || game.gameStatus === 'day-ended')) {
      socket.emit(
        'HOST/START_NIGHT_FAILED',
        { error: 'This game is not in the "intro-to-round" nor "day-ended" status.' }
      );
      return;
    }

    if (await Game.startNight(gameName)) {
      socket
        .to(`${gameName}-villagers`)
        .to(`${gameName}-werewolves`)
        .emit('PLAYER/NIGHT_STARTED');
      socket.emit('HOST/NIGHT_STARTED');
    } else {
      socket.emit(
        'HOST/START_NIGHT_FAILED',
        { error: 'An error occurred trying to start night. Please try again.' }
      );
    }
  });

  socket.on('START_WEREWOLVES_PICK', async function() {
    console.log('START_WEREWOLVES_PICK', gameName);

    if (type !== 'host') {
      socket.emit(
        'START_WEREWOLVES_PICK_FAILED',
        { error: 'Tried to start werewolves picks with non-host type: ' + type }
      );
      return;
    }

    const game = await Game.get(gameName);

    if (!game) {
      socket.emit(
        'HOST/START_WEREWOLVES_PICK_FAILED',
        { error: 'An error occurred trying to access this game. Please try again.' }
      );
      return;
    }
    if (game.gameStatus !== 'night') {
      socket.emit(
        'HOST/START_WEREWOLVES_PICK_FAILED',
        { error: 'This game is not in the "night" status.' }
      );
      return;
    }

    // TODO randomize the order of villagers
    if (await Game.startWerewolvesPicks(gameName)) {
      socket.emit('HOST/WEREWOLVES_PICKS_STARTED');
      socket.to(`${gameName}-werewolves`).emit(
        'PLAYER/WEREWOLVES_PICKS_STARTED',
        { villagers: game.villagers }
      );
    } else {
      socket.emit(
        'HOST/START_NIGHT_FAILED',
        { error: 'An error occurred trying to start werewolves picks. Please try again.' }
      );
    }
  });

  socket.on('SUBMIT_WEREWOLF_PICK', async function({ pick }) {
    console.log('SUBMIT_WEREWOLF_PICK', gameName, playerName, pick);

    if (type !== 'player') {
      socket.emit(
        'SUBMIT_WEREWOLF_PICK_FAILED',
        { error: 'Tried to submit werewolf pick with non-player type: ' + type }
      );
      return;
    }

    const game = await Game.get(gameName);

    if (!game) {
      socket.emit(
        'PLAYER/SUBMIT_WEREWOLF_PICK_FAILED',
        { error: { pick: 'An error occurred trying to access this game. Please try again.' }}
      );
      return;
    }
    if (game.gameStatus !== 'collecting-werewolves-picks') {
      socket.emit(
        'PLAYER/SUBMIT_WEREWOLF_PICK_FAILED',
        { error: { pick: 'This game is not collecting answers.' }}
      );
      return;
    }
    if (!game.werewolves.includes(playerName)) {
      socket.emit(
        'PLAYER/SUBMIT_WEREWOLF_PICK_FAILED',
        { error: { pick: 'You are not a living werewolf.' }}
      );
      return;
    }
    if (!game.villagers.includes(pick)) {
      socket.emit(
        'PLAYER/SUBMIT_WEREWOLF_PICK_FAILED',
        { error: { pick: 'Pick is not a living villager.' }}
      );
      return;
    }

    if (await Game.submitWerewolfPick(gameName, playerName, pick)) {
      socket.emit('PLAYER/SUBMITTED_WEREWOLF_PICK', { playerName, pick });
      io.to(`${game.host.socketId}`).emit('HOST/SUBMITTED_WEREWOLF_PICK', { playerName, pick });
    } else {
      socket.emit(
        'PLAYER/SUBMIT_WEREWOLF_PICK_FAILED',
        { error: { pick: 'An error occurred trying to submit the pick. Please try again.' }}
      );
    }

  });

  socket.on('END_WEREWOLVES_PICK', async function() {
    console.log('END_WEREWOLVES_PICK', gameName);

    if (type !== 'host') {
      socket.emit(
        'END_WEREWOLVES_PICK_FAILED',
        { error: 'Tried to end werewolves picks with non-host type: ' + type }
      );
      return;
    }

    const game = await Game.get(gameName);

    if (!game) {
      socket.emit(
        'HOST/END_WEREWOLVES_PICK_FAILED',
        { error: 'An error occurred trying to access this game. Please try again.' }
      );
      return;
    }
    if (game.gameStatus !== 'collecting-werewolves-picks') {
      socket.emit(
        'HOST/END_WEREWOLVES_PICK_FAILED',
        { error: 'This game is not in the "collecting-werewolves-picks" status.' }
      );
      return;
    }

    if (await Game.endWerewolvesPicks(gameName)) {
      socket.emit('HOST/WEREWOLVES_PICKS_ENDED');
      socket.to(`${gameName}-werewolves`).emit('PLAYER/WEREWOLVES_PICKS_ENDED');
    } else {
      socket.emit(
        'HOST/END_WEREWOLVES_PICK_FAILED',
        { error: 'An error occurred trying to end werewolves picks. Please try again.' }
      );
    }
  });

  socket.on('START_DAY', async function() {
    console.log('START_DAY', gameName);

    if (type !== 'host') {
      socket.emit(
        'START_DAY_FAILED',
        { error: 'Tried to start day with non-host type: ' + type }
      );
      return;
    }

    const game = await Game.get(gameName);

    if (!game) {
      socket.emit(
        'HOST/START_DAY_FAILED',
        { error: 'An error occurred trying to access this game. Please try again.' }
      );
      return;
    }
    if (game.gameStatus !== 'ended-werewolves-picks') {
      socket.emit(
        'HOST/START_DAY_FAILED',
        { error: 'This game is not in the "ended-werewolves-picks" status.' }
      );
      return;
    }

    const { deceased, villagers, werewolves } = game;
    const werewolfPicks = Object.values(game.werewolfPicks);
    let newlyDeceased;
    let newVillagers = villagers;
    if ( // If all werewolves picked and picked the same
      werewolfPicks.length === werewolves.length &&
      werewolfPicks.every(
        (val, i, arr) => val === arr[0]
      )
    ) {
      newlyDeceased = werewolfPicks[0];
      deceased.push(newlyDeceased);
      newVillagers = villagers.filter(villager => villager !== newlyDeceased);
    }

    if (await Game.startDay(gameName, deceased, newVillagers)) {
      if (newlyDeceased) {
        const newlyDeceasedSocketId = game.players[newlyDeceased].socketId;
        await remoteLeave(newlyDeceasedSocketId, `${gameName}-villagers`);
        io.to(newlyDeceasedSocketId).emit('PLAYER/DECEASED');  
      }
      socket
        .to(`${gameName}-villagers`)
        .to(`${gameName}-werewolves`)
        .emit(
          'PLAYER/DAY_STARTED',
          { villagers: Object.values(game.players)
            .map(player => player.name)
            .filter(player => !deceased.includes(player)) }
        );
      socket.emit('HOST/DAY_STARTED', { newlyDeceased: [newlyDeceased] });
    } else {
      socket.emit(
        'HOST/START_DAY_FAILED',
        { error: 'An error occurred trying to start day. Please try again.' }
      );
    }
  });

  socket.on('SUBMIT_VILLAGER_PICK', async function({ pick }) {
    console.log('SUBMIT_VILLAGER_PICK', gameName, playerName, pick);

    if (type !== 'player') {
      socket.emit(
        'SUBMIT_VILLAGER_PICK_FAILED',
        { error: 'Tried to submit villager pick with non-player type: ' + type }
      );
      return;
    }

    const game = await Game.get(gameName);

    if (!game) {
      socket.emit(
        'PLAYER/SUBMIT_VILLAGER_PICK_FAILED',
        { error: { pick: 'An error occurred trying to access this game. Please try again.' }}
      );
      return;
    }
    if (game.gameStatus !== 'day') {
      socket.emit(
        'PLAYER/SUBMIT_VILLAGER_PICK_FAILED',
        { error: { pick: 'This game is not day.' }}
      );
      return;
    }
    if (!game.werewolves.includes(playerName) && !game.villagers.includes(playerName)) {
      socket.emit(
        'PLAYER/SUBMIT_VILLAGER_PICK_FAILED',
        { error: { pick: 'You are not living.' }}
      );
      return;
    }
    if (!game.werewolves.includes(pick) && !game.villagers.includes(pick)) {
      socket.emit(
        'PLAYER/SUBMIT_VILLAGER_PICK_FAILED',
        { error: { pick: 'Pick is not living.' }}
      );
      return;
    }

    if (await Game.submitVillagerPick(gameName, playerName, pick)) {
      socket.emit('PLAYER/SUBMITTED_VILLAGER_PICK', { pick });
      io.to(`${game.host.socketId}`).emit('HOST/SUBMITTED_VILLAGER_PICK', { playerName, pick });
    } else {
      socket.emit(
        'PLAYER/SUBMIT_VILLAGER_PICK_FAILED',
        { error: { answer: 'An error occurred trying to submit the pick. Please try again.' }}
      );
    }

  });

  socket.on('END_DAY', async function() {
    console.log('END_DAY', gameName);

    if (type !== 'host') {
      socket.emit(
        'END_DAY_FAILED',
        { error: 'Tried to start day with non-host type: ' + type }
      );
      return;
    }

    const game = await Game.get(gameName);

    if (!game) {
      socket.emit(
        'HOST/END_DAY_FAILED',
        { error: 'An error occurred trying to access this game. Please try again.' }
      );
      return;
    }
    if (game.gameStatus !== 'day') {
      socket.emit(
        'HOST/END_DAY_FAILED',
        { error: 'This game is not in the "day" status.' }
      );
      return;
    }

    const { deceased } = game;
    let newlyDeceased = [];
    let { villagers, werewolves } = game;
    const topVillagerPicks = modeOfArray(Object.values(game.villagerPicks));

    if (topVillagerPicks && topVillagerPicks.length === 1) {
      topVillagerPicks.forEach(pick => {
        newlyDeceased.push(pick);
        deceased.push(pick);
        villagers = villagers.filter(player => player !== pick);
        werewolves = werewolves.filter(player => player !== pick);
      });
    }

    let win;
    if (werewolves.length + 1 >= villagers.length) {
      win = 'werewolves-win';
    } else if (werewolves.length === 0) {
      win = 'villagers-win';
    }
    
    if (win) {
      if (await Game.endRound(gameName, win, deceased, villagers, werewolves)) {
        io.in(`${gameName}-players`).emit('PLAYER/ROUND_ENDED', { win });
        socket.emit('HOST/ROUND_ENDED', { win, newlyDeceased });
      } else {
        socket.emit(
          'HOST/END_DAY_FAILED',
          { error: 'An error occurred trying to end round. Please try again.' }
        );
      }
    } else {
      if (await Game.endDay(gameName, deceased, villagers, werewolves)) {
        if (newlyDeceased.length) {
          newlyDeceased.forEach(player => {
            const newlyDeceasedSocketId = game.players[player].socketId;
            // TODO might need to know which role they were to remoteLeave from the correct room
            remoteLeave(newlyDeceasedSocketId, `${gameName}-villagers`);
            remoteLeave(newlyDeceasedSocketId, `${gameName}-werewolves`);
            io.to(newlyDeceasedSocketId).emit('PLAYER/DECEASED');  
          });
        }
        socket
          .to(`${gameName}-villagers`)
          .to(`${gameName}-werewolves`)
          .emit('PLAYER/DAY_ENDED');
        socket.emit('HOST/DAY_ENDED', { newlyDeceased });
      } else {
        socket.emit(
          'HOST/END_DAY_FAILED',
          { error: 'An error occurred trying to end day. Please try again.' }
        );
      }
    }

  });

});

const makeId = () => {
  let id = '';
  const possible = 'abcdefghijklmnopqrstuvwxyz';
  for (var i = 0; i < 5; i++) {
    id += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return id;
};

const modeOfArray = (array) => {
  if (array.length == 0) {
    return null;
  }

  let modeMap = {},
      maxCount = 1, 
      modes = [];

  array.forEach(el => {
    if (modeMap[el] == null) {
      modeMap[el] = 1;
    } else {
      modeMap[el]++;
    }

    if (modeMap[el] > maxCount) {
      modes = [el];
      maxCount = modeMap[el];
    } else if (modeMap[el] == maxCount) {
      modes.push(el);
      maxCount = modeMap[el];
    }
  });

  return modes;
};

const remoteJoin = (socketId, room) =>
  new Promise((resolve, reject) => {
    io.of('/').adapter.remoteJoin(socketId, room, (error) => {
      if (error) {
        reject('Failed to join room', socketId, room, error);
      } else {
        resolve();
      }
    });
  });

const remoteLeave = (socketId, room) =>
  new Promise((resolve, reject) => {
    io.of('/').adapter.remoteLeave(socketId, room, (error) => {
      if (error) {
        reject('Failed to leave room', socketId, room, error);
      } else {
        resolve();
      }
    });
  });


module.exports = server;
