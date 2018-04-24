const sqlite = require('sqlite');
// const Sequelize = require('sequelize');
// const request = require('request');
const rp = require('request-promise');
const express = require('express');
const app = express();
const thirdPartyURL = 'http://credentials-api.generalassemb.ly/4576f55f-c427-4cfc-a11c-5bfe914ca6c1?films=';

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
  const filmRecommendationObj = {
    recommendations: [],
    meta: {
      limit: 10,
      offset: 0
    }
  };
  const recArray = [];

  let filmID = req.params.id;
  let limitQuery = req.query.limit;
  let offsetQuery = req.query.offset;

  if (isNaN(parseInt(filmID)) || filmID === undefined) {
    res.status(422).send({message: 'Invalid film ID'}).end();
  }

  if (limitQuery !== undefined) {
    let limitNum = parseInt(limitQuery);
    if (isNaN(limitNum)) {
      res.status(422).send({message: 'Invalid limit query'}).end();
    } else {
      filmRecommendationObj.meta.limit = limitNum;
    }
  }

  if (offsetQuery !== undefined) {
    let offsetNum = parseInt(offsetQuery);
    if (isNaN(offsetNum)) {
      res.status(422).send({message: 'Invalid offset query'}).end();
    } else {
      filmRecommendationObj.meta.offset = offsetNum;
    }
  }

  try {
    const query =
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
        let genreID = filmObj.genreID;
        let upperYear = filmObj.upperYear;
        let lowerYear = filmObj.lowerYear;
        // query for all films that have same genre and were releaseed +/-15 yrs of queried film
        sqlite.all(`SELECT * FROM films WHERE genre_id = ? AND release_date BETWEEN ? AND ?`,
          [genreID, lowerYear, upperYear])
          .then(function (response) {
            // response is an array of all the films that match the query
            return Promise.all(
              response.map(function (film) {
                let filmID = film.id;
                return rp(thirdPartyURL + filmID)
                  .then(function (response) {
                    let matchedFilm = JSON.parse(response)[0];
                    let total = 0;
                    if (matchedFilm.reviews.length >= 5) {
                      matchedFilm.reviews.forEach(function (review) {
                        total += review.rating;
                      });
                      // take the summed total, and divide by the total number of reviews to get average
                      let averageRating = total / matchedFilm.reviews.length;
                      // if the average is greater than 4.0, push ID to an array for querying later
                      if (averageRating > 4.0) {
                        let averageRatingStr = averageRating.toFixed(1);
                        let partialObj = {
                          id: matchedFilm.film_id,
                          averageRating: parseFloat(averageRatingStr),
                          reviews: matchedFilm.reviews.length
                        };
                        filmRecommendationObj.recommendations.push(partialObj);
                      }
                    }
                    return filmRecommendationObj;
                  });
              }));
          })
          .then(function (response) {
            const query =
            `SELECT
            title as filmTitle
            ,genres.name AS genreName
            ,release_date AS releaseDate
            FROM films
            JOIN genres ON films.genre_id = genres.id
            WHERE films.id = ?`;
            let filmsToRecommend = response[0];
            console.log(filmsToRecommend);
            for (let i = 0; i < filmsToRecommend.recommendations.length; i++) {
              let filmID = filmsToRecommend.recommendations[i].id;
              let partialFilmObj = filmsToRecommend.recommendations[i];
              console.log(partialFilmObj);
              sqlite.all(query, filmID)
                .then(function (response) {
                  let finalFilmObj = Object.assign(partialFilmObj, response[0]);
                  console.log(finalFilmObj);
                  filmRecommendationObj.recommendations.push(finalFilmObj);
                  console.log(filmRecommendationObj);
                });
              // res.status(200).send(filmRecommendationObj).end();
            }
          })
          .catch(function (err) {
            console.log(err);
          });
      });
  } catch (err) {
    next(err);
  }
}

// ROUTES
app.get('/films', getAllFilms);
app.get('/films/:id/recommendations', getFilmRecommendations);
app.get('*', function (req, res) {
  res.status(404).send({message: 'invalid route'}).end();
});

// START SERVER
Promise.resolve()
  .then(() => sqlite.open(DB_PATH, { Promise }))
  .then(() => app.listen(PORT, () => console.log(`App listening on port ${PORT}`)))
  .catch((err) => { if (NODE_ENV === 'development') console.error(err.stack); });

module.exports = app;
