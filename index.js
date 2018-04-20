const sqlite = require('sqlite');
// const Sequelize = require('sequelize');
const request = require('request');
const express = require('express');
const app = express();

const {PORT = 3000, NODE_ENV = 'development', DB_PATH = './db/database.db'} = process.env;

// ROUTE HANDLER
function getAllFilms (req, res, next) {
  try {
    let query = 'SELECT * FROM films';
    sqlite.all(query)
      .then(function (response) {
        res.status(200).send(response);
      });
  } catch (err) {
    next(err);
  }
}

function getFilmRecommendations (req, res, next) {
  try {
    let filmID = req.params.id;
    let limitNum = req.query.limit;
    const thirdPartyURL = 'http://credentials-api.generalassemb.ly/4576f55f-c427-4cfc-a11c-5bfe914ca6c1?films=';
    let query = 'SELECT * FROM films WHERE id = ? LIMIT ?';
    sqlite.all(query, [filmID, limitNum])
      // .then(function (response) {
      //   // res.status(200).send(response);
      // })
      .then(
        request
        .get(thirdPartyURL + filmID,
          function (error, response, body) {
            if (error) throw error;
            res.json(body);
          })
        );
  } catch (err) {
    next(err);
  }
}

// ROUTES
app.get('/films', getAllFilms);
app.get('/films/:id/recommendations', getFilmRecommendations);

// START SERVER
Promise.resolve()
  .then(() => sqlite.open(DB_PATH, { Promise }))
  .then(() => app.listen(PORT, () => console.log(`App listening on port ${PORT}`)))
  .catch((err) => { if (NODE_ENV === 'development') console.error(err.stack); });

module.exports = app;
