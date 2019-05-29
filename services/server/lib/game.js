var AWS = require('aws-sdk');
var config = require('./config');

function Game() {
  this.dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: config.REGION,
    endpoint: config.DYNAMODB_ENDPOINT
  });
  this.tableName = `${config.ENV_NAME}_Games`;
}
module.exports = new Game();

/**
  * Creates game.
  *
  * @param {object} game
  *   @param {string} game.name
  *   @param {object} game.host
  *     @param {string} game.host.id
  * 
  * @return {boolean} success
**/
Game.prototype.create = async function(game) {
  try {
    await this.dynamoDB.put({
      TableName: this.tableName,
      Item: {
        name: game.name,
        gameStatus: 'waiting-for-players',
        host: game.host,
        players: {},
        createdOn: Date.now()
      }
    }).promise();
  } catch (e) {
    console.error('Error creating game', e);
    return false;
  }
  return true;
};

/**
  * Gets game by game id.
  *
  * @param {string} gameId
  * 
  * @return {Object} game
**/
Game.prototype.get = async function(gameId) {
  let game;
  try {
    game = await (this.dynamoDB.get({
      TableName: this.tableName,
      Key: {
        name: gameId
      }
    }).promise());
  } catch (e) {
    console.error('Error getting game', e);
    return false;
  }
  return game && game.Item;
}

/**
 * Gets all games.
 * 
 * @return {array} games
 */
Game.prototype.getAll = async function() {
  let games;
  try {
    games = await (this.dynamoDB.scan({
      TableName: this.tableName
    }).promise());
  } catch (e) {
    console.error('Error getting games', e);
    return false;
  }
  return games;
}

/**
  * Deletes game.
  *
  * @param {string} gameId
  * 
  * @return {boolean} success
**/
Game.prototype.delete = async function(gameId) {
  try {
    await this.dynamoDB.delete({
      TableName: this.tableName,
      Key: {
        name: gameId
      }
    }).promise();
  } catch (e) {
    console.log('Error deleting game', e);
    return false;
  }
  return true;
};

/**
  * Adds player to game.
  *
  * @param {string} gameId
  * @param {string} playerName
  * @param {object} player
  * 
  * @return {boolean} success
**/
Game.prototype.addPlayer = async function(gameId, playerName, player) {
  try {
    await (this.dynamoDB.update({
      TableName: this.tableName,
      Key: {
        name: gameId
      },
      UpdateExpression: 'SET players.#playerName = :player',
      ExpressionAttributeNames: {
        '#playerName': playerName
      },
      ExpressionAttributeValues: {
        ':player': player
      }
    }).promise());
  } catch (e) {
    console.error('Error adding player to game', e);
    return false;
  }
  return true;
}

/**
  * Starts game at round 1.
  *
  * @param {string} gameId
  * 
  * @return {boolean} success
**/
Game.prototype.startGame = async function(gameId) {
  try {
    await (this.dynamoDB.update({
      TableName: this.tableName,
      Key: {
        name: gameId
      },
      UpdateExpression: 'SET gameStatus = :gameStatus, round = :round',
      ExpressionAttributeValues: {
        ':gameStatus': 'started-game',
        ':round': 1
      }
    }).promise());
  } catch (e) {
    console.error('Error starting game', e);
    return false;
  }
  return true;
}

/**
  * Starts the round by setting game status to 'intro-to-round' and initializing the villagers, werewolves, and deceased.
  *
  * @param {string} gameId
  * @param {array} villagers
  * @param {array} werewolves
  * 
  * @return {boolean} success
**/
Game.prototype.startRound = async function(gameId, villagers, werewolves) {
  try {
    await (this.dynamoDB.update({
      TableName: this.tableName,
      Key: {
        name: gameId
      },
      UpdateExpression: `SET gameStatus = :gameStatus, 
                             villagers = :villagers, 
                             werewolves = :werewolves,
                             deceased = :deceased`,
      ExpressionAttributeValues: {
        ':gameStatus': 'intro-to-round',
        ':villagers': villagers,
        ':werewolves': werewolves,
        ':deceased': []
      }
    }).promise());
  } catch (e) {
    console.error('Error starting round', e);
    return false;
  }
  return true;
}

/**
  * Sets the status to "night".
  *
  * @param {string} gameId
  * 
  * @return {boolean} success
**/
Game.prototype.startNight = async function(gameId) {
  try {
    await (this.dynamoDB.update({
      TableName: this.tableName,
      Key: {
        name: gameId
      },
      UpdateExpression: `SET gameStatus = :gameStatus`,
      ExpressionAttributeValues: {
        ':gameStatus': 'night'
      }
    }).promise());
  } catch (e) {
    console.error('Error starting night', e);
    return false;
  }
  return true;
}

