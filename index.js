const sqlite = require('sqlite');
// const Sequelize = require('sequelize');
const request = require('request');
const express = require('express');
const app = express();

const {PORT = 3000, NODE_ENV = 'development', DB_PATH = './db/database.db'} = process.env;

// ROUTE HANDLER
function getFilmRecommendations (req, res, next) {
  try {
    sqlite.all('SELECT * FROM artists LIMIT 10;')
      .then(function (response) {
        res.status(200).send(response);
      });
  } catch (err) {
    next(err);
  }
}

// ROUTES
app.get('/films/:id/recommendations', getFilmRecommendations);

// START SERVER
Promise.resolve()
  .then(() => sqlite.open(DB_PATH, { Promise }))
  .then(() => app.listen(PORT, () => console.log(`App listening on port ${PORT}`)))
  .catch((err) => { if (NODE_ENV === 'development') console.error(err.stack); });

module.exports = app;
