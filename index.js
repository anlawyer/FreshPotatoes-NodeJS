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
    let query =
    `SELECT id
    ,genre_id AS genreID
    ,release_date AS releaseDate
    ,date(release_date, '+15 years') AS upperYear
    ,date(release_date, '-15 years') AS lowerYear
    FROM films
    WHERE id = ?`;

    sqlite.all(query, filmID)
      .then(function (response) {
        let filmObj = response[0];
        console.log(filmObj);
        let genreID = filmObj.genreID;
        let upperYear = filmObj.upperYear;
        let lowerYear = filmObj.lowerYear;
        sqlite.all(`SELECT * FROM films WHERE genre_id = ? AND release_date BETWEEN ? AND ?`,
          [genreID, lowerYear, upperYear])
          .then(function (response) {
            let filmArray = response;
            let filmReviewsArray = [];
            // happens once for each film that matches the query
            for (let i = 0; i < filmArray.length; i++) {
              // each id from the films that match the query above
              let filmID = filmArray[i].id;
              // call API for each film
              request.get(thirdPartyURL + filmID,
                function (error, response, body) {
                  if (error) throw error;
                  // gets reviews for the specific film
                  let filmReviews = JSON.parse(body)[0].reviews;
                  // set total to 0, for each film
                  let total = 0;
                  // if number of reviews for said film is greater than 5
                  if (filmReviews.length >= 5) {
                    // ===== look at each review for the film =====
                    filmReviews.forEach(function (review) {
                      // add each rating to the total
                      total += review.rating;
                      console.log('review rating', review.rating);
                    });
                    // take the newly computed total, and divide by the total number of reviews to get average
                    console.log('average of reviews', total/filmReviews.length);
                    // if the average is greater than 4.0, push the whole review object to the array
                    // filmReviewsArray.push(filmReviews);
                  }
                })
            }
          })
      })
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