/**
  * Sets the status to "collecting-werewolves-picks" and initializes werewolfPicks.
  *
  * @param {string} gameId
  * 
  * @return {boolean} success
**/
Game.prototype.startWerewolvesPicks = async function(gameId) {
  try {
    await (this.dynamoDB.update({
      TableName: this.tableName,
      Key: {
        name: gameId
      },
      UpdateExpression: `SET gameStatus = :gameStatus,
                             werewolfPicks = :werewolfPicks`,
      ExpressionAttributeValues: {
        ':gameStatus': 'collecting-werewolves-picks',
        ':werewolfPicks': {}
      }
    }).promise());
  } catch (e) {
    console.error('Error starting werewolves picking', e);
    return false;
  }
  return true;
}

/**
  * Submits werewolf's pick.
  *
  * @param {string} gameId
  * @param {string} playerName
  * @param {string} pick
  * 
  * @return {boolean} success
**/
Game.prototype.submitWerewolfPick = async function(gameId, playerName, pick) {
  try {
    await (this.dynamoDB.update({
      TableName: this.tableName,
      Key: {
        name: gameId
      },
      UpdateExpression: 'SET werewolfPicks.#playerName = :pick',
      ExpressionAttributeNames: {
        '#playerName': playerName
      },
      ExpressionAttributeValues: {
        ':pick': pick
      }
    }).promise());
  } catch (e) {
    console.error('Error submitting werewolf pick', e);
    return false;
  }
  return true;
}

/**
  * Sets the status to "ended-werewolves-picks".
  *
  * @param {string} gameId
  * 
  * @return {boolean} success
**/
Game.prototype.endWerewolvesPicks = async function(gameId) {
  try {
    await (this.dynamoDB.update({
      TableName: this.tableName,
      Key: {
        name: gameId
      },
      UpdateExpression: 'SET gameStatus = :gameStatus',
      ExpressionAttributeValues: {
        ':gameStatus': 'ended-werewolves-picks'
      }
    }).promise());
  } catch (e) {
    console.error('Error ending werewolves picking', e);
    return false;
  }
  return true;
}

/**
  * Sets the status to "day" and updates deceased and villagers.
  *
  * @param {string} gameId
  * @param {array} deceased
  * @param {array} villagers
  * 
  * @return {boolean} success
**/
Game.prototype.startDay = async function(gameId, deceased, villagers) {
  try {
    await (this.dynamoDB.update({
      TableName: this.tableName,
      Key: {
        name: gameId
      },
      UpdateExpression: `SET gameStatus = :gameStatus,
                             deceased = :deceased,
                             villagers = :villagers,
                             villagerPicks = :villagerPicks`,
      ExpressionAttributeValues: {
        ':gameStatus': 'day',
        ':deceased': deceased,
        ':villagers': villagers,
        ':villagerPicks': {}
      }
    }).promise());
  } catch (e) {
    console.error('Error starting day', e);
    return false;
  }
  return true;
}

/**
  * Submits villager's pick.
  *
  * @param {string} gameId
  * @param {string} playerName
  * @param {string} pick
  * 
  * @return {boolean} success
**/
Game.prototype.submitVillagerPick = async function(gameId, playerName, pick) {
  try {
    await (this.dynamoDB.update({
      TableName: this.tableName,
      Key: {
        name: gameId
      },
      UpdateExpression: 'SET villagerPicks.#playerName = :pick',
      ExpressionAttributeNames: {
        '#playerName': playerName
      },
      ExpressionAttributeValues: {
        ':pick': pick
      }
    }).promise());
  } catch (e) {
    console.error('Error submitting villager pick', e);
    return false;
  }
  return true;
}

/**
  * Sets the status to a win condition and updates deceased, villagers, and werewolves.
  *
  * @param {string} gameId
  * @param {string} win
  * @param {array} deceased
  * @param {array} villagers
  * @param {array} werewolves
  * 
  * @return {boolean} success
**/
Game.prototype.endRound = async function(gameId, win, deceased, villagers, werewolves) {
  try {
    await (this.dynamoDB.update({
      TableName: this.tableName,
      Key: {
        name: gameId
      },
      UpdateExpression: `SET gameStatus = :gameStatus,
                             deceased = :deceased,
                             villagers = :villagers,
                             werewolves = :werewolves`,
      ExpressionAttributeValues: {
        ':gameStatus': win,
        ':deceased': deceased,
        ':villagers': villagers,
        ':werewolves': werewolves
      }
    }).promise());
  } catch (e) {
    console.error('Error ending round', e);
    return false;
  }
  return true;
}
