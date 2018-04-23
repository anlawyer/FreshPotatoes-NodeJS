const sqlite = require('sqlite');
// const Sequelize = require('sequelize');
const request = require('request');
// const rp = require('request-promise');
const express = require('express');
const app = express();

const {PORT = 3000, NODE_ENV = 'development', DB_PATH = './db/database.db'} = process.env;

// ROUTE HANDLER
function getAllFilms (req, res, next) {
  try {
    const query = 'SELECT * FROM films';
    sqlite.all(query)
      .then(function (response) {
        res.status(200).send(response);
      });
  } catch (err) {
    next(err);
  }
}

function getFilmRecommendations (req, res, next) {
  let filmID = req.params.id;
  // check if ID is in the DB, if not, return 422 error

  try {
    // let limitNum = req.query.limit;
    // make sure returned array takes into account the limit and offset
    const thirdPartyURL = 'http://credentials-api.generalassemb.ly/4576f55f-c427-4cfc-a11c-5bfe914ca6c1?films=';
    const query =
    `SELECT id
    ,genre_id AS genreID
    ,release_date AS releaseDate
    ,date(release_date, '+15 years') AS upperYear
    ,date(release_date, '-15 years') AS lowerYear
    FROM films
    WHERE id = ?`;

    let filmRecommendationArray = [];
    sqlite.all(query, filmID)
      .then(function (response) {
        let filmObj = response[0];
        // console.log(filmObj);
        let genreID = filmObj.genreID;
        let upperYear = filmObj.upperYear;
        let lowerYear = filmObj.lowerYear;
        // query for all films that have same genre and were releaseed +-15 yrs of queried film
        sqlite.all(`SELECT * FROM films WHERE genre_id = ? AND release_date BETWEEN ? AND ?`,
          [genreID, lowerYear, upperYear])
          .then(function (response) {
            // response is an array of all the films that match the query
            let filmsArray = response;
            // happens once for each film in the array
            for (let i = 0; i < filmsArray.length; i++) {
              // each id from the films that match the query above
              let filmID = filmsArray[i].id;
              // call API for each film
              request.get(thirdPartyURL + filmID,
                function (error, response, body) {
                  if (error) throw error;
                  // gets array of reviews out of response array of the specific film
                  let matchedFilm = JSON.parse(body)[0];
                  // set total to 0, for specific film (to use for average calculation)
                  let total = 0;
                  // console.log(matchedFilm);
                  // if number of reviews for this film is greater than 5
                  if (matchedFilm.reviews.length >= 5) {
                    // look at each review for the film
                    matchedFilm.reviews.forEach(function (review) {
                      // add each rating to the total
                      total += review.rating;
                    });
                    // take the newly computed total, and divide by the total number of reviews to get average
                    let average = total / matchedFilm.reviews.length;
                    // if the average is greater than 4.0, push the whole review object to the array
                    if (average > 3.0) {
                      filmRecommendationArray.push(matchedFilm.film_id);
                    }
                  }
                });
            }
          })
          .then(res.status(200).send(filmRecommendationArray));
        // return recommendation array
        // add meta key, with limit and offset keys (from req.query)
      });
  } catch (err) {
    next(err);
  }
}

// ROUTES
app.get('/films', getAllFilms);
app.get('/films/:id/recommendations', getFilmRecommendations);
// return 404 error if route DNE

// START SERVER
Promise.resolve()
  .then(() => sqlite.open(DB_PATH, { Promise }))
  .then(() => app.listen(PORT, () => console.log(`App listening on port ${PORT}`)))
  .catch((err) => { if (NODE_ENV === 'development') console.error(err.stack); });

module.exports = app;
